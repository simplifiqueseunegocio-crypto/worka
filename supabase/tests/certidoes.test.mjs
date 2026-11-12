import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const ADMIN = "00000000-0000-0000-0000-000000000001";
const GESTOR = "00000000-0000-0000-0000-000000000002";
const ANA = "00000000-0000-0000-0000-000000000003"; // colaboradora
const BIA = "00000000-0000-0000-0000-000000000004"; // colaboradora
const C = "c0000000-0000-0000-0000-00000000000c";

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const um = async (sql) => (await db.query(sql)).rows[0];

await db.exec(`insert into auth.users (id, email) values
  ('${ADMIN}', 'admin@mcont.com.br'), ('${GESTOR}', 'gestor@mcont.com.br'),
  ('${ANA}', 'ana@mcont.com.br'), ('${BIA}', 'bia@mcont.com.br');
  update public.profiles set ativo = true;
  update public.profiles set papel = 'gestor' where id = '${GESTOR}';
  update public.cnd_tipos set automatico = true;
  insert into public.clientes (id, documento, razao_social, regime, busca_cnd, uf, municipio)
    values ('${C}', '11111111000111', 'Cliente C', 'simples', true, 'SP', 'SAO JOSE DO RIO PRETO');`);

// Catálogo
check("catálogo começa com os 5 tipos automáticos", (await um(`select count(*)::int n from public.certidao_tipos where cnd_tipo is not null`)).n === 5);
const novoTipo = `insert into public.certidao_tipos (nome, orgao, validade_dias) values ('Falência', 'TJ-SP', 30)`;
check("colaborador não cria tipo", (await as(ANA, () => erro(() => db.query(novoTipo)))) !== null);
check("admin cria tipo", (await as(ADMIN, () => erro(() => db.query(novoTipo)))) === null);
await as(ADMIN, () => db.query(`delete from public.certidao_tipos where cnd_tipo = 'federal'`));
check("tipo automático não é excluído", (await um(`select count(*)::int n from public.certidao_tipos where cnd_tipo = 'federal'`)).n === 1);
const mudaVinculo = await as(ADMIN, () => erro(() => db.query(`update public.certidao_tipos set cnd_tipo = 'fgts' where nome = 'Falência'`)));
check("vínculo com a consulta automática não muda", mudaVinculo !== null);

// Escolha por cliente: FGTS desligado sai da fila e vira 'dispensada'
const fgts = (await um(`select id from public.certidao_tipos where cnd_tipo = 'fgts'`)).id;
const desligar = `insert into public.cliente_certidao_tipos (cliente_id, tipo_id, acompanha) values ('${C}', ${fgts}, false)`;
check("colaborador não muda os tipos do cliente", (await as(ANA, () => erro(() => db.query(desligar)))) !== null);
await db.exec(`select public.enfileirar_cnd_interno('${C}')`);
check("antes de desligar, o FGTS entra na fila", (await um(`select count(*)::int n from public.cnd_consultas where tipo = 'fgts'`)).n === 1);
check("gestor desliga o FGTS do cliente", (await as(GESTOR, () => erro(() => db.query(desligar)))) === null);
check("FGTS na fila sai ao desligar", (await um(`select count(*)::int n from public.cnd_consultas where tipo = 'fgts'`)).n === 0);
await db.exec(`select public.enfileirar_cnd_interno('${C}')`);
check("rodada não enfileira o FGTS desligado", (await um(`select count(*)::int n from public.cnd_consultas where tipo = 'fgts'`)).n === 0);
await db.exec(`insert into public.cnd_consultas (cliente_id, tipo, status, processada_em) values ('${C}', 'fgts', 'pendente', now())`);
const painel = await um(`select fgts, pendencias from public.cnd_painel where cliente_id = '${C}'`);
check("painel mostra 'dispensada' e não conta a pendência", painel.fgts === "dispensada" && painel.pendencias === 0, JSON.stringify(painel));

// Certidões lançadas
const falencia = (await um(`select id from public.certidao_tipos where nome = 'Falência'`)).id;
const lancar = (uid, extra = "") => `insert into public.certidoes (cliente_id, tipo_id, situacao, emitida_em, valida_ate, arquivo_path, criado_por)
  values ('${C}', ${falencia}, 'negativa', '2026-11-09', '2026-12-09', '${C}/${uid}.pdf', '${uid}')${extra}`;
check("colaboradora lança certidão", (await as(ANA, () => erro(() => db.query(lancar(ANA))))) === null);
check("não lança em nome de outra pessoa", (await as(BIA, () => erro(() => db.query(lancar(ANA))))) !== null);
const validadeInvertida = await as(ANA, () => erro(() => db.query(`insert into public.certidoes (cliente_id, tipo_id, situacao, emitida_em, valida_ate, criado_por)
  values ('${C}', ${falencia}, 'negativa', '2026-11-09', '2026-11-01', '${ANA}')`)));
check("validade antes da emissão é recusada", validadeInvertida !== null);
await as(BIA, () => db.query(`delete from public.certidoes`));
check("outra colaboradora não exclui", (await um(`select count(*)::int n from public.certidoes`)).n === 1);
await as(ADMIN, () => db.query(`delete from public.certidao_tipos where id = ${falencia}`)).catch(() => {});
check("tipo com certidão lançada não é excluído", (await um(`select count(*)::int n from public.certidao_tipos where id = ${falencia}`)).n === 1);

// PDF: só sai do Storage depois que a certidão é excluída
await db.exec(`insert into storage.objects (bucket_id, name) values ('certidoes', '${C}/${ANA}.pdf')`);
await as(ANA, () => db.query(`delete from storage.objects where name = '${C}/${ANA}.pdf'`));
check("PDF de certidão existente não é apagado", (await um(`select count(*)::int n from storage.objects`)).n === 1);
await as(ANA, () => db.query(`delete from public.certidoes`));
check("quem lançou exclui a certidão", (await um(`select count(*)::int n from public.certidoes`)).n === 0);
await as(ANA, () => db.query(`delete from storage.objects where name = '${C}/${ANA}.pdf'`));
check("depois disso o PDF sai", (await um(`select count(*)::int n from storage.objects`)).n === 0);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
