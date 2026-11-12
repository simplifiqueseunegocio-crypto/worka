import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();

const U1 = "00000000-0000-0000-0000-000000000001"; // admin
const U2 = "00000000-0000-0000-0000-000000000002"; // gestor fiscal
const U3 = "00000000-0000-0000-0000-000000000003"; // colaborador fiscal

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
console.log("migrations aplicadas");

await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${U1}', 'admin@mcont.com.br', '{"nome":"Admin"}'),
  ('${U2}', 'gestor@mcont.com.br', '{}'),
  ('${U3}', 'colab@mcont.com.br', '{}');`);
const perfis = (await db.query(`select email, papel, nome from public.profiles order by email`)).rows;
check("primeiro usuário vira admin", perfis.find(p => p.email.startsWith("admin")).papel === "admin");
check("demais viram colaborador", perfis.filter(p => p.papel === "colaborador").length === 2);
check("nome padrão vem do e-mail", perfis.find(p => p.email.startsWith("gestor")).nome === "gestor");
const ativos = (await db.query(`select email from public.profiles where ativo order by email`)).rows.map(p => p.email);
check("só o primeiro usuário nasce ativo", ativos.join() === "admin@mcont.com.br", ativos.join());
const semAtivar = (await as(U3, () => db.query(`select count(*)::int n from public.departamentos`))).rows[0].n;
check("conta não ativada pelo admin não lê nada", semAtivar === 0, semAtivar);

// Admin configura a equipe (a tela Equipe ativa quem o admin cadastrou)
await as(U1, () => db.exec(`
  update public.profiles set ativo = true where id in ('${U2}', '${U3}');
  update public.profiles set papel = 'gestor' where id = '${U2}';
  insert into public.profile_departamentos values
    ('${U2}', (select id from public.departamentos where nome='Fiscal')),
    ('${U3}', (select id from public.departamentos where nome='Fiscal'));
`));
check("admin define gestor", (await db.query(`select papel from public.profiles where id='${U2}'`)).rows[0].papel === "gestor");

// Colaborador não consegue se promover
await as(U3, () => db.exec(`update public.profiles set papel='admin' where id='${U3}'`));
check("colaborador não se promove", (await db.query(`select papel from public.profiles where id='${U3}'`)).rows[0].papel === "colaborador");

// Gestor cadastra clientes
await as(U2, () => db.exec(`
  insert into public.clientes (documento, razao_social, regime, inicio_em) values
    ('11222333000181', 'Padaria Exemplo LTDA', 'simples', '2026-01-01'),
    ('44555666000190', 'Indústria Exemplo SA', 'real', '2026-01-01'),
    ('77888999000100', 'Cliente Novo LTDA', 'simples', '2026-11-01');
  insert into public.cliente_responsaveis
  select c.id, d.id, '${U3}' from public.clientes c, public.departamentos d
  where c.documento = '11222333000181' and d.nome = 'Fiscal';
`));
const vinc = (await db.query(`select o.nome from public.cliente_obrigacoes co join public.obrigacoes o on o.id=co.obrigacao_id
  join public.clientes c on c.id=co.cliente_id where c.documento='11222333000181' order by 1`)).rows.map(r => r.nome);
check("cliente Simples vinculado às obrigações do regime", vinc.includes("DAS - Simples Nacional") && vinc.includes("DEFIS") && !vinc.includes("ECD"), vinc.join(", "));

const colabInsere = await erro(() => as(U3, () => db.exec(`insert into public.clientes (documento, razao_social, regime) values ('12345678901','X','mei')`)));
check("colaborador não cadastra cliente", colabInsere !== null);
check("documento inválido é recusado", (await erro(() => db.exec(`insert into public.clientes (documento, razao_social, regime) values ('123','X','mei')`))) !== null);

// Geração
const colabGera = await erro(() => as(U3, () => db.query(`select public.gerar_tarefas('2026-09-01')`)));
check("colaborador não gera tarefas", colabGera?.includes("Apenas admin ou gestor"), colabGera);
const internoAnon = await erro(() => as(U3, () => db.query(`select public.gerar_tarefas_interno('2026-09-01')`)));
check("função interna bloqueada para usuários", internoAnon?.includes("permission denied"), internoAnon);

const g1 = (await as(U2, () => db.query(`select public.gerar_tarefas('2026-09-15') as n`))).rows[0].n;
const g2 = (await as(U2, () => db.query(`select public.gerar_tarefas('2026-09-01') as n`))).rows[0].n;
check("gera tarefas de 09/2026", g1 > 0, g1);
check("rodar de novo não duplica", g2 === 0, g2);
const novo = (await db.query(`select count(*)::int n from public.tarefas t join public.clientes c on c.id=t.cliente_id where c.documento='77888999000100'`)).rows[0].n;
check("cliente com início em 11/2026 não recebe 09/2026", novo === 0, novo);

const prazo = async (doc, obr, comp) => (await db.query(
  `select to_char(prazo_legal,'YYYY-MM-DD') l, to_char(prazo_meta,'YYYY-MM-DD') m from public.tarefas t
   join public.clientes c on c.id=t.cliente_id join public.obrigacoes o on o.id=t.obrigacao_id
   where c.documento=$1 and o.nome=$2 and competencia=$3`, [doc, obr, comp])).rows[0];

let p = await prazo("11222333000181", "DAS - Simples Nacional", "2026-09-01");
check("DAS 09/2026 vence 20/10/2026 (meta 3 dias antes, 16/10 sex)", p?.l === "2026-10-20" && p?.m === "2026-10-16", JSON.stringify(p));
const resp = (await db.query(`select responsavel_id from public.tarefas t join public.obrigacoes o on o.id=t.obrigacao_id
  join public.clientes c on c.id=t.cliente_id where c.documento='11222333000181' and o.nome='DAS - Simples Nacional'`)).rows[0];
check("responsável do departamento atribuído", resp.responsavel_id === U3);

await as(U2, () => db.query(`select public.gerar_tarefas('2026-10-01')`));
p = await prazo("11222333000181", "EFD-Reinf", "2026-10-01");
check("EFD-Reinf 10/2026: 15/11 é domingo e feriado, antecipa para 13/11", p?.l === "2026-11-13", JSON.stringify(p));
p = await prazo("44555666000190", "EFD-Contribuições", "2026-10-01");
check("EFD-Contribuições 10/2026 vence em 12/2026 (meses_apos 2)", p?.l === "2026-12-15", JSON.stringify(p));
const defisOut = await prazo("11222333000181", "DEFIS", "2026-10-01");
check("anual não é gerada fora da competência 12", defisOut === undefined);

await as(U2, () => db.query(`select public.gerar_tarefas('2026-12-01')`));
p = await prazo("11222333000181", "DEFIS", "2026-12-01");
check("DEFIS ano-base 2026 vence 31/03/2027", p?.l === "2027-03-31", JSON.stringify(p));
p = await prazo("44555666000190", "ECD", "2026-12-01");
check("ECD ano-base 2026 vence 30/06/2027", p?.l === "2027-06-30", JSON.stringify(p));
const curto = (await db.query(`select to_char(public.calcula_prazo_legal(o, '2027-01-01'),'YYYY-MM-DD') d
  from public.obrigacoes o where o.nome='DEFIS'`)).rows[0].d;
check("dia 31 em mês de 30 dias usa o último dia útil (DEFIS de jan → 30/04/2027)", curto === "2027-04-30", curto);

// Colaborador atualiza a própria tarefa
const tid = (await db.query(`select t.id from public.tarefas t join public.obrigacoes o on o.id=t.obrigacao_id
  join public.clientes c on c.id=t.cliente_id where c.documento='11222333000181' and o.nome='DAS - Simples Nacional' and competencia='2026-09-01'`)).rows[0].id;
await as(U3, () => db.exec(`update public.tarefas set status='concluida' where id='${tid}'`));
let t = (await db.query(`select status, concluida_por, concluida_em from public.tarefas where id='${tid}'`)).rows[0];
check("colaborador conclui a própria tarefa e fica registrado", t.status === "concluida" && t.concluida_por === U3 && t.concluida_em);

const mudaPrazo = await erro(() => as(U3, () => db.exec(`update public.tarefas set prazo_legal='2030-01-01' where id='${tid}'`)));
check("colaborador não altera prazo", mudaPrazo?.includes("só pode alterar"), mudaPrazo);

await as(U3, () => db.exec(`update public.tarefas set status='em_andamento' where id='${tid}'`));
t = (await db.query(`select concluida_por from public.tarefas where id='${tid}'`)).rows[0];
check("reabrir limpa a conclusão", t.concluida_por === null);

const dispSem = await erro(() => as(U3, () => db.exec(`update public.tarefas set status='dispensada' where id='${tid}'`)));
check("dispensar exige observação", dispSem !== null);

// Tarefa do cliente sem responsável (Indústria) — colaborador não mexe
const outra = (await db.query(`select t.id from public.tarefas t join public.clientes c on c.id=t.cliente_id
  where c.documento='44555666000190' limit 1`)).rows[0].id;
const r = await as(U3, () => db.query(`update public.tarefas set status='concluida' where id='${outra}'`));
check("colaborador não altera tarefa de outro", r.affectedRows === 0, r.affectedRows);

// Gestor fiscal muda prazo de tarefa fiscal, mas não de tarefa contábil
const fiscal = await erro(() => as(U2, () => db.exec(`update public.tarefas set prazo_meta=prazo_meta - 1 where id='${tid}'`)));
check("gestor altera tarefa do seu departamento", fiscal === null, fiscal);
const contabil = (await db.query(`select t.id from public.tarefas t join public.departamentos d on d.id=t.departamento_id
  where d.nome='Contábil' limit 1`)).rows[0].id;
const r2 = await as(U2, () => db.query(`update public.tarefas set prazo_meta=prazo_meta - 1 where id='${contabil}'`));
check("gestor não altera tarefa de outro departamento", r2.affectedRows === 0);

// Anônimo e usuário inativo não leem nada
await db.exec(`set role anon`);
const anon = (await db.query(`select count(*)::int n from public.clientes`)).rows[0].n;
await db.exec(`reset role`);
check("anônimo não lê clientes", anon === 0, anon);
await as(U1, () => db.exec(`update public.profiles set ativo=false where id='${U3}'`));
const inativo = (await as(U3, () => db.query(`select count(*)::int n from public.tarefas`))).rows[0].n;
check("usuário desativado perde acesso", inativo === 0, inativo);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
