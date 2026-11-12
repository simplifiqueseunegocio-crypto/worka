import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const COLAB = "c0000000-0000-0000-0000-00000000000c";
const GESTOR = "e0000000-0000-0000-0000-00000000000e";
const NOVO = "a0000000-0000-0000-0000-00000000000a";
const CLI = "b0000000-0000-0000-0000-00000000000b";
await db.exec(`insert into auth.users (id, email) values ('${COLAB}', 'c@x'), ('${GESTOR}', 'g@x'), ('${NOVO}', 'n@x');
  update public.profiles set papel = 'colaborador', ativo = true where id = '${COLAB}';
  update public.profiles set papel = 'gestor', ativo = true where id = '${GESTOR}';
  update public.profiles set papel = 'colaborador', ativo = false where id = '${NOVO}';
  insert into public.clientes (id, documento, razao_social, regime, status) values ('${CLI}', '04045560000113', 'Zevoli', 'simples', 'ativo');`);

const como = async (id, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};

const v = (await como(COLAB, `insert into public.vencimentos (cliente_id, tipo, descricao, vence_em) values ('${CLI}', 'certificado_digital', 'e-CNPJ A1', '2026-12-01') returning id, criado_por, avisar_dias`)).rows[0];
check("colaborador cadastra vencimento, em nome próprio", v?.criado_por === COLAB && v.avisar_dias === 30);
check("usuário inativo não cadastra", (await erro(() => como(NOVO, `insert into public.vencimentos (tipo, descricao, vence_em) values ('alvara', 'x', '2026-12-01')`))) !== null);
check("tipo desconhecido é recusado", (await erro(() => db.exec(`insert into public.vencimentos (tipo, descricao, vence_em) values ('carro', 'x', '2026-12-01')`))) !== null);
check("aviso entre 1 e 180 dias", (await erro(() => db.exec(`insert into public.vencimentos (tipo, descricao, vence_em, avisar_dias) values ('alvara', 'x', '2026-12-01', 0)`))) !== null);
check("vencimento do escritório (sem cliente)", Boolean((await como(GESTOR, `insert into public.vencimentos (tipo, descricao, vence_em) values ('certificado_digital', 'A1 MCONT', '2027-09-16') returning id`)).rows[0]?.id));

await db.exec(`update public.vencimentos set ultimo_marco = 15, ultimo_aviso_em = now() where id = '${v.id}'`);
await db.exec(`update public.vencimentos set observacao = 'renovar com o cliente' where id = '${v.id}'`);
check("editar sem mudar a data mantém o marco avisado", (await db.query(`select ultimo_marco from public.vencimentos where id = '${v.id}'`)).rows[0].ultimo_marco === 15);
await como(COLAB, `update public.vencimentos set vence_em = '2027-12-01' where id = '${v.id}'`);
const renovado = (await db.query(`select ultimo_marco, ultimo_aviso_em from public.vencimentos where id = '${v.id}'`)).rows[0];
check("renovar (data nova) volta a avisar desde o início", renovado.ultimo_marco === null && renovado.ultimo_aviso_em === null);

check("colaborador não exclui", (await como(COLAB, `delete from public.vencimentos where id = '${v.id}' returning id`)).rows.length === 0);
check("gestor exclui", (await como(GESTOR, `delete from public.vencimentos where id = '${v.id}' returning id`)).rows.length === 1);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
