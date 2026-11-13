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

// Etapa 2: financeiro, contas e resumo mensal.
await db.exec(`insert into public.conta_azul_parcelas (cliente_id, tipo, id, descricao, vencimento, total, nao_pago) values
  ('${C}', 'receber', 'r1', 'Venda 1', '2026-11-01', 100, 100),
  ('${C}', 'pagar', 'r1', 'Aluguel', '2026-11-05', 50, 50);
  insert into public.conta_azul_contas (cliente_id, id, nome, saldo) values ('${C}', 'c1', 'Itaú', 15362.67);
  insert into public.conta_azul_mensal (cliente_id, competencia, vendas_total, nfse_qtd) values ('${C}', '2026-11-01', 1000, 3);`);
check("mesmo id em receber e pagar convive", (await db.query(`select count(*)::int n from public.conta_azul_parcelas`)).rows[0].n === 2);
check("tipo de parcela inválido é recusado",
  (await erro(() => db.exec(`insert into public.conta_azul_parcelas (cliente_id, tipo, id) values ('${C}', 'outro', 'x')`))) !== null);

// Permissões: equipe lê pessoas, ninguém logado lê tokens nem grava pessoas.
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U}', false);`);
const pessoas = (await db.query(`select id from public.conta_azul_pessoas order by id`)).rows.map((r) => r.id).join();
check("equipe lê clientes e fornecedores", pessoas === "p1,p2", pessoas);
let tokens = [];
const negado = await erro(async () => { tokens = (await db.query(`select * from public.conta_azul_conexoes`)).rows; });
check("usuário logado não lê os tokens", negado !== null || tokens.length === 0);
const gravou = await erro(() => db.exec(`insert into public.conta_azul_pessoas (cliente_id, id, nome) values ('${C}', 'p3', 'X')`));
check("usuário logado não grava pessoas", gravou !== null);
const fin = (await db.query(`select (select count(*) from public.conta_azul_parcelas)::int p, (select count(*) from public.conta_azul_contas)::int c, (select count(*) from public.conta_azul_mensal)::int m`)).rows[0];
check("equipe lê parcelas, contas e resumo mensal", fin.p === 2 && fin.c === 1 && fin.m === 1, JSON.stringify(fin));
check("usuário logado não grava parcelas",
  (await erro(() => db.exec(`insert into public.conta_azul_parcelas (cliente_id, tipo, id) values ('${C}', 'receber', 'zz')`))) !== null);
await db.exec(`reset role`);

// Excluir cliente leva junto conexão e pessoas.
await db.exec(`update public.clientes set status = 'encerrado' where id = '${C}'`);
await db.exec(`delete from public.clientes where id = '${C}'`);
const sobras = (await db.query(`select (select count(*) from public.conta_azul_conexoes)::int c, (select count(*) from public.conta_azul_pessoas)::int p,
  (select count(*) from public.conta_azul_parcelas)::int f, (select count(*) from public.conta_azul_contas)::int k, (select count(*) from public.conta_azul_mensal)::int m`)).rows[0];
check("excluir o cliente apaga conexão, pessoas e financeiro", Object.values(sobras).every((n) => n === 0), JSON.stringify(sobras));

// Cliente ativo continua protegido contra exclusão.
const D = (await db.query(`insert into public.clientes (documento, razao_social, status) values ('22222222000122', 'Empresa D', 'ativo') returning id`)).rows[0].id;
check("não exclui cliente ativo", (await erro(() => db.exec(`delete from public.clientes where id = '${D}'`)))?.includes("Suspenda"));

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
