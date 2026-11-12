import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const U1 = "00000000-0000-0000-0000-000000000001"; // admin
const U2 = "00000000-0000-0000-0000-000000000002"; // colaborador

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function servico(fn) {
  await db.exec("set role service_role");
  try { return await fn(); } finally { await db.exec("reset role"); }
}
const n = async (sql) => (await db.query(sql)).rows[0].n;

await db.exec(`insert into auth.users (id, email) values
  ('${U1}', 'admin@mcont.com.br'), ('${U2}', 'colab@mcont.com.br');
  update public.profiles set ativo = true;`);

// A: ativo com busca · B: ativo sem busca · C: suspenso com busca
await db.exec(`insert into public.clientes (id, documento, razao_social, regime, status, busca_cnd, uf, codigo_municipio) values
  ('a0000000-0000-0000-0000-00000000000a', '11111111000111', 'Cliente A', 'simples', 'ativo', true, 'SP', 100),
  ('b0000000-0000-0000-0000-00000000000b', '22222222000122', 'Cliente B', 'simples', 'ativo', false, 'SP', 100),
  ('c0000000-0000-0000-0000-00000000000c', '33333333000133', 'Cliente C', 'simples', 'suspenso', true, 'RJ', 200);
  update public.clientes set municipio = 'SAO JOSE DO RIO PRETO' where uf = 'SP';
  insert into public.cnd_cobertura (tipo, uf, municipio) values ('municipal', 'SP', 'São José do Rio Preto');`); // A e B: cobertura completa (nome com acento bate)
const A = "a0000000-0000-0000-0000-00000000000a";
const B = "b0000000-0000-0000-0000-00000000000b";

// Tipos automáticos: a trabalhista (captcha do TST) fica fora da rodada
const soAutomaticos = (await db.query(`select public.enfileirar_cnd_interno() as q`)).rows[0].q;
const tiposNaFila = (await db.query(`select array_agg(distinct tipo::text order by tipo::text) t from public.cnd_consultas`)).rows[0].t;
check("rodada enfileira só os tipos automáticos", soAutomaticos === 4 && tiposNaFila.join() === "estadual,federal,fgts,municipal", JSON.stringify(tiposNaFila));
const tiposUsuario = await as(U2, () => erro(() => db.query(`update public.cnd_tipos set automatico = true`)));
const tiposMudaram = (await db.query(`select count(*)::int n from public.cnd_tipos where automatico`)).rows[0].n;
check("só o admin liga tipos automáticos", tiposUsuario === null && tiposMudaram === 4, tiposMudaram);
await db.exec(`delete from public.cnd_consultas; update public.cnd_tipos set automatico = true;`);

// Enfileiramento
const qtd = (await db.query(`select public.enfileirar_cnd_interno() as q`)).rows[0].q;
check("rodada enfileira as 5 certidões só de ativos com busca ligada", qtd === 5, qtd);
const deNovo = (await db.query(`select public.enfileirar_cnd_interno() as q`)).rows[0].q;
check("enfileirar de novo não duplica consulta em aberto", deNovo === 0, deNovo);

// Permissões
const colabCarteira = await as(U2, () => erro(() => db.query(`select public.enfileirar_cnd()`)));
check("colaborador não consulta a carteira inteira", colabCarteira?.includes("admin ou gestor"), colabCarteira);
await db.exec(`update public.clientes set busca_cnd = true where id = '${B}'`);
const colabUm = await as(U2, () => db.query(`select public.enfileirar_cnd('${B}') as q`));
check("colaborador consulta um cliente", colabUm.rows[0].q === 5, colabUm.rows[0].q);
const origem = (await db.query(`select origem, solicitada_por from public.cnd_consultas where cliente_id = '${B}' limit 1`)).rows[0];
check("consulta manual registra origem e solicitante", origem.origem === "manual" && origem.solicitada_por === U2);
const reservar = await as(U2, () => erro(() => db.query(`select * from public.reservar_cnd(1)`)));
check("usuário não reserva lote do worker", reservar?.includes("permission denied"), reservar);
const inserir = await as(U1, () => erro(() => db.query(`insert into public.cnd_consultas (cliente_id, tipo) values ('${A}', 'federal')`)));
check("nem o admin grava direto na fila", inserir !== null, inserir);
const leitura = await as(U2, () => n(`select count(*)::int n from public.cnd_consultas`));
check("equipe lê as consultas", leitura === 10, leitura);

// Worker
const lote = await servico(() => db.query(`select * from public.reservar_cnd(4)`));
check("worker reserva o lote pedido", lote.rows.length === 4, lote.rows.length);
check("lote vem com os dados do cliente", lote.rows[0].documento === "11111111000111" && lote.rows[0].uf === "SP");
check("reserva conta a tentativa", lote.rows.every((r) => r.tentativas === 1));
const segundo = await servico(() => db.query(`select * from public.reservar_cnd(100)`));
check("segundo lote não repete as reservadas", segundo.rows.length === 6, segundo.rows.length);
await db.exec(`update public.cnd_consultas set iniciada_em = now() - interval '20 minutes' where id = ${lote.rows[0].id}`);
const presa = await servico(() => db.query(`select * from public.reservar_cnd(100)`));
check("consulta presa há mais de 15 min volta a ser reservada", presa.rows.length === 1 && presa.rows[0].tentativas === 2);

// Reserva por tipo: cada rotina pega só as suas
await db.exec(`update public.cnd_consultas set status = 'na_fila', iniciada_em = null, tentativas = 0 where status = 'processando';`);
const soFederal = await servico(() => db.query(`select * from public.reservar_cnd(100, 'federal')`));
check("reserva filtrada traz só o tipo pedido", soFederal.rows.length === 2 && soFederal.rows.every((r) => r.tipo === "federal"), soFederal.rows.length);
const resto = await servico(() => db.query(`select * from public.reservar_cnd(100)`));
check("sem filtro reserva os demais tipos", resto.rows.length === 8 && !resto.rows.some((r) => r.tipo === "federal"), resto.rows.length);

// Resultados devolvidos pelo worker
const [r1, r2, r3] = resto.rows;
const gravar = (lista) =>
  servico(() => db.query(`select public.registrar_cnd_resultados($1::jsonb) as r`, [JSON.stringify(lista)]));
const g = (await gravar([
  { id: r1.id, status: "pendente", mensagem: "Débito de ICMS" },
  { id: r2.id, status: "erro", mensagem: "Site fora do ar", repetir: true },
  { id: r3.id, status: "erro", mensagem: "Município não suportado" },
  { id: 999999, status: "regular" },
])).rows[0].r;
check("worker grava resultados e devolve à fila o que deve repetir", g.gravadas === 2 && g.repetir === 1, JSON.stringify(g));
const st = async (id) => (await db.query(`select status, processada_em, mensagem from public.cnd_consultas where id = ${id}`)).rows[0];
check("pendência gravada com mensagem", (await st(r1.id)).status === "pendente" && (await st(r1.id)).mensagem === "Débito de ICMS");
check("erro temporário volta para a fila", (await st(r2.id)).status === "na_fila" && (await st(r2.id)).processada_em === null);
check("erro definitivo fica como erro", (await st(r3.id)).status === "erro");
const naHora = await servico(() => db.query(`select id from public.reservar_cnd(100) where id = ${r2.id}`));
check("consulta devolvida não volta na mesma execução", naHora.rows.length === 0);
await db.exec(`update public.cnd_consultas set disponivel_em = now() - interval '1 minute' where id = ${r2.id}`);
const depois = await servico(() => db.query(`select id from public.reservar_cnd(100) where id = ${r2.id}`));
check("depois de 1 hora a consulta volta a ser reservada", depois.rows.length === 1);
await db.exec(`update public.cnd_consultas set status = 'na_fila' where id = ${r2.id}`);
const regravar = (await gravar([{ id: r1.id, status: "regular" }])).rows[0].r;
check("resultado de consulta já finalizada é ignorado", regravar.gravadas === 0 && (await st(r1.id)).status === "pendente");
await db.exec(`update public.cnd_consultas set status = 'processando', tentativas = 3 where id = ${r2.id}`);
await gravar([{ id: r2.id, status: "erro", mensagem: "Site fora do ar", repetir: true }]);
check("após 3 tentativas o erro é definitivo", (await st(r2.id)).status === "erro");
const usuarioGrava = await as(U1, () => erro(() => db.query(`select public.registrar_cnd_resultados('[]')`)));
check("usuário não grava resultados do worker", usuarioGrava?.includes("permission denied"), usuarioGrava);

// Resultados e painel
await db.exec(`
  update public.cnd_consultas set status = 'regular', processada_em = now() - interval '1 day' where cliente_id = '${A}';
  update public.cnd_consultas set status = 'regular', processada_em = now() where cliente_id = '${B}';
  update public.cnd_consultas set status = 'pendente', mensagem = 'Débito de ISS'
    where cliente_id = '${B}' and tipo = 'municipal';`);
const painel = await as(U2, () => db.query(`select * from public.cnd_painel order by razao_social`));
const pA = painel.rows.find((r) => r.cliente_id === A);
const pB = painel.rows.find((r) => r.cliente_id === B);
check("painel lista os clientes monitorados", painel.rows.length === 3, painel.rows.length);
check("cliente sem pendência fica regular", pA.situacao === "regular" && pA.federal === "regular" && pA.pendencias === 0);
check("uma certidão pendente marca o cliente", pB.situacao === "pendente" && pB.municipal === "pendente" && pB.pendencias === 1);
check("painel traz a mensagem da certidão", pB.mensagens?.municipal === "Débito de ISS", JSON.stringify(pB.mensagens));
check("cliente nunca consultado aparece sem consulta", painel.rows.find((r) => r.razao_social === "Cliente C").situacao === "sem_consulta");

// Nova consulta: o painel usa a mais recente; a fila em aberto aparece
await db.exec(`select public.enfileirar_cnd_interno('${B}')`);
const pB2 = (await db.query(`select situacao, na_fila from public.cnd_painel where cliente_id = '${B}'`)).rows[0];
check("nova consulta na fila não apaga a última situação", pB2.situacao === "pendente" && pB2.na_fila === true);
await db.exec(`update public.cnd_consultas set status = 'regular', processada_em = now() + interval '1 minute'
  where cliente_id = '${B}' and status = 'na_fila'`);
const pB3 = (await db.query(`select situacao, na_fila from public.cnd_painel where cliente_id = '${B}'`)).rows[0];
check("resultado mais recente substitui o anterior", pB3.situacao === "regular" && pB3.na_fila === false, JSON.stringify(pB3));

// Sob demanda: só os clientes selecionados, origem 'manual', mesmo sem a busca ligada
await db.exec(`delete from public.cnd_consultas; update public.clientes set busca_cnd = false;`);
const C = "c0000000-0000-0000-0000-00000000000c"; // suspenso
const sel = await as(U2, () => db.query(`select public.enfileirar_cnd_selecionados(array['${A}','${C}']::uuid[]) as q`));
const naFila = (await db.query(`select cliente_id, origem, solicitada_por from public.cnd_consultas`)).rows;
check("selecionados entram na fila sem a busca ligada", sel.rows[0].q === 5 && naFila.every((r) => r.cliente_id === A), sel.rows[0].q);
check("cliente suspenso selecionado fica de fora", !naFila.some((r) => r.cliente_id === C));
check("pedido selecionado tem origem manual e solicitante", naFila.every((r) => r.origem === "manual" && r.solicitada_por === U2));
await db.exec(`select public.enfileirar_cnd_interno('${B}', 'agendada', null)`); // B não tem busca: nada entra
await db.exec(`update public.clientes set busca_cnd = true where id = '${B}'; select public.enfileirar_cnd_interno('${B}', 'agendada', null);`);
const soManual = await servico(() => db.query(`select * from public.reservar_cnd(100, null, 'manual')`));
check("reserva por origem traz só os pedidos manuais", soManual.rows.length === 5 && soManual.rows.every((r) => r.cliente_id === A), soManual.rows.length);
const soAgendada = await servico(() => db.query(`select * from public.reservar_cnd(100, 'federal', 'agendada')`));
check("rodada agendada continua separada", soAgendada.rows.length === 1 && soAgendada.rows[0].cliente_id === B, soAgendada.rows.length);
const vazio = await as(U2, () => db.query(`select public.enfileirar_cnd_selecionados(array[]::uuid[]) as q`));
check("seleção vazia não faz nada", vazio.rows[0].q === 0);

// Contagem do worker: o que pode ser reservado agora, sem reservar
await db.exec(`delete from public.cnd_consultas; select public.enfileirar_cnd_interno('${B}', 'agendada', null);`);
await db.exec(`update public.cnd_consultas set disponivel_em = now() + interval '1 hour' where tipo = 'fgts'`);
const contar = () => servico(() => db.query(`select tipo::text, origem, quantidade from public.contar_cnd_pendentes() order by tipo::text`));
const contagem = (await contar()).rows;
check("contagem traz por tipo e origem o que pode ser reservado", contagem.map((r) => `${r.tipo}:${r.origem}:${r.quantidade}`).join() ===
  "estadual:agendada:1,federal:agendada:1,municipal:agendada:1,trabalhista:agendada:1", JSON.stringify(contagem)); // fgts só daqui a 1 hora
const naoReservou = await n(`select count(*)::int n from public.cnd_consultas where status = 'processando'`);
check("contar não reserva nenhuma consulta", naoReservou === 0, naoReservou);
const usuarioConta = await as(U2, () => erro(() => db.query(`select * from public.contar_cnd_pendentes()`)));
check("usuário não usa a contagem do worker", usuarioConta?.includes("permission denied"), usuarioConta);

// Cobertura: estadual e municipal só para a UF e o município com rotina pronta
const D = "d0000000-0000-0000-0000-00000000000d"; // MG: só federal e FGTS
const E = "e0000000-0000-0000-0000-00000000000e"; // SP, município sem rotina: sem municipal
await db.exec(`delete from public.cnd_consultas;
  update public.cnd_tipos set automatico = (tipo <> 'trabalhista');
  update public.clientes set busca_cnd = true, status = 'ativo' where id = '${A}';
  insert into public.clientes (id, documento, razao_social, regime, status, busca_cnd, uf, codigo_municipio) values
    ('${D}', '44444444000144', 'Cliente D', 'simples', 'ativo', true, 'MG', 300),
    ('${E}', '55555555000155', 'Cliente E', 'simples', 'ativo', true, 'SP', 400);
  select public.enfileirar_cnd_interno(null, 'agendada', null);`);
const tiposDe = async (id) => (await db.query(`select string_agg(tipo::text, ',' order by tipo::text) t from public.cnd_consultas where cliente_id = '${id}'`)).rows[0].t;
check("cliente de outra UF não entra na estadual nem na municipal", (await tiposDe(D)) === "federal,fgts", await tiposDe(D));
check("cliente de município sem rotina não entra na municipal", (await tiposDe(E)) === "estadual,federal,fgts", await tiposDe(E));
check("cliente coberto entra nas quatro", (await tiposDe(A)) === "estadual,federal,fgts,municipal", await tiposDe(A));
await db.exec(`delete from public.cnd_consultas`);
await as(U2, () => db.query(`select public.enfileirar_cnd_selecionados(array['${D}']::uuid[])`));
check("seleção também respeita a cobertura", (await tiposDe(D)) === "federal,fgts", await tiposDe(D));
await db.exec(`insert into public.cnd_consultas (cliente_id, tipo, status, processada_em, mensagem) values
  ('${D}', 'estadual', 'erro', now(), 'SIDEB: documento não encontrado'),
  ('${D}', 'federal', 'regular', now(), null)`);
const painelD = (await as(U2, () => db.query(`select estadual, municipal, federal, erros, situacao from public.cnd_painel where cliente_id = '${D}'`))).rows[0];
check("painel mostra sem cobertura e não conta o erro antigo",
  painelD.estadual === "sem_cobertura" && painelD.municipal === "sem_cobertura" && painelD.erros === 0 && painelD.situacao === "regular", JSON.stringify(painelD));
const novaCobertura = await as(U2, () => erro(() => db.query(`insert into public.cnd_cobertura (tipo, uf) values ('estadual', 'MG')`)));
check("só admin muda a cobertura", novaCobertura !== null, novaCobertura);
await as(U1, () => db.query(`insert into public.cnd_cobertura (tipo, uf) values ('estadual', 'MG')`));
const painelMG = (await as(U2, () => db.query(`select estadual, erros from public.cnd_painel where cliente_id = '${D}'`))).rows[0];
check("ao cobrir a UF, o resultado volta a aparecer", painelMG.estadual === "erro" && painelMG.erros === 1, JSON.stringify(painelMG));

// Fila municipal por cidade: a rotina de uma prefeitura só reserva os clientes dela
const J = "f0000000-0000-0000-0000-00000000000f"; // Jaci
await db.exec(`delete from public.cnd_consultas;
  insert into public.cnd_cobertura (tipo, uf, municipio) values ('municipal', 'SP', 'JACI');
  insert into public.clientes (id, documento, razao_social, regime, status, busca_cnd, uf, codigo_municipio, municipio) values
    ('${J}', '66666666000166', 'Cliente J', 'simples', 'ativo', true, 'SP', 500, 'JACI');
  select public.enfileirar_cnd_interno(null, 'agendada', null);`);
const contarLugar = (uf, mun) => servico(() => db.query(`select quantidade from public.contar_cnd_pendentes(${uf}, ${mun}) where tipo = 'municipal'`));
const contaJaci = (await contarLugar("'sp'", "'Jací'")).rows[0]?.quantidade;
const contaTudo = (await contarLugar("null", "null")).rows[0]?.quantidade;
check("contagem filtra o município (sem acento nem maiúsculas)", contaJaci === 1 && contaTudo === 3, `${contaJaci}/${contaTudo}`);
const doRio = await servico(() => db.query(`select cliente_id, municipio from public.reservar_cnd(50, 'municipal', null, 'SP', 'Sao Jose do Rio Preto')`));
check("Rio Preto reserva só os clientes de Rio Preto", doRio.rows.length === 2 && doRio.rows.every((r) => r.municipio === "SAO JOSE DO RIO PRETO"), JSON.stringify(doRio.rows)); // A e B
const deJaci = await servico(() => db.query(`select cliente_id, municipio from public.reservar_cnd(50, 'municipal', null, 'SP', 'JACI')`));
check("Jaci reserva só o cliente de Jaci e devolve o município", deJaci.rows.length === 1 && deJaci.rows[0].cliente_id === J && deJaci.rows[0].municipio === "JACI", JSON.stringify(deJaci.rows));
const outraUf = await servico(() => db.query(`select id from public.reservar_cnd(50, null, null, 'MG', null)`));
check("filtro por UF sem município", outraUf.rows.length === 3, outraUf.rows.length); // federal, FGTS e estadual (MG coberta acima) do cliente D
const usuarioReservaLugar = await as(U2, () => erro(() => db.query(`select * from public.reservar_cnd(1, null, null, 'SP', 'JACI')`)));
check("usuário não reserva por município", usuarioReservaLugar?.includes("permission denied"), usuarioReservaLugar);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
