import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const GESTOR = "a0000000-0000-0000-0000-00000000000a";
const COLAB = "c0000000-0000-0000-0000-00000000000c";
const A = "a1000000-0000-0000-0000-00000000000a"; // na planilha
const B = "b1000000-0000-0000-0000-00000000000b"; // ativo, fora da planilha
const S = "51000000-0000-0000-0000-000000000005"; // suspenso, mas na planilha
await db.exec(`insert into auth.users (id, email) values ('${GESTOR}', 'g@x'), ('${COLAB}', 'c@x');
  update public.profiles set papel = 'gestor', ativo = true where id = '${GESTOR}';
  update public.profiles set papel = 'colaborador', ativo = true where id = '${COLAB}';
  insert into public.clientes (id, documento, razao_social, regime, status) values
    ('${A}', '11111111000111', 'Cliente A', 'simples', 'ativo'),
    ('${B}', '22222222000122', 'Cliente B', 'simples', 'ativo'),
    ('${S}', '33333333000133', 'Cliente S', 'simples', 'suspenso');`);

const n = async (sql) => (await db.query(sql)).rows[0].n;
const como = async (id, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};

// Sem planilha: clientes ativos, como antes.
check("sem planilha: enfileira os ativos", (await n(`select public.enfileirar_det_interno() as n`)) === 2);
await db.exec(`delete from public.det_consultas`);

// Colaborador não envia planilha; gestor envia.
check(
  "colaborador não envia planilha",
  (await erro(() => como(COLAB, `insert into public.det_planilhas (arquivo_nome, linhas, validas) values ('x.xlsx', 1, 1)`))) !== null,
);
const planilha = (await como(GESTOR, `insert into public.det_planilhas (arquivo_nome, linhas, validas) values ('Fechamento.xlsx', 3, 2) returning id`)).rows[0].id;
await como(GESTOR, `insert into public.det_empresas (planilha_id, aba_origem, codigo, empresa, documento, cliente_id, problema) values
  ('${planilha}', 'Com Variaveis', '434', 'Cliente A', '11111111000111', '${A}', null),
  ('${planilha}', 'Sem Variaveis', '99', 'Cliente S', '33333333000133', '${S}', null),
  ('${planilha}', 'Com Variaveis', '', 'Sem CNPJ', '6339207400', null, 'CNPJ incompleto na planilha')`);

check("com planilha: enfileira só as empresas dela, mesmo suspensas", (await n(`select public.enfileirar_det_interno() as n`)) === 2);
check("cliente fora da planilha não entra", (await n(`select count(*)::int n from public.det_consultas where cliente_id = '${B}'`)) === 0);

// Botão Iniciar
check("colaborador não inicia o robô", (await erro(() => como(COLAB, `select public.enfileirar_det()`))) !== null);
await db.exec(`delete from public.det_consultas`);
check("gestor inicia o robô (origem manual)", (await como(GESTOR, `select public.enfileirar_det() as n`)).rows[0].n === 2);
check("origem fica como manual", (await n(`select count(*)::int n from public.det_consultas where origem = 'manual'`)) === 2);

// Painel com a aba de origem
const [q] = (await db.query(`select * from public.reservar_det(1)`)).rows;
await db.query(`select public.registrar_det_resultados($1::jsonb)`, [JSON.stringify([{ id: q.id, status: "concluida", avisos: [] }])]);
const p = (await db.query(`select aba_origem from public.det_painel where cliente_id = '${q.cliente_id}'`)).rows[0];
check("painel traz a aba de origem", p?.aba_origem === (q.cliente_id === A ? "Com Variaveis" : "Sem Variaveis"), JSON.stringify(p));

// Planilha nova substitui a anterior
const nova = (await como(GESTOR, `insert into public.det_planilhas (arquivo_nome, linhas, validas, enviada_em) values ('Nova.xlsx', 1, 1, now() + interval '1 minute') returning id`)).rows[0].id;
await como(GESTOR, `insert into public.det_empresas (planilha_id, empresa, documento, cliente_id) values ('${nova}', 'Cliente B', '22222222000122', '${B}')`);
check("planilha atual é a mais nova", (await n(`select (public.det_planilha_atual() = '${nova}')::int as n`)) === 1);
await db.exec(`delete from public.det_consultas where status = 'na_fila'`);
check("fila passa a seguir a planilha nova", (await n(`select public.enfileirar_det_interno() as n`)) === 1 && (await n(`select count(*)::int n from public.det_consultas where cliente_id = '${B}'`)) === 1);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
