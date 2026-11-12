import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const empresa = (codigo, extra = {}) => ({
  codigo_dominio: codigo,
  tipo_inscricao: 1,
  documento: String(10000000000000 + codigo),
  razao_social: `Empresa ${codigo} LTDA`,
  nome_fantasia: null,
  uf: "SP",
  data_inicio_atividade: "2020-01-01",
  ...extra,
});
const lista = (de, ate, extra) =>
  Array.from({ length: ate - de + 1 }, (_, i) => empresa(de + i, extra));

async function sincronizar(empresas, forcar = false) {
  await db.exec("set role service_role");
  try {
    const r = await db.query("select public.sincronizar_clientes_dominio($1::jsonb, $2) as r", [
      JSON.stringify(empresas),
      forcar,
    ]);
    return r.rows[0].r;
  } finally {
    await db.exec("reset role");
  }
}
const status = async (codigo) =>
  (await db.query("select status from public.clientes where codigo_dominio = $1", [codigo])).rows[0]?.status;

// Carga inicial
let r = await sincronizar(lista(1, 30));
check("carga inicial insere 30", r.inseridas === 30 && r.atualizadas === 0 && r.suspensas === 0, JSON.stringify(r));
const c1 = (await db.query("select regime, status, sincronizado_em from public.clientes where codigo_dominio = 1")).rows[0];
check("cliente entra ativo, sem regime", c1.status === "ativo" && c1.regime === null && c1.sincronizado_em);
const vinc = (await db.query("select count(*)::int n from public.cliente_obrigacoes")).rows[0].n;
check("sem regime, nenhuma obrigação vinculada", vinc === 0, vinc);

// Mesmo CNPJ em dois códigos
r = await sincronizar([...lista(1, 30), empresa(31, { documento: String(10000000000001) })]);
check("aceita CNPJ repetido em outro código", r.inseridas === 1 && r.atualizadas === 30, JSON.stringify(r));

// Atualização preserva o que é da plataforma
await db.exec(`update public.clientes set regime = 'simples', observacoes = 'nota interna' where codigo_dominio = 2`);
r = await sincronizar(lista(1, 31, { razao_social: "Nome Novo" }));
const c2 = (await db.query("select razao_social, regime, observacoes from public.clientes where codigo_dominio = 2")).rows[0];
check("atualiza dados do Domínio", c2.razao_social === "Nome Novo");
check("mantém regime e observações da plataforma", c2.regime === "simples" && c2.observacoes === "nota interna");

// Nome do município
r = await sincronizar(lista(1, 31, { codigo_municipio: 5339, municipio: "SAO JOSE DO RIO PRETO" }));
const municipio = async () => (await db.query("select municipio from public.clientes where codigo_dominio = 2")).rows[0].municipio;
check("grava o nome do município", (await municipio()) === "SAO JOSE DO RIO PRETO", await municipio());
r = await sincronizar(lista(1, 31));
check("envio sem o nome não apaga o já gravado", (await municipio()) === "SAO JOSE DO RIO PRETO", await municipio());

// Empresa que sai da lista é suspensa; volta a ficar ativa quando reaparece
r = await sincronizar(lista(1, 30));
check("empresa ausente vira suspensa", r.suspensas === 1 && (await status(31)) === "suspenso", JSON.stringify(r));
r = await sincronizar(lista(1, 31));
check("empresa que reaparece volta a ativa", (await status(31)) === "ativo");

// Cliente manual não é tocado
await db.exec(`insert into public.clientes (documento, razao_social, regime) values ('99999999000199', 'Manual LTDA', 'real')`);
await sincronizar(lista(1, 31));
const manual = (await db.query("select status from public.clientes where documento = '99999999000199'")).rows[0];
check("cliente cadastrado à mão continua ativo", manual.status === "ativo");

// Proteção contra lista incompleta
const parcial = await erro(() => sincronizar(lista(1, 10)));
check("recusa lista muito menor que a carteira", parcial?.includes("forcar=true"), parcial);
check("nada foi suspenso na recusa", (await status(20)) === "ativo");
r = await sincronizar(lista(1, 10), true);
check("com forcar=true aplica a queda", r.suspensas === 21, JSON.stringify(r));

check("recusa lista vazia", (await erro(() => sincronizar([])))?.includes("vazia"));

// Regime vindo do Domínio (rfed_par)
await sincronizar(lista(1, 31), true);
r = await sincronizar([
  ...lista(1, 27),
  empresa(28, { regime_federal: 2, regime_vigencia: "2024-10-01" }),
  empresa(29, { regime_federal: 5 }),
  empresa(30, { regime_federal: 1 }),
  empresa(31, { regime_federal: 8 }),
]);
const regimes = Object.fromEntries(
  (await db.query("select codigo_dominio, regime, regime_federal_dominio from public.clientes where codigo_dominio between 28 and 31")).rows
    .map((x) => [x.codigo_dominio, x.regime])
);
check("rfed 2/5/1 viram simples/presumido/real", regimes[28] === "simples" && regimes[29] === "presumido" && regimes[30] === "real", JSON.stringify(regimes));
check("código desconhecido (8) não define regime", regimes[31] === null);
const vinc28 = (await db.query(`select count(*)::int n from public.cliente_obrigacoes co join public.clientes c on c.id = co.cliente_id where c.codigo_dominio = 28`)).rows[0].n;
check("regime do Domínio vincula as obrigações", vinc28 > 0, vinc28);
const vig = (await db.query("select regime_vigencia::text v, regime_federal_dominio f from public.clientes where codigo_dominio = 28")).rows[0];
check("guarda código e vigência originais", vig.v === "2024-10-01" && vig.f === 2, JSON.stringify(vig));

await db.exec("update public.clientes set regime = 'real' where codigo_dominio = 31");
await sincronizar(lista(1, 31));
check("sem código no envio, mantém o regime da plataforma", (await status(31)) === "ativo" &&
  (await db.query("select regime from public.clientes where codigo_dominio = 31")).rows[0].regime === "real");
await sincronizar([...lista(1, 30), empresa(31, { regime_federal: 5 })]);
check("código conhecido do Domínio prevalece", (await db.query("select regime from public.clientes where codigo_dominio = 31")).rows[0].regime === "presumido");

// Detalhes do que mudou (usados no log de sincronização)
await sincronizar(lista(1, 31), true);
await db.exec("update public.clientes set status = 'suspenso' where codigo_dominio = 5");
await db.exec("update public.clientes set regime = 'presumido' where codigo_dominio in (30, 31)");
r = await sincronizar([
  ...lista(1, 29).filter((e) => e.codigo_dominio !== 7),
  empresa(30, { regime_federal: 1 }),
  empresa(31, { regime_federal: 2 }),
  empresa(40),
]);
check("detalhe: inserida", JSON.stringify(r.detalhes.inseridos) === "[40]", JSON.stringify(r.detalhes));
check("detalhe: reativada", JSON.stringify(r.detalhes.reativados) === "[5]" && r.reativadas === 1, JSON.stringify(r.detalhes));
check("detalhe: suspensa", JSON.stringify(r.detalhes.suspensos) === "[7]" && r.suspensas === 1, JSON.stringify(r.detalhes));
const reg = r.detalhes.regimes;
check(
  "detalhe: regimes alterados com de/para",
  r.regimes_alterados === 2 &&
    reg.some((x) => x.codigo === 30 && x.de === "presumido" && x.para === "real") &&
    reg.some((x) => x.codigo === 31 && x.de === "presumido" && x.para === "simples"),
  JSON.stringify(reg),
);
r = await sincronizar([...lista(1, 29).filter((e) => e.codigo_dominio !== 7), empresa(30, { regime_federal: 1 }), empresa(31, { regime_federal: 2 }), empresa(40)]);
check("sem mudanças, detalhes vazios", r.inseridas === 0 && r.suspensas === 0 && r.reativadas === 0 && r.regimes_alterados === 0, JSON.stringify(r));

// Log de execuções: só o servidor grava; quem não é gestor/admin não lê.
await db.exec("insert into public.integracao_execucoes (status, mensagem) values ('sucesso', 'teste')");
await db.exec("set role authenticated");
const logSemPerfil = (await db.query("select count(*)::int n from public.integracao_execucoes")).rows[0].n;
const gravaLog = await erro(() => db.exec("insert into public.integracao_execucoes (status) values ('erro')"));
await db.exec("reset role");
check("usuário sem papel não lê o log", logSemPerfil === 0, logSemPerfil);
check("usuário não grava no log", gravaLog !== null);

// Permissões
for (const papel of ["anon", "authenticated"]) {
  await db.exec(`set role ${papel}`);
  const e = await erro(() => db.query("select public.sincronizar_clientes_dominio('[]'::jsonb)"));
  await db.exec("reset role");
  check(`${papel} não pode sincronizar`, e?.includes("permission denied"), e);
}

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
