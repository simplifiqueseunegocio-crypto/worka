import { criarBanco, criarVerificador } from "./_setup.mjs";

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

const dep = async (nome) => (await db.query(`select id from public.departamentos where nome = '${nome}'`)).rows[0].id;
const fiscal = await dep("Fiscal");
const pessoal = await dep("Pessoal");
let n = 0;
async function tarefa(depId, status) {
  n++;
  const o = (await db.query(`insert into public.obrigacoes (nome, departamento_id, dia_vencimento, regimes) values ('O${n}', ${depId}, 20, '{simples}') returning id`)).rows[0].id;
  await db.query(`insert into public.tarefas (cliente_id, obrigacao_id, departamento_id, competencia, prazo_legal, prazo_meta, status, observacao)
    values ('${CLI}', ${o}, ${depId}, '2026-10-01', '2026-11-20', '2026-11-18', '${status}', 'x')`);
}
await tarefa(fiscal, "pendente");
await tarefa(fiscal, "em_andamento");
await tarefa(fiscal, "concluida");
await tarefa(pessoal, "aguardando_cliente");
await tarefa(pessoal, "dispensada");

const como = async (id) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try {
    const { rows } = await db.query(`select departamento, abertas::int from public.abertas_por_departamento()`);
    return Object.fromEntries(rows.map((r) => [r.departamento, r.abertas]));
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
};

const admin = await como(ADMIN);
check("conta só as abertas por departamento", admin.Fiscal === 2 && admin.Pessoal === 1, JSON.stringify(admin));
check("departamento sem tarefas aparece com zero", admin["Contábil"] === 0);
check("traz os cinco departamentos", Object.keys(admin).length === 5);

// A contagem respeita a RLS de tarefas: igual a contar direto como o usuário.
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${COLAB}', false);`);
const direto = (await db.query(`select count(*)::int n from public.tarefas where status in ('pendente','em_andamento','aguardando_cliente')`)).rows[0].n;
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const colab = await como(COLAB);
check("respeita a RLS (igual à contagem direta)", Object.values(colab).reduce((a, b) => a + b, 0) === direto, `${JSON.stringify(colab)} x ${direto}`);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
