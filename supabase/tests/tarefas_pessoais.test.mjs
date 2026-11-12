import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const ADMIN = "00000000-0000-0000-0000-000000000001";
const ANA = "00000000-0000-0000-0000-000000000002";
const BIA = "00000000-0000-0000-0000-000000000003";

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const linhas = async (sql) => (await db.query(sql)).rows;

await db.exec(`insert into auth.users (id, email) values
  ('${ADMIN}', 'admin@mcont.com.br'), ('${ANA}', 'ana@mcont.com.br'), ('${BIA}', 'bia@mcont.com.br');
  update public.profiles set ativo = true;`);

// Criação e privacidade
const criada = await as(ANA, () =>
  erro(() => db.query(`insert into public.tarefas_pessoais (titulo, prazo, recorrencia) values ('Conferir extratos', '2027-01-31', 'mensal')`)),
);
check("dono cria tarefa pessoal", criada === null, criada);
check("dia_base vem do prazo", (await linhas(`select dia_base from public.tarefas_pessoais`))[0].dia_base === 31);
check("outra pessoa não vê", (await as(BIA, () => linhas(`select id from public.tarefas_pessoais`))).length === 0);
check("nem o admin vê", (await as(ADMIN, () => linhas(`select id from public.tarefas_pessoais`))).length === 0);
await as(BIA, () => db.query(`update public.tarefas_pessoais set titulo = 'x'`));
await as(BIA, () => db.query(`delete from public.tarefas_pessoais`));
check("outra pessoa não altera nem exclui", (await linhas(`select titulo from public.tarefas_pessoais`))[0]?.titulo === "Conferir extratos");
const emNomeDeOutro = await as(BIA, () =>
  erro(() => db.query(`insert into public.tarefas_pessoais (dono_id, titulo, prazo) values ('${ANA}', 'x', '2027-01-01')`)),
);
check("não cria em nome de outro", emNomeDeOutro !== null);

// Repetição mensal: 31/01 → 28/02 → 31/03
const concluir = (prazo) =>
  as(ANA, () => db.query(`update public.tarefas_pessoais set concluida_em = now() where prazo = '${prazo}'`));
await concluir("2027-01-31");
await concluir("2027-02-28");
const prazos = (await linhas(`select prazo::text p from public.tarefas_pessoais order by prazo`)).map((r) => r.p);
check("mensal mantém o dia 31 nos meses seguintes", prazos.join() === "2027-01-31,2027-02-28,2027-03-31", prazos.join());

// Reabrir e concluir de novo não duplica a próxima
await as(ANA, () => db.query(`update public.tarefas_pessoais set concluida_em = null where prazo = '2027-01-31'`));
await concluir("2027-01-31");
check("reabrir e concluir não duplica", (await linhas(`select id from public.tarefas_pessoais`)).length === 3);

// Anual e sem repetição
await as(ANA, () => db.query(`insert into public.tarefas_pessoais (titulo, prazo, recorrencia) values
  ('Renovar certificado', '2027-02-28', 'anual'), ('Ligar para o banco', '2027-05-10', 'nenhuma')`));
await concluir("2027-05-10");
await as(ANA, () => db.query(`update public.tarefas_pessoais set concluida_em = now() where titulo = 'Renovar certificado'`));
const anual = (await linhas(`select prazo::text p from public.tarefas_pessoais where titulo = 'Renovar certificado' order by prazo`)).map((r) => r.p);
check("anual cai no mesmo dia do ano seguinte", anual.join() === "2027-02-28,2028-02-28", anual.join());
check("sem repetição não gera outra", (await linhas(`select id from public.tarefas_pessoais where titulo = 'Ligar para o banco'`)).length === 1);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
