import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const U = "11111111-1111-1111-1111-111111111111";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U}', 'u@x.com', '{"nome":"U"}')`);

const C = (await db.query(`insert into public.clientes (documento, razao_social, status) values ('11111111000111', 'Empresa A', 'ativo') returning id`)).rows[0].id;

// Modelo antigo saiu.
check("conexão única removida", (await erro(() => db.query(`select 1 from public.conta_azul_conexao`))) !== null);
check("coluna conta_azul_id removida", (await erro(() => db.query(`select conta_azul_id from public.clientes`))) !== null);

// Conexão por cliente.
await db.exec(`insert into public.conta_azul_conexoes (cliente_id, refresh_token, empresa_nome) values ('${C}', 'rt', 'Empresa A')`);
check("uma conexão por cliente", (await erro(() => db.exec(`insert into public.conta_azul_conexoes (cliente_id, refresh_token) values ('${C}', 'x')`))) !== null);

// Pessoas da empresa.
await db.exec(`insert into public.conta_azul_pessoas (cliente_id, id, nome, perfis) values
  ('${C}', 'p1', 'Cliente do cliente', '{Cliente}'),
  ('${C}', 'p2', 'Fornecedor do cliente', '{Fornecedor}')`);

// Permissões: equipe lê pessoas, ninguém logado lê tokens nem grava pessoas.
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U}', false);`);
const pessoas = (await db.query(`select id from public.conta_azul_pessoas order by id`)).rows.map((r) => r.id).join();
check("equipe lê clientes e fornecedores", pessoas === "p1,p2", pessoas);
let tokens = [];
const negado = await erro(async () => { tokens = (await db.query(`select * from public.conta_azul_conexoes`)).rows; });
check("usuário logado não lê os tokens", negado !== null || tokens.length === 0);
const gravou = await erro(() => db.exec(`insert into public.conta_azul_pessoas (cliente_id, id, nome) values ('${C}', 'p3', 'X')`));
check("usuário logado não grava pessoas", gravou !== null);
await db.exec(`reset role`);

// Excluir cliente leva junto conexão e pessoas.
await db.exec(`update public.clientes set status = 'encerrado' where id = '${C}'`);
await db.exec(`delete from public.clientes where id = '${C}'`);
const sobras = (await db.query(`select (select count(*) from public.conta_azul_conexoes)::int c, (select count(*) from public.conta_azul_pessoas)::int p`)).rows[0];
check("excluir o cliente apaga conexão e pessoas", sobras.c === 0 && sobras.p === 0, JSON.stringify(sobras));

// Cliente ativo continua protegido contra exclusão.
const D = (await db.query(`insert into public.clientes (documento, razao_social, status) values ('22222222000122', 'Empresa D', 'ativo') returning id`)).rows[0].id;
check("não exclui cliente ativo", (await erro(() => db.exec(`delete from public.clientes where id = '${D}'`)))?.includes("Suspenda"));

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
