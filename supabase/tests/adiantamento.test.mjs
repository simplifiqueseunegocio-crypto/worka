import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const ADMIN = "00000000-0000-0000-0000-000000000001";
const PESSOAL = "00000000-0000-0000-0000-000000000002"; // colaborador do Pessoal
const FISCAL = "00000000-0000-0000-0000-000000000003"; // colaborador do Fiscal
const C = "c0000000-0000-0000-0000-00000000000c";

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const n = async (sql) => (await db.query(sql)).rows[0].n;

await db.exec(`insert into auth.users (id, email) values
  ('${ADMIN}', 'admin@mcont.com.br'), ('${PESSOAL}', 'pessoal@mcont.com.br'), ('${FISCAL}', 'fiscal@mcont.com.br');
  update public.profiles set ativo = true;
  insert into public.profile_departamentos (profile_id, departamento_id)
    select '${PESSOAL}'::uuid, id from public.departamentos where nome = 'Pessoal'
    union all select '${FISCAL}'::uuid, id from public.departamentos where nome = 'Fiscal';
  insert into public.clientes (id, documento, razao_social, regime) values ('${C}', '11111111000111', 'Cliente C', 'simples');`);

const envio = (uid) => `insert into public.adiantamento_envios
  (cliente_id, competencia, arquivo_nome, arquivo_bytes, destinatarios, email_id, enviado_por)
  values ('${C}', '2026-11-01', 'folha.pdf', 1000, '{rh@cliente.com}', 're_1', '${uid}')`;

check("Pessoal registra envio", (await as(PESSOAL, () => erro(() => db.query(envio(PESSOAL))))) === null);
check("admin registra envio", (await as(ADMIN, () => erro(() => db.query(envio(ADMIN))))) === null);
check("Fiscal não registra envio", (await as(FISCAL, () => erro(() => db.query(envio(FISCAL))))) !== null);
check("não registra em nome de outro", (await as(PESSOAL, () => erro(() => db.query(envio(ADMIN))))) !== null);

const semResultado = `insert into public.adiantamento_envios (cliente_id, competencia, arquivo_nome, arquivo_bytes, destinatarios)
  values ('${C}', '2026-11-01', 'a.pdf', 1, '{}')`;
check("envio exige id do e-mail ou erro", (await as(ADMIN, () => erro(() => db.query(semResultado)))) !== null);

await as(PESSOAL, () => db.query(`update public.adiantamento_envios set erro = 'x'`));
await as(PESSOAL, () => db.query(`delete from public.adiantamento_envios`));
check("registro não muda nem some", (await n(`select count(*)::int n from public.adiantamento_envios where erro is null`)) === 2);

const contato = `insert into public.cliente_contatos (cliente_id, nome, email, recebe_adiantamento)
  values ('${C}', 'RH', 'rh@cliente.com', true)`;
check("Pessoal cadastra contato", (await as(PESSOAL, () => erro(() => db.query(contato)))) === null);
check("Fiscal (colaborador) não cadastra contato", (await as(FISCAL, () => erro(() => db.query(contato)))) !== null);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
if (placar.falhas) process.exit(1);
