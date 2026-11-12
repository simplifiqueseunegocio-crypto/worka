import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const ADMIN = "00000000-0000-0000-0000-000000000001";
const GESTOR = "00000000-0000-0000-0000-000000000002";
const COLAB = "00000000-0000-0000-0000-000000000003";
const A = "a0000000-0000-0000-0000-00000000000a"; // vem do Domínio
const B = "b0000000-0000-0000-0000-00000000000b"; // saiu do Domínio (suspenso pela sincronização)
const M = "d0000000-0000-0000-0000-00000000000d"; // cadastrado à mão, sem código do Domínio

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const status = async (id) => (await db.query(`select status from public.clientes where id = '${id}'`)).rows[0]?.status;

await db.exec(`insert into auth.users (id, email) values
  ('${ADMIN}', 'admin@mcont.com.br'), ('${GESTOR}', 'gestor@mcont.com.br'), ('${COLAB}', 'colab@mcont.com.br');
  update public.profiles set ativo = true;
  update public.profiles set papel = 'gestor' where id = '${GESTOR}';
  insert into public.integracao_execucoes (iniciado_em, status) values (now() - interval '1 day', 'sucesso');
  insert into public.clientes (id, documento, razao_social, regime, codigo_dominio, sincronizado_em, status) values
    ('${A}', '11111111000111', 'Cliente A', 'simples', 10, now() - interval '1 day', 'ativo'),
    ('${B}', '22222222000122', 'Cliente B', 'simples', 20, now() - interval '30 days', 'suspenso');
  insert into public.clientes (id, documento, razao_social, regime, status) values
    ('${M}', '33333333000133', 'Cliente M', 'simples', 'ativo');`);

// A sincronização do Domínio grava status = 'ativo' em quem recebe.
const sincronizar = (id) => db.query(`update public.clientes set status = 'ativo', sincronizado_em = now() where id = '${id}'`);

// Suspensão manual resiste à sincronização
const suspender = (id) => `update public.clientes set status = 'suspenso', status_manual = true, status_alterado_em = clock_timestamp() where id = '${id}'`;
await as(COLAB, () => db.query(suspender(A)));
check("colaborador não suspende", (await status(A)) === "ativo");
await as(GESTOR, () => db.query(suspender(A)));
check("gestor suspende", (await status(A)) === "suspenso");
await sincronizar(A);
check("sincronização não reativa quem foi suspenso à mão", (await status(A)) === "suspenso");
await as(GESTOR, () => db.query(`update public.clientes set status = 'encerrado', status_alterado_em = clock_timestamp() where id = '${A}'`));
check("com status manual, a equipe troca de suspenso para encerrado", (await status(A)) === "encerrado");

// Exclusão
const excluir = (id) => db.query(`delete from public.clientes where id = '${id}'`);
check("ainda no Domínio: exclusão bloqueada", (await as(ADMIN, () => erro(() => excluir(A)))) !== null);
check("cliente ativo: exclusão bloqueada", (await as(ADMIN, () => erro(() => excluir(M)))) !== null);
await as(GESTOR, () => excluir(B));
check("gestor não exclui", (await status(B)) === "suspenso");
check("admin exclui quem saiu do Domínio", (await as(ADMIN, () => erro(() => excluir(B)))) === null && !(await status(B)));
await as(ADMIN, () => db.query(suspender(M)));
check("admin exclui cliente sem código do Domínio, depois de suspenso", (await as(ADMIN, () => erro(() => excluir(M)))) === null && !(await status(M)));

// Reativar libera a sincronização de novo
await as(GESTOR, () => db.query(`update public.clientes set status = 'ativo', status_manual = false, status_alterado_em = clock_timestamp() where id = '${A}'`));
check("reativar volta o cliente para ativo", (await status(A)) === "ativo");
await db.query(`update public.clientes set status = 'suspenso' where id = '${A}'`);
check("sem status manual, a sincronização volta a mandar", (await status(A)) === "suspenso");

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
