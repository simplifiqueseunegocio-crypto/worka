import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const ANA = "00000000-0000-0000-0000-000000000002"; // colaboradora do Fiscal
const BIA = "00000000-0000-0000-0000-000000000003"; // colaboradora do Fiscal
const C = "c0000000-0000-0000-0000-00000000000c";

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const linhas = async (sql) => (await db.query(sql)).rows;

await db.exec(`insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@mcont.com.br'),
  ('${ANA}', 'ana@mcont.com.br'), ('${BIA}', 'bia@mcont.com.br');
  update public.profiles set ativo = true;
  insert into public.profile_departamentos (profile_id, departamento_id)
    select p.id, d.id from public.profiles p, public.departamentos d
    where p.id in ('${ANA}'::uuid, '${BIA}'::uuid) and d.nome = 'Fiscal';
  insert into public.clientes (id, documento, razao_social, regime) values ('${C}', '11111111000111', 'Cliente C', 'simples');`);

// Três tarefas do Fiscal (uma concluída), uma do Pessoal e uma já da Bia.
const fiscal = (await linhas(`select id from public.departamentos where nome = 'Fiscal'`))[0].id;
const pessoal = (await linhas(`select id from public.departamentos where nome = 'Pessoal'`))[0].id;
const obrigacao = (nome, dep) =>
  `insert into public.obrigacoes (nome, departamento_id, dia_vencimento, regimes) values ('${nome}', ${dep}, 20, '{simples}') returning id`;
const o = [];
for (const [nome, dep] of [["F1", fiscal], ["F2", fiscal], ["F3", fiscal], ["P1", pessoal], ["F4", fiscal]]) {
  o.push((await linhas(obrigacao(nome, dep)))[0].id);
}
const tarefa = (ob, dep, extra = "null, 'pendente'") =>
  `insert into public.tarefas (cliente_id, obrigacao_id, departamento_id, competencia, prazo_legal, prazo_meta, responsavel_id, status, observacao)
   values ('${C}', ${ob}, ${dep}, '2026-10-01', '2026-11-20', '2026-11-18', ${extra}, ${extra.includes("dispensada") ? "'x'" : "null"}) returning id`;
const t1 = (await linhas(tarefa(o[0], fiscal)))[0].id;
const t2 = (await linhas(tarefa(o[1], fiscal)))[0].id;
const t3 = (await linhas(tarefa(o[2], fiscal, "null, 'dispensada'")))[0].id;
const t4 = (await linhas(tarefa(o[3], pessoal)))[0].id;
const t5 = (await linhas(tarefa(o[4], fiscal, `'${BIA}', 'pendente'`)))[0].id;

// Atualização direta continua proibida para o colaborador
await as(ANA, () => db.query(`update public.tarefas set responsavel_id = '${ANA}' where id = '${t1}'`));
check("colaboradora não se atribui por update direto", (await linhas(`select responsavel_id r from public.tarefas where id = '${t1}'`))[0].r === null);

const qtd = (await as(ANA, () => linhas(`select public.assumir_tarefas(array['${t1}','${t2}','${t3}','${t4}','${t5}']::uuid[]) n`)))[0].n;
check("assume só as abertas, sem responsável, do seu departamento", qtd === 2, qtd);
const donos = Object.fromEntries((await linhas(`select id, responsavel_id from public.tarefas`)).map((r) => [r.id, r.responsavel_id]));
check("as duas do Fiscal ficam com ela", donos[t1] === ANA && donos[t2] === ANA);
check("dispensada fica sem responsável", donos[t3] === null);
check("de outro departamento fica sem responsável", donos[t4] === null);
check("a da Bia continua da Bia", donos[t5] === BIA);

// Depois de assumir, o atalho não vale mais
const roubar = await as(BIA, () => linhas(`select public.assumir_tarefas(array['${t1}']::uuid[]) n`));
check("ninguém toma uma tarefa que já tem responsável", roubar[0].n === 0);
const trocar = await as(ANA, () =>
  erro(() => db.query(`begin; select set_config('mcont.assumindo', 'on', true); update public.tarefas set responsavel_id = '${BIA}' where id = '${t1}'; commit;`)),
);
await db.exec("rollback").catch(() => {});
check("nem com a marca ligada dá para passar a tarefa a outra pessoa", trocar !== null && (await linhas(`select responsavel_id r from public.tarefas where id = '${t1}'`))[0].r === ANA);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
