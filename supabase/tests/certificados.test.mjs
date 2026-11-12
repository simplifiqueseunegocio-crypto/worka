import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const ADMIN = "a0000000-0000-0000-0000-00000000000a";
const COLAB = "c0000000-0000-0000-0000-00000000000c";
const NOVO = "e0000000-0000-0000-0000-00000000000e"; // ainda inativo
await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'admin@x'), ('${COLAB}', 'colab@x'), ('${NOVO}', 'novo@x');
  update public.profiles set papel = 'admin', ativo = true where id = '${ADMIN}';
  update public.profiles set papel = 'colaborador', ativo = true where id = '${COLAB}';
  update public.profiles set papel = 'colaborador', ativo = false where id = '${NOVO}';`);

const como = async (id, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const inserir = (id, path) =>
  como(id, `insert into public.certificados (nome, valido_ate, arquivo_path, arquivo_nome, arquivo_bytes)
    values ('A1 MCONT', '2027-10-01', '${path}', 'mcont.pfx', 4000) returning id`);

check("colaborador não envia certificado", (await erro(() => inserir(COLAB, "x/1.pfx"))) !== null);
const cert = (await inserir(ADMIN, "x/2.pfx")).rows[0].id;
check("admin envia certificado", Boolean(cert));
check(
  "arquivo acima de 100 KB é recusado",
  (await erro(() => db.exec(`insert into public.certificados (nome, valido_ate, arquivo_path, arquivo_nome, arquivo_bytes) values ('x', '2027-01-01', 'x/3.pfx', 'x.pfx', 200000)`))) !== null,
);

check("colaborador ativo vê o certificado", (await como(COLAB, `select count(*)::int n from public.certificados`)).rows[0].n === 1);
check("usuário inativo não vê", (await como(NOVO, `select count(*)::int n from public.certificados`)).rows[0].n === 0);

await como(COLAB, `insert into public.certificado_downloads (certificado_id) values ('${cert}')`);
check(
  "não registra download em nome de outro",
  (await erro(() => como(COLAB, `insert into public.certificado_downloads (certificado_id, profile_id) values ('${cert}', '${ADMIN}')`))) !== null,
);
check("inativo não registra download", (await erro(() => como(NOVO, `insert into public.certificado_downloads (certificado_id) values ('${cert}')`))) !== null);
await como(ADMIN, `insert into public.certificado_downloads (certificado_id) values ('${cert}')`);
check("admin vê todos os downloads", (await como(ADMIN, `select count(*)::int n from public.certificado_downloads`)).rows[0].n === 2);
check("colaborador vê só os seus", (await como(COLAB, `select count(*)::int n from public.certificado_downloads`)).rows[0].n === 1);
check("registro não é apagado pela equipe", (await como(ADMIN, `delete from public.certificado_downloads returning id`)).rows.length === 0);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
