import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const DP = "d0000000-0000-0000-0000-00000000000d"; // colaborador do Pessoal
const FISCAL = "f0000000-0000-0000-0000-00000000000f"; // colaborador de outro departamento
const GESTOR = "e0000000-0000-0000-0000-00000000000e";
const CLI = "c0000000-0000-0000-0000-00000000000c";
await db.exec(`insert into auth.users (id, email) values ('${DP}', 'dp@x'), ('${FISCAL}', 'fiscal@x'), ('${GESTOR}', 'gestor@x');
  update public.profiles set papel = 'colaborador', ativo = true where id in ('${DP}', '${FISCAL}');
  update public.profiles set papel = 'gestor', ativo = true where id = '${GESTOR}';
  insert into public.profile_departamentos (profile_id, departamento_id)
    select '${DP}', id from public.departamentos where nome = 'Pessoal';
  insert into public.profile_departamentos (profile_id, departamento_id)
    select '${FISCAL}', id from public.departamentos where nome = 'Fiscal';
  insert into public.clientes (id, documento, razao_social, regime, status) values ('${CLI}', '04045560000113', 'Zevoli', 'simples', 'ativo');`);

const como = async (id, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};

const leitura = (await como(DP, `insert into public.ponto_leituras (cliente_id, competencia) values ('${CLI}', '2026-08-01') returning id, enviada_por`)).rows[0];
check("DP cria a leitura, em nome próprio", Boolean(leitura?.id) && leitura.enviada_por === DP);
check("competência precisa ser o dia 1", (await erro(() => db.exec(`insert into public.ponto_leituras (competencia) values ('2026-08-15')`))) !== null);

const dias = JSON.stringify([{ data: "2026-08-03", marcacoes: [{ hora: "06:48", manual: false }, { hora: "12:01", manual: false }], ocorrencia: null }]);
await como(DP, `insert into public.ponto_fichas (leitura_id, nome, cpf, dias) values ('${leitura.id}', 'ADRIANA', '28889269898', '${dias}')`);
check("ficha guarda os dias em jsonb", (await db.query(`select jsonb_array_length(dias) n from public.ponto_fichas`)).rows[0].n === 1);

check("outro departamento não vê as leituras", (await como(FISCAL, `select count(*)::int n from public.ponto_leituras`)).rows[0].n === 0);
check("outro departamento não vê as fichas", (await como(FISCAL, `select count(*)::int n from public.ponto_fichas`)).rows[0].n === 0);
check("outro departamento não cria leitura", (await erro(() => como(FISCAL, `insert into public.ponto_leituras (competencia) values ('2026-08-01')`))) !== null);
check("gestor vê as fichas", (await como(GESTOR, `select count(*)::int n from public.ponto_fichas`)).rows[0].n === 1);

await como(DP, `insert into public.ponto_funcionarios (cliente_id, nome, cpf) values ('${CLI}', 'ADRIANA', '28889269898')`);
check(
  "funcionário não se repete pelo CPF no cliente",
  (await erro(() => como(DP, `insert into public.ponto_funcionarios (cliente_id, nome, cpf) values ('${CLI}', 'ADRIANA G', '28889269898')`))) !== null,
);
check("CPF só com 11 dígitos", (await erro(() => db.exec(`insert into public.ponto_funcionarios (cliente_id, nome, cpf) values ('${CLI}', 'X', '123')`))) !== null);

await como(DP, `delete from public.ponto_leituras where id = '${leitura.id}'`);
check("apagar a leitura leva as fichas", (await db.query(`select count(*)::int n from public.ponto_fichas`)).rows[0].n === 0);
check("bucket privado criado", (await db.query(`select public from storage.buckets where id = 'ponto'`)).rows[0]?.public === false);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
