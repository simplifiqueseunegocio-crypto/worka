import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const DP = "d0000000-0000-0000-0000-000000000001";
const A = "a0000000-0000-0000-0000-00000000000a"; // com aviso
const B = "b0000000-0000-0000-0000-00000000000b"; // sem procuração
const C = "c0000000-0000-0000-0000-00000000000c"; // suspenso: fora da fila
await db.exec(`insert into auth.users (id, email) values ('${DP}', 'dp@x');
  update public.profiles set ativo = true where id = '${DP}';
  insert into public.clientes (id, documento, razao_social, regime, status) values
    ('${A}', '11111111000111', 'Cliente A', 'simples', 'ativo'),
    ('${B}', '22222222000122', 'Cliente B', 'simples', 'ativo'),
    ('${C}', '33333333000133', 'Cliente C', 'simples', 'suspenso');
  insert into public.cliente_responsaveis (cliente_id, departamento_id, profile_id)
    select '${A}', id, '${DP}' from public.departamentos where nome = 'Pessoal';`);

const um = async (sql) => (await db.query(sql)).rows[0];
const registrar = async (lista) => (await um(`select public.registrar_det_resultados('${JSON.stringify(lista).replace(/'/g, "''")}'::jsonb) as r`)).r;

// --- obrigação de sistema
const obrig = await um(`select id, sistema, regimes from public.obrigacoes where nome = 'Desconto de consignado (DET)'`);
check("obrigação de sistema criada, sem regimes", obrig?.sistema === true && obrig.regimes === "{}", JSON.stringify(obrig));
check("obrigação não vinculada a nenhum cliente", (await um(`select count(*)::int n from public.cliente_obrigacoes where obrigacao_id = ${obrig.id}`)).n === 0);
check(
  "obrigação de sistema não aceita regime",
  (await erro(() => db.exec(`update public.obrigacoes set regimes = '{simples}' where id = ${obrig.id}`))) !== null,
);

// --- fila
check("enfileira só os ativos", (await um(`select public.enfileirar_det_interno() as n`)).n === 2);
check("enfileirar de novo não duplica", (await um(`select public.enfileirar_det_interno() as n`)).n === 0);

const lote = (await db.query(`select * from public.reservar_det(10)`)).rows;
check("reserva o lote com o documento", lote.length === 2 && lote.every((l) => l.documento && l.tentativas === 1));
check("reservadas não voltam no próximo lote", (await db.query(`select * from public.reservar_det(10)`)).rows.length === 0);
const idA = lote.find((l) => l.cliente_id === A).id;
const idB = lote.find((l) => l.cliente_id === B).id;

// --- resultados
const avisosA = [
  { data: "2026-11-22", assunto: "Crédito do Trabalhador - consignado averbado", periodo_averbacao: "21/10 a 20/11", competencia_desconto: "2099-11", lida: false },
  { data: "2026-11-10", assunto: "Comunicado geral do eSocial", lida: true },
];
let r = await registrar([
  { id: idA, status: "concluida", avisos: avisosA },
  { id: idB, status: "sem_procuracao", mensagem: "Sem procuração eletrônica para este CNPJ." },
]);
check("grava as duas consultas", r.gravadas === 2, JSON.stringify(r));
check("guarda os dois avisos", r.avisos_novos === 2);
check("aviso de consignado vira uma tarefa", r.tarefas_criadas === 1);

const consultaA = await um(`select status, avisos, nao_lidas from public.det_consultas where id = ${idA}`);
check("consulta concluída com contagem de não lidas", consultaA.status === "concluida" && consultaA.avisos === 2 && consultaA.nao_lidas === 1);
check("sem procuração fica como pendência", (await um(`select status from public.det_consultas where id = ${idB}`)).status === "sem_procuracao");

const tarefa = await um(`select t.*, d.nome as dep from public.tarefas t join public.departamentos d on d.id = t.departamento_id where t.obrigacao_id = ${obrig.id}`);
check("tarefa no DP, para o responsável do cliente", tarefa.dep === "Pessoal" && tarefa.responsavel_id === DP && tarefa.cliente_id === A);
check("competência do desconto e prazo no fim do mês útil", new Date(tarefa.competencia).toISOString().startsWith("2099-11-01") && new Date(tarefa.prazo_legal).toISOString().startsWith("2099-11-30"), `${tarefa.competencia} ${tarefa.prazo_legal}`);
check("observação traz o aviso", /Crédito do Trabalhador/.test(tarefa.observacao) && /21\/10 a 20\/11/.test(tarefa.observacao));
check("aviso aponta para a tarefa", (await um(`select tarefa_id from public.det_avisos where consignado`)).tarefa_id === tarefa.id);
check("aviso comum não vira tarefa", (await um(`select tarefa_id from public.det_avisos where not consignado`)).tarefa_id === null);

// --- nova leitura: a mesma lista não duplica nada
await db.exec(`select public.enfileirar_det_interno('${A}')`);
const [novo] = (await db.query(`select * from public.reservar_det(10)`)).rows;
r = await registrar([{ id: novo.id, status: "concluida", avisos: avisosA }]);
check("mesma lista não gera aviso nem tarefa nova", r.avisos_novos === 0 && r.tarefas_criadas === 0, JSON.stringify(r));

// --- erro temporário e devolução
await db.exec(`select public.enfileirar_det_interno('${B}')`);
const [eb] = (await db.query(`select * from public.reservar_det(10)`)).rows;
r = await registrar([{ id: eb.id, status: "erro", repetir: true, mensagem: "DET fora do ar" }]);
check("erro temporário volta à fila", r.repetir === 1 && (await um(`select status from public.det_consultas where id = ${eb.id}`)).status === "na_fila");
await db.exec(`update public.det_consultas set disponivel_em = now() where id = ${eb.id}`);
const [eb2] = (await db.query(`select * from public.reservar_det(10)`)).rows;
r = await registrar([{ id: eb2.id, devolver: true }]);
const devolvida = await um(`select status, tentativas from public.det_consultas where id = ${eb.id}`);
check("devolver não gasta tentativa", r.devolvidas === 1 && devolvida.status === "na_fila" && devolvida.tentativas === 1, JSON.stringify(devolvida));

// --- visão por empresa (det_painel)
const painel = Object.fromEntries((await db.query(`select * from public.det_painel`)).rows.map((p) => [p.cliente_id, p]));
const pA = painel[A];
check("painel: uma linha por empresa lida", Object.keys(painel).length === 2 && !painel[C], Object.keys(painel).join());
check("painel: conta os avisos de consignado da 1ª página", pA.avisos_consignado === 1 && pA.avisos === 2 && pA.nao_lidas === 1, JSON.stringify(pA));
check("painel: tem consignado e último aviso", pA.tem_consignado === true && new Date(pA.ultimo_aviso).toISOString().startsWith("2026-11-22"));
check(
  "painel: aviso no ciclo quando cai no mês da leitura",
  pA.no_ciclo === (new Date(pA.competencia).toISOString().slice(0, 7) === "2026-11"),
);
check("painel: sem procuração aparece com o status", painel[B].status === "sem_procuracao" && painel[B].tem_consignado === false);

// --- RLS
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${DP}', false);`);
const vis = await um(`select (select count(*)::int from public.det_avisos) as a, (select count(*)::int from public.det_consultas) as c`);
const rpc = await erro(() => db.query(`select public.enfileirar_det_interno()`));
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
check("equipe lê avisos e consultas", vis.a === 2 && vis.c >= 3);
check("equipe não chama as funções do robô", rpc !== null);

// --- histórico: aviso de consignado de competência já fechada não vira tarefa
await db.exec(`select public.enfileirar_det_interno('${A}')`);
const [hist] = (await db.query(`select * from public.reservar_det(10)`)).rows;
r = await registrar([{ id: hist.id, status: "concluida", avisos: [...avisosA,
  { data: "2025-01-21", assunto: "Contratação de Empréstimo Consignado", competencia_desconto: "2025-02", lida: true }] }]);
check("aviso antigo de consignado fica só no histórico", r.avisos_novos === 1 && r.tarefas_criadas === 0, JSON.stringify(r));
check("aviso antigo guardado sem tarefa", (await um(`select tarefa_id from public.det_avisos where enviada_em = '2025-01-21'`)).tarefa_id === null);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
