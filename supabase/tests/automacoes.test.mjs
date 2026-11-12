import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const ADMIN = "a0000000-0000-0000-0000-00000000000a";
const COLAB = "c0000000-0000-0000-0000-00000000000c";
await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'admin@x'), ('${COLAB}', 'colab@x');
  update public.profiles set papel = 'admin', ativo = true where id = '${ADMIN}';
  update public.profiles set papel = 'colaborador', ativo = true where id = '${COLAB}';`);

// A rota grava com a chave secreta (ignora RLS)
await db.exec(`insert into public.automacao_execucoes (automacao, referencia, status, enviados, mensagem)
  values ('resumo_diario', '2026-11-10', 'sucesso', 3, '3 de 3 resumos enviados.')`);

check(
  "status inválido é recusado",
  (await erro(() => db.exec(`insert into public.automacao_execucoes (automacao, referencia, status) values ('x', '2026-11-10', 'ok')`))) !== null,
);
check(
  "nome da automação só com minúsculas, números e _",
  (await erro(() => db.exec(`insert into public.automacao_execucoes (automacao, referencia, status) values ('Resumo Diário', '2026-11-10', 'sucesso')`))) !== null,
);

const comoUsuario = async (id, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
};

const doAdmin = await comoUsuario(ADMIN, `select count(*)::int as n from public.automacao_execucoes`);
check("admin lê o histórico", doAdmin.rows[0].n === 1);

const doColab = await comoUsuario(COLAB, `select count(*)::int as n from public.automacao_execucoes`);
check("colaborador não lê o histórico", doColab.rows[0].n === 0);

const inclusao = await erro(() =>
  comoUsuario(ADMIN, `insert into public.automacao_execucoes (automacao, referencia, status) values ('resumo_diario', '2026-11-11', 'sucesso')`),
);
check("ninguém grava pela API pública", inclusao !== null);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
