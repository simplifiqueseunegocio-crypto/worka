import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const DP = "d0000000-0000-0000-0000-00000000000d";
const FISCAL = "f0000000-0000-0000-0000-00000000000f";
const CLI = "c0000000-0000-0000-0000-00000000000c";
await db.exec(`insert into auth.users (id, email) values ('${DP}', 'dp@x'), ('${FISCAL}', 'fiscal@x');
  update public.profiles set papel = 'colaborador', ativo = true where id in ('${DP}', '${FISCAL}');
  insert into public.profile_departamentos (profile_id, departamento_id) select '${DP}', id from public.departamentos where nome = 'Pessoal';
  insert into public.profile_departamentos (profile_id, departamento_id) select '${FISCAL}', id from public.departamentos where nome = 'Fiscal';
  insert into public.clientes (id, documento, razao_social, regime, status) values ('${CLI}', '04045560000113', 'Zevoli', 'simples', 'ativo');`);

const como = async (id, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};

const leitura = (await como(DP, `insert into public.documentos_leituras (tipo, cliente_id) values ('atestado', '${CLI}') returning id`)).rows[0];
check("DP cria leitura de atestado", Boolean(leitura?.id));
check("tipo só com letras minúsculas", (await erro(() => db.exec(`insert into public.documentos_leituras (tipo) values ('Atestado!')`))) !== null);
check("fiscal não cria leitura de atestado", (await erro(() => como(FISCAL, `insert into public.documentos_leituras (tipo) values ('atestado')`))) !== null);
check("tipo sem regra própria: só gestor/admin", (await erro(() => como(DP, `insert into public.documentos_leituras (tipo) values ('nfse')`))) !== null);

const dados = JSON.stringify({ funcionario_nome: "ADRIANA", dias: 2, data_inicio: "2026-08-06" });
const item = (await como(DP, `insert into public.documentos_itens (leitura_id, dados) values ('${leitura.id}', '${dados}') returning id`)).rows[0];
check("DP grava o item extraído", Boolean(item?.id));
check("fiscal não vê os itens do atestado", (await como(FISCAL, `select count(*)::int n from public.documentos_itens`)).rows[0].n === 0);
check("fiscal não vê as leituras de atestado", (await como(FISCAL, `select count(*)::int n from public.documentos_leituras`)).rows[0].n === 0);

const func = (await como(DP, `insert into public.ponto_funcionarios (cliente_id, nome) values ('${CLI}', 'ADRIANA') returning id`)).rows[0].id;
await como(DP, `insert into public.pessoal_afastamentos (cliente_id, funcionario_id, inicio, fim, dias, origem_item_id) values ('${CLI}', '${func}', '2026-08-06', '2026-08-07', 2, '${item.id}')`);
check(
  "mesmo afastamento não é lançado duas vezes",
  (await erro(() => como(DP, `insert into public.pessoal_afastamentos (cliente_id, funcionario_id, inicio, fim, dias) values ('${CLI}', '${func}', '2026-08-06', '2026-08-07', 2)`))) !== null,
);
check("fim antes do início é recusado", (await erro(() => db.exec(`insert into public.pessoal_afastamentos (cliente_id, funcionario_id, inicio, fim) values ('${CLI}', '${func}', '2026-08-10', '2026-08-09')`))) !== null);
check("fiscal não vê afastamentos", (await como(FISCAL, `select count(*)::int n from public.pessoal_afastamentos`)).rows[0].n === 0);

await como(DP, `delete from public.documentos_leituras where id = '${leitura.id}'`);
check("apagar a leitura leva os itens", (await db.query(`select count(*)::int n from public.documentos_itens`)).rows[0].n === 0);
check("afastamento lançado continua (sem a origem)", (await db.query(`select origem_item_id from public.pessoal_afastamentos`)).rows[0]?.origem_item_id === null);
check("bucket privado criado", (await db.query(`select public from storage.buckets where id = 'documentos'`)).rows[0]?.public === false);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
