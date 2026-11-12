import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const ADMIN = "a0000000-0000-0000-0000-00000000000a";
const COLAB = "c0000000-0000-0000-0000-00000000000c";
const CLI = "11111111-0000-0000-0000-000000000001";
await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'admin@x'), ('${COLAB}', 'colab@x');
  update public.profiles set papel = 'admin', ativo = true where id = '${ADMIN}';
  update public.profiles set papel = 'colaborador', ativo = true where id = '${COLAB}';
  insert into public.clientes (id, documento, razao_social, regime) values ('${CLI}', '11111111000111', 'Cliente', 'simples');`);

const dep = (await db.query(`select id from public.departamentos where nome = 'Fiscal'`)).rows[0].id;
const obr = (await db.query(`insert into public.obrigacoes (nome, departamento_id, dia_vencimento, regimes) values ('DAS', ${dep}, 20, '{simples}') returning id`)).rows[0].id;
const tarefa = (await db.query(`insert into public.tarefas (cliente_id, obrigacao_id, departamento_id, competencia, prazo_legal, prazo_meta, status)
  values ('${CLI}', ${obr}, ${dep}, '2026-10-01', '2026-11-20', '2026-11-18', 'aguardando_cliente') returning id`)).rows[0].id;
const desde = async () => (await db.query(`select aguardando_desde from public.tarefas where id = '${tarefa}'`)).rows[0].aguardando_desde;

// --- aguardando_desde
check("criada aguardando: marca desde quando", (await desde()) !== null);
await db.exec(`update public.tarefas set aguardando_desde = '2026-11-01' where id = '${tarefa}'`);
await db.exec(`update public.tarefas set observacao = 'x' where id = '${tarefa}'`);
check("outra alteração não mexe na data", new Date(await desde()).toISOString().startsWith("2026-11-01"));
await db.exec(`update public.tarefas set status = 'em_andamento' where id = '${tarefa}'`);
check("saiu de aguardando: limpa a data", (await desde()) === null);
await db.exec(`update public.tarefas set status = 'aguardando_cliente' where id = '${tarefa}'`);
const volta = await desde();
check("voltou a aguardar: recomeça a contagem", volta !== null && !new Date(volta).toISOString().startsWith("2026-11-01"));

// --- RLS
const comoUsuario = async (id, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
await db.exec(`insert into public.tarefa_lembretes (tarefa_id, profile_id) values ('${tarefa}', '${COLAB}');
  insert into public.cliente_receita (cliente_id, situacao) values ('${CLI}', 'ATIVA');
  insert into public.receita_alertas (cliente_id, campo, de, para) values ('${CLI}', 'situacao', 'ATIVA', 'INAPTA');`);

const n = async (id, tabela) => (await comoUsuario(id, `select count(*)::int as n from public.${tabela}`)).rows[0].n;
check("lembretes: admin lê", (await n(ADMIN, "tarefa_lembretes")) === 1);
check("lembretes: colaborador não lê", (await n(COLAB, "tarefa_lembretes")) === 0);
check("foto da Receita: equipe lê", (await n(COLAB, "cliente_receita")) === 1);
check("alertas da Receita: equipe lê", (await n(COLAB, "receita_alertas")) === 1);
check(
  "alertas da Receita: ninguém grava pela API pública",
  (await erro(() => comoUsuario(ADMIN, `insert into public.receita_alertas (cliente_id, campo) values ('${CLI}', 'cnae')`))) !== null,
);
check(
  "campo de alerta inválido é recusado",
  (await erro(() => db.exec(`insert into public.receita_alertas (cliente_id, campo) values ('${CLI}', 'telefone')`))) !== null,
);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
