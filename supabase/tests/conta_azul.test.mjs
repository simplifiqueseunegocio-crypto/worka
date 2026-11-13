import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const sync = async (lista, forcar = false) =>
  (await db.query(`select public.sincronizar_clientes_conta_azul($1::jsonb, $2) as r`, [JSON.stringify(lista), forcar])).rows[0].r;
const cliente = async (doc) =>
  (await db.query(`select * from public.clientes where documento = $1 order by criado_em`, [doc])).rows;

// Carteira de antes: um vindo do Domínio (com tarefas) e um cadastrado à mão.
await db.exec(`insert into public.clientes (documento, razao_social, regime, codigo_dominio, status, email) values
  ('11111111000111', 'Empresa A (Domínio)', 'simples', 10, 'ativo', 'antigo@a.com');
  insert into public.clientes (documento, razao_social, regime, status) values
  ('22222222000122', 'Empresa B (manual)', 'presumido', 'ativo');`);

const A = { conta_azul_id: "ca-a", documento: "11111111000111", razao_social: "Empresa A Ltda", email: null, telefone: "17999990000", municipio: "São José do Rio Preto", uf: "SP" };
const B = { conta_azul_id: "ca-b", documento: "22222222000122", razao_social: "Empresa B Ltda" };
const C = { conta_azul_id: "ca-c", documento: "33333333000133", razao_social: "Empresa C Nova" };

// 1ª sincronização: vincula A e B pelo CNPJ e cria C.
let r = await sync([A, B, C]);
check("vincula os 2 existentes pelo documento", r.vinculadas === 2, JSON.stringify(r));
check("insere só o novo", r.inseridas === 1 && r.atualizadas === 2, JSON.stringify(r));
check("não duplica clientes", (await db.query(`select count(*)::int n from public.clientes`)).rows[0].n === 3);
const a = (await cliente("11111111000111"))[0];
check("A recebe conta_azul_id e mantém o código do Domínio", a.conta_azul_id === "ca-a" && a.codigo_dominio === 10);
check("A: nome atualizado e regime preservado", a.razao_social === "Empresa A Ltda" && a.regime === "simples");
check("A: campo vazio na Conta Azul não apaga o e-mail", a.email === "antigo@a.com");
check("A: telefone e município atualizados", a.telefone === "17999990000" && a.municipio === "São José do Rio Preto");
const c = (await cliente("33333333000133"))[0];
check("C entra ativo e sem regime", c.status === "ativo" && c.regime === null && c.tipo_inscricao === 1);
check("detalhes listam vinculados e inseridos", r.detalhes.vinculados.length === 2 && r.detalhes.inseridos[0].startsWith("Empresa C Nova"));

// Tarefas em aberto de C, para ver a limpeza quando ele sair.
const dep = (await db.query(`select id from public.departamentos where nome = 'Fiscal'`)).rows[0].id;
const ob = (await db.query(`insert into public.obrigacoes (nome, departamento_id, dia_vencimento, regimes) values ('X', ${dep}, 20, '{simples}') returning id`)).rows[0].id;
await db.query(`insert into public.tarefas (cliente_id, obrigacao_id, departamento_id, competencia, prazo_legal, prazo_meta, status)
  values ($1, ${ob}, ${dep}, '2026-10-01', '2026-11-20', '2026-11-18', 'pendente')`, [c.id]);

// 2ª sincronização: C saiu (ou foi inativado na Conta Azul).
r = await sync([A, B]);
check("suspende quem não veio", r.suspensas === 1 && (await cliente("33333333000133"))[0].status === "suspenso", JSON.stringify(r));
check("apaga as tarefas em aberto de quem saiu",
  (await db.query(`select count(*)::int n from public.tarefas where cliente_id = $1`, [c.id])).rows[0].n === 0);

// Volta: reativa.
r = await sync([A, B, C]);
check("reativa quem voltou", r.reativadas === 1 && (await cliente("33333333000133"))[0].status === "ativo", JSON.stringify(r));

// Status manual: a equipe encerra B; a sincronização não reativa.
await db.exec(`update public.clientes set status = 'encerrado', status_manual = true, status_alterado_em = now() where documento = '22222222000122'`);
await sync([A, B, C]);
check("respeita status definido pela equipe", (await cliente("22222222000122"))[0].status === "encerrado");

// Proteção contra lista muito menor que a carteira.
const muitos = Array.from({ length: 30 }, (_, i) => ({ conta_azul_id: `m${i}`, documento: String(40000000000100 + i), razao_social: `M${i}` }));
await sync([A, B, C, ...muitos]);
const recusa = await erro(() => sync([A]));
check("recusa lista muito menor sem forçar", recusa?.includes("Sincronize com"), recusa);
r = await sync([A, B, C, ...muitos.slice(0, 5)], true);
check("com forçar, aceita e suspende", r.suspensas === 25, JSON.stringify(r));

check("lista vazia é recusada", (await erro(() => sync([])))?.includes("vazia"));

// Conexão OAuth: só o servidor acessa.
await db.exec(`insert into public.conta_azul_conexao (refresh_token) values ('rt')`);
await db.exec(`set role authenticated`);
// Sem permissão (erro) ou sem linhas visíveis: em ambos os casos o token não vaza.
let linhas = [];
const negado = await erro(async () => { linhas = (await db.query(`select * from public.conta_azul_conexao`)).rows; });
check("usuário logado não lê os tokens", negado !== null || linhas.length === 0);
await db.exec(`reset role`);
check("só existe uma conexão", (await erro(() => db.exec(`insert into public.conta_azul_conexao (id, refresh_token) values (2, 'x')`))) !== null);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
