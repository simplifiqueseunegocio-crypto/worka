import { criarBanco, criarVerificador, erro } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const DP = "d0000000-0000-0000-0000-00000000000d";
const FISCAL = "f0000000-0000-0000-0000-00000000000f";
const CONTABIL = "c0000000-0000-0000-0000-0000000000cb";
const CLI = "c0000000-0000-0000-0000-00000000000c";
await db.exec(`insert into auth.users (id, email) values ('${DP}', 'dp@x'), ('${FISCAL}', 'fiscal@x'), ('${CONTABIL}', 'contabil@x');
  update public.profiles set papel = 'colaborador', ativo = true where id in ('${DP}', '${FISCAL}', '${CONTABIL}');
  insert into public.profile_departamentos (profile_id, departamento_id) select '${DP}', id from public.departamentos where nome = 'Pessoal';
  insert into public.profile_departamentos (profile_id, departamento_id) select '${FISCAL}', id from public.departamentos where nome = 'Fiscal';
  insert into public.profile_departamentos (profile_id, departamento_id) select '${CONTABIL}', id from public.departamentos where nome = 'Contábil';
  insert into public.clientes (id, documento, razao_social, regime, status) values ('${CLI}', '11222333000181', 'Cliente', 'simples', 'ativo');`);

const como = async (id, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const n = async (id, sql) => (await como(id, sql)).rows[0].n;

// --- Acesso às leituras por tipo ---
check("fiscal cria leitura de NFS-e", (await como(FISCAL, `insert into public.documentos_leituras (tipo, cliente_id) values ('nfse', '${CLI}') returning id`)).rows.length === 1);
check("DP não cria leitura de NFS-e", (await erro(() => como(DP, `insert into public.documentos_leituras (tipo) values ('nfse')`))) !== null);
check("DP cria leitura de guias (GPS/FGTS)", (await como(DP, `insert into public.documentos_leituras (tipo) values ('guia') returning id`)).rows.length === 1);
check("contábil cria leitura de comprovantes", (await como(CONTABIL, `insert into public.documentos_leituras (tipo) values ('comprovante') returning id`)).rows.length === 1);
check("fiscal não cria leitura de comprovantes", (await erro(() => como(FISCAL, `insert into public.documentos_leituras (tipo) values ('comprovante')`))) !== null);
check("contábil não vê leituras de NFS-e", (await n(CONTABIL, `select count(*)::int n from public.documentos_leituras where tipo = 'nfse'`)) === 0);
check("atestado continua só do DP", (await erro(() => como(FISCAL, `insert into public.documentos_leituras (tipo) values ('atestado')`))) !== null);

// --- NFS-e ---
const nota = (numero, extra = "") =>
  `insert into public.fiscal_nfse (cliente_id, papel, numero, emitida_em, prestador_documento, valor_servicos${extra ? ", tomador_documento" : ""})
   values ('${CLI}', 'prestada', '${numero}', '2026-10-05', '11222333000181', 1000${extra ? `, '${extra}'` : ""})`;
await como(FISCAL, nota("1"));
check("mesma nota (prestador + número) não entra duas vezes", (await erro(() => como(FISCAL, nota("1")))) !== null);
check("CNPJ com máscara é recusado", (await erro(() => como(FISCAL, nota("2", "11.222.333/0001-81")))) !== null);
check("contábil não vê as notas", (await n(CONTABIL, `select count(*)::int n from public.fiscal_nfse`)) === 0);

// --- Guias e comprovantes ---
const BARRA = "8".padEnd(44, "1");
const guia = (await como(FISCAL, `insert into public.guias (cliente_id, tipo, vencimento, valor_total, codigo_barras) values ('${CLI}', 'das', '2026-11-20', 1234.56, '${BARRA}') returning id`)).rows[0].id;
check("mesma guia (mesmo código) não entra duas vezes", (await erro(() => como(FISCAL, `insert into public.guias (cliente_id, tipo, vencimento, valor_total, codigo_barras) values ('${CLI}', 'das', '2026-11-20', 1234.56, '${BARRA}')`))) !== null);
await como(FISCAL, `insert into public.guias (cliente_id, tipo, vencimento, valor_total) values ('${CLI}', 'boleto', '2026-11-20', 50), ('${CLI}', 'boleto', '2026-11-20', 50)`);
check("guias sem código de barras podem repetir", (await n(FISCAL, `select count(*)::int n from public.guias where codigo_barras is null`)) === 2);
check("código de barras precisa ter 44 dígitos", (await erro(() => como(FISCAL, `insert into public.guias (cliente_id, tipo, vencimento, valor_total, codigo_barras) values ('${CLI}', 'das', '2026-11-20', 1, '123')`))) !== null);
check("contábil vê as guias (para a baixa)", (await n(CONTABIL, `select count(*)::int n from public.guias`)) === 3);
check("DP vê as guias, mas não lança comprovante", (await n(DP, `select count(*)::int n from public.guias`)) === 3 && (await erro(() => como(DP, `insert into public.contabil_comprovantes (cliente_id, pago_em, valor) values ('${CLI}', '2026-11-18', 1)`))) !== null);

const comp = (await como(CONTABIL, `insert into public.contabil_comprovantes (cliente_id, pago_em, valor, forma, autenticacao, guia_id) values ('${CLI}', '2026-11-18', 1234.56, 'tributo', 'ABC123', '${guia}') returning id`)).rows[0].id;
check("comprovante dá baixa na guia (pago_em)", (await db.query(`select pago_em::text d from public.guias where id = '${guia}'`)).rows[0].d === "2026-11-18");
check("fiscal vê a guia paga sem ver o comprovante", (await n(FISCAL, `select count(*)::int n from public.guias where pago_em is not null`)) === 1 && (await n(FISCAL, `select count(*)::int n from public.contabil_comprovantes`)) === 0);
check("mesma autenticação não entra duas vezes", (await erro(() => como(CONTABIL, `insert into public.contabil_comprovantes (cliente_id, pago_em, valor, autenticacao) values ('${CLI}', '2026-11-18', 1, 'ABC123')`))) !== null);
await como(CONTABIL, `insert into public.contabil_comprovantes (cliente_id, pago_em, valor) values ('${CLI}', '2026-11-18', 5), ('${CLI}', '2026-11-18', 5)`);
check("comprovantes sem autenticação podem repetir", (await n(CONTABIL, `select count(*)::int n from public.contabil_comprovantes where autenticacao is null`)) === 2);

await como(CONTABIL, `delete from public.contabil_comprovantes where id = '${comp}'`);
check("apagar o comprovante reabre a guia", (await db.query(`select pago_em from public.guias where id = '${guia}'`)).rows[0].pago_em === null);

// Reabrir a leitura: o que foi lançado sai pelo item de origem.
const leitura = (await como(CONTABIL, `insert into public.documentos_leituras (tipo, cliente_id) values ('comprovante', '${CLI}') returning id`)).rows[0].id;
const item = (await como(CONTABIL, `insert into public.documentos_itens (leitura_id, dados) values ('${leitura}', '{}') returning id`)).rows[0].id;
await como(CONTABIL, `insert into public.contabil_comprovantes (cliente_id, pago_em, valor, guia_id, origem_item_id) values ('${CLI}', '2026-11-19', 1234.56, '${guia}', '${item}')`);
check("baixa de novo", (await db.query(`select pago_em::text d from public.guias where id = '${guia}'`)).rows[0].d === "2026-11-19");
await como(CONTABIL, `delete from public.contabil_comprovantes where origem_item_id = '${item}'`);
check("desfazer pela origem reabre a guia", (await db.query(`select pago_em from public.guias where id = '${guia}'`)).rows[0].pago_em === null);

await como(CONTABIL, `insert into public.contabil_comprovantes (cliente_id, pago_em, valor, guia_id) values ('${CLI}', '2026-11-19', 1234.56, '${guia}')`);
await como(FISCAL, `delete from public.guias where id = '${guia}'`);
check("apagar a guia mantém o comprovante (sem a guia)", (await db.query(`select count(*)::int n from public.contabil_comprovantes where valor = 1234.56 and guia_id is null`)).rows[0].n === 1);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
