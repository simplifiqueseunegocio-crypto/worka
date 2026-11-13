import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarExecucao } from "@/lib/integracoes/execucoes";

// Integração com a Conta Azul (API v2, OAuth 2.0): UMA CONEXÃO POR CLIENTE.
//
// Cada empresa cliente tem a sua Conta Azul Pro. O escritório entra nela com um
// usuário próprio (um e-mail por empresa) e autoriza o app; a plataforma guarda
// os tokens daquele cliente (tabela conta_azul_conexoes, só o servidor acessa)
// e, todo dia, lê o cadastro da empresa e os clientes e fornecedores dela.
//
// Documentação: https://developers.contaazul.com
//   Login:  https://login.contaazul.com/#/oauth/authorize
//   Token:  POST https://api-v2.contaazul.com/oauth/token (Basic client_id:secret)
//   Dados:  GET  https://api-v2.contaazul.com/v1/pessoas/conta-conectada  (a empresa)
//           GET  https://api-v2.contaazul.com/v1/pessoas                  (clientes e fornecedores)
//
// O access_token vale 1 hora; o refresh_token MUDA a cada renovação.

const URL_LOGIN = "https://login.contaazul.com/#/oauth/authorize";
const URL_TOKEN = "https://api-v2.contaazul.com/oauth/token";
const URL_API = "https://api-v2.contaazul.com";
const ESCOPO = "openid+profile+aws.cognito.signin.user.admin";
const MARGEM_RENOVACAO_MS = 2 * 60_000;
const TAMANHO_PAGINA = 1000; // máximo aceito pela API
const LIMITE_PAGINAS = 50;
const LOTE_GRAVACAO = 500;

export const INTEGRACAO_CONTA_AZUL = "conta_azul";

// Cookie com o state do login OAuth (proteção contra CSRF) e, ao reconectar,
// o cliente esperado: "<state>.<cliente_id>".
export const COOKIE_STATE = "worka_ca_state";

/** Cliente sem conexão, ou a autorização foi revogada/expirou. */
export class ContaAzulDesconectada extends Error {}

// ---------------------------------------------------------------------------
// Configuração

export function contaAzulConfigurada() {
  return Boolean(process.env.CONTA_AZUL_CLIENT_ID && process.env.CONTA_AZUL_CLIENT_SECRET);
}

// Precisa ser IGUAL à URL de redirecionamento cadastrada no app da Conta Azul.
export function urlRetorno(origem: string) {
  const fixa = process.env.CONTA_AZUL_REDIRECT_URI?.trim();
  if (fixa) return fixa;
  const base = process.env.APP_URL?.replace(/\/+$/, "") || origem;
  return `${base}/api/integracoes/conta-azul/retorno`;
}

export function urlAutorizacao(state: string, redirectUri: string) {
  const q = [
    "response_type=code",
    `client_id=${encodeURIComponent(process.env.CONTA_AZUL_CLIENT_ID ?? "")}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `state=${encodeURIComponent(state)}`,
    `scope=${ESCOPO}`,
  ].join("&");
  return `${URL_LOGIN}?${q}`;
}

// ---------------------------------------------------------------------------
// Tokens

type RespostaToken = { access_token: string; refresh_token: string; expires_in: number };

async function pedirToken(corpo: Record<string, string>): Promise<RespostaToken> {
  const basico = Buffer.from(`${process.env.CONTA_AZUL_CLIENT_ID}:${process.env.CONTA_AZUL_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(URL_TOKEN, {
    method: "POST",
    headers: { Authorization: `Basic ${basico}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corpo),
    cache: "no-store",
  });
  const texto = await r.text();
  if (!r.ok) {
    const e = new Error(`Conta Azul recusou o token (${r.status}): ${texto.slice(0, 300)}`) as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  const dados = JSON.parse(texto) as RespostaToken;
  if (!dados.access_token || !dados.refresh_token) throw new Error("Resposta de token da Conta Azul sem access_token/refresh_token.");
  return dados;
}

const expiraEm = (t: RespostaToken) => new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString();

// GET com um access token já obtido. Repete em caso de limite (429).
async function getComToken<T>(token: string, caminho: string, tentativa = 0): Promise<T> {
  const r = await fetch(`${URL_API}${caminho}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (r.status === 429 && tentativa < 3) {
    const espera = Number(r.headers.get("retry-after")) * 1000 || 2000 * (tentativa + 1);
    await new Promise((ok) => setTimeout(ok, Math.min(espera, 15_000)));
    return getComToken<T>(token, caminho, tentativa + 1);
  }
  if (r.status === 401) throw new ContaAzulDesconectada("A Conta Azul recusou o acesso. Reconecte este cliente.");
  if (!r.ok) throw new Error(`Conta Azul respondeu ${r.status} em ${caminho}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()) as T;
}

// Access token válido do cliente, renovando quando faltam menos de 2 minutos.
async function accessToken(clienteId: string): Promise<string> {
  const supabase = createAdminClient();
  const ler = async () => {
    const { data, error } = await supabase
      .from("conta_azul_conexoes")
      .select("access_token, refresh_token, expira_em")
      .eq("cliente_id", clienteId)
      .maybeSingle();
    if (error) throw new Error(`Falha ao ler a conexão: ${error.message}`);
    if (!data) throw new ContaAzulDesconectada("Cliente sem conexão com a Conta Azul.");
    return data as { access_token: string | null; refresh_token: string; expira_em: string | null };
  };

  const atual = await ler();
  if (atual.access_token && atual.expira_em && new Date(atual.expira_em).getTime() - Date.now() > MARGEM_RENOVACAO_MS) {
    return atual.access_token;
  }

  try {
    const t = await pedirToken({ grant_type: "refresh_token", refresh_token: atual.refresh_token });
    // Grava só se ninguém renovou no meio do caminho (o refresh_token gira).
    await supabase
      .from("conta_azul_conexoes")
      .update({ access_token: t.access_token, refresh_token: t.refresh_token, expira_em: expiraEm(t), atualizado_em: new Date().toISOString() })
      .eq("cliente_id", clienteId)
      .eq("refresh_token", atual.refresh_token);
    return t.access_token;
  } catch (e) {
    // Outra execução pode ter renovado ao mesmo tempo: usa o token novo dela.
    const depois = await ler();
    if (depois.refresh_token !== atual.refresh_token && depois.access_token) return depois.access_token;
    const status = (e as { status?: number }).status;
    if (status === 400 || status === 401) {
      throw new ContaAzulDesconectada("A autorização da Conta Azul expirou ou foi revogada. Reconecte este cliente.");
    }
    throw e;
  }
}


// ---------------------------------------------------------------------------
// Normalização

const texto = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const digitos = (v: unknown) => texto(v)?.replace(/\D/g, "") || null;

type EmpresaCA = {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
};

// ---------------------------------------------------------------------------
// Conectar: troca o código, identifica a empresa e cria/vincula o cliente

export type ResultadoConexao = { clienteId: string; nome: string; criado: boolean };

export async function concluirConexao(
  code: string,
  redirectUri: string,
  usuarioId: string,
  clienteEsperado: string | null,
): Promise<ResultadoConexao> {
  const t = await pedirToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const empresa = await getComToken<EmpresaCA>(t.access_token, "/v1/pessoas/conta-conectada");
  const documento = digitos(empresa.documento);
  const razao = texto(empresa.razao_social) ?? texto(empresa.nome_fantasia);
  if (!documento || !/^(\d{11}|\d{14})$/.test(documento) || !razao) {
    throw new Error("A Conta Azul conectada não informou razão social e CNPJ/CPF válidos. Confira o cadastro da empresa na Conta Azul.");
  }

  const supabase = createAdminClient();
  let clienteId: string;
  let criado = false;

  if (clienteEsperado) {
    // Reconectar: a empresa que entrou precisa ser a do cliente.
    const { data: c } = await supabase.from("clientes").select("id, documento, razao_social").eq("id", clienteEsperado).maybeSingle();
    if (!c) throw new Error("Cliente não encontrado.");
    if (c.documento !== documento) {
      throw new Error(
        `Você entrou na Conta Azul de ${razao} (${documento}), mas está reconectando ${c.razao_social} (${c.documento}). ` +
          "Entre com o usuário da empresa certa, de preferência numa janela anônima.",
      );
    }
    clienteId = c.id as string;
  } else {
    // Adicionar: vincula ao cliente com o mesmo documento (prefere o ativo e o
    // mais antigo) ou cria um novo.
    const { data: existentes } = await supabase
      .from("clientes")
      .select("id, status, criado_em")
      .eq("documento", documento)
      .order("criado_em", { ascending: true });
    const existente = (existentes ?? []).sort((a, b) => Number(b.status === "ativo") - Number(a.status === "ativo"))[0];
    if (existente) {
      clienteId = existente.id as string;
    } else {
      const { data: novo, error } = await supabase
        .from("clientes")
        .insert({
          documento,
          razao_social: razao,
          fantasia: texto(empresa.nome_fantasia),
          email: texto(empresa.email)?.toLowerCase() ?? null,
          telefone: digitos(empresa.telefone),
          tipo_inscricao: documento.length === 14 ? 1 : null,
          status: "ativo",
        })
        .select("id")
        .single();
      if (error || !novo) throw new Error(`Falha ao criar o cliente: ${error?.message ?? "sem retorno"}`);
      clienteId = novo.id as string;
      criado = true;
    }
  }

  const agora = new Date().toISOString();
  const { error } = await supabase.from("conta_azul_conexoes").upsert({
    cliente_id: clienteId,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expira_em: expiraEm(t),
    empresa_nome: texto(empresa.nome_fantasia) || razao,
    empresa_documento: documento,
    conectado_por: usuarioId,
    conectado_em: agora,
    atualizado_em: agora,
    ultimo_erro: null,
  });
  if (error) throw new Error(`Falha ao gravar a conexão: ${error.message}`);

  return { clienteId, nome: razao, criado };
}

// ---------------------------------------------------------------------------
// Sincronizar um cliente: cadastro, clientes e fornecedores, financeiro, vendas e notas

// Datas em Brasília (AAAA-MM-DD).
const diaBR = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const somarDiasISO = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

async function gravarEmLotes(tabela: string, linhas: Record<string, unknown>[]) {
  const supabase = createAdminClient();
  for (let i = 0; i < linhas.length; i += LOTE_GRAVACAO) {
    const { error } = await supabase.from(tabela).upsert(linhas.slice(i, i + LOTE_GRAVACAO));
    if (error) throw new Error(`Falha ao gravar ${tabela}: ${error.message}`);
  }
}

// Remove do cliente o que não foi regravado nesta rodada (sumiu da Conta Azul).
async function limparAntigos(tabela: string, clienteId: string, agora: string, filtro?: Record<string, string>) {
  let q = createAdminClient().from(tabela).delete().eq("cliente_id", clienteId).lt("atualizado_em", agora);
  for (const [k, v] of Object.entries(filtro ?? {})) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw new Error(`Falha ao limpar ${tabela}: ${error.message}`);
}

// --- Cadastro da empresa ---------------------------------------------------

async function sincronizarCadastro(clienteId: string, token: string, agora: string) {
  const empresa = await getComToken<EmpresaCA>(token, "/v1/pessoas/conta-conectada");
  const atualizar: Record<string, string> = { sincronizado_em: agora };
  const razao = texto(empresa.razao_social);
  if (razao) atualizar.razao_social = razao;
  const fantasia = texto(empresa.nome_fantasia);
  if (fantasia) atualizar.fantasia = fantasia;
  const email = texto(empresa.email)?.toLowerCase();
  if (email) atualizar.email = email;
  const telefone = digitos(empresa.telefone);
  if (telefone) atualizar.telefone = telefone;
  await createAdminClient().from("clientes").update(atualizar).eq("id", clienteId);
  return fantasia || razao || null;
}

// --- Clientes e fornecedores -----------------------------------------------

type PessoaCA = {
  id: string;
  nome?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  ativo?: boolean | null;
  tipo_pessoa?: string | null;
  perfis?: string[] | null;
};

// A API filtra um perfil e um tipo de pessoa por vez (o padrão dela é só
// "Física"), então percorre as combinações.
async function sincronizarPessoas(clienteId: string, token: string, agora: string) {
  const todas = new Map<string, PessoaCA & { perfisVistos: Set<string> }>();
  for (const perfil of ["Cliente", "Fornecedor"]) {
    for (const tipo of ["Jurídica", "Física", "Estrangeira"]) {
      for (let pagina = 1; pagina <= LIMITE_PAGINAS; pagina++) {
        const q = new URLSearchParams({ pagina: String(pagina), tamanho_pagina: String(TAMANHO_PAGINA), tipo_perfil: perfil, tipos_pessoa: tipo });
        const r = await getComToken<{ items?: PessoaCA[] }>(token, `/v1/pessoas?${q}`);
        const itens = r.items ?? [];
        for (const p of itens) {
          if (!p?.id) continue;
          const atual = todas.get(p.id) ?? { ...p, perfisVistos: new Set<string>() };
          for (const x of p.perfis ?? []) atual.perfisVistos.add(x);
          atual.perfisVistos.add(perfil);
          todas.set(p.id, atual);
        }
        if (itens.length < TAMANHO_PAGINA) break;
      }
    }
  }
  const linhas = [...todas.values()].map((p) => ({
    cliente_id: clienteId,
    id: p.id,
    nome: texto(p.nome) ?? "(sem nome)",
    documento: digitos(p.documento),
    email: texto(p.email)?.toLowerCase() ?? null,
    telefone: digitos(p.telefone),
    tipo_pessoa: texto(p.tipo_pessoa),
    perfis: [...p.perfisVistos],
    ativo: p.ativo !== false,
    atualizado_em: agora,
  }));
  await gravarEmLotes("conta_azul_pessoas", linhas);
  await limparAntigos("conta_azul_pessoas", clienteId, agora);
  return linhas.length;
}

// --- Financeiro: contas a receber e a pagar em aberto ----------------------

type ParcelaCA = {
  id: string;
  descricao?: string | null;
  data_vencimento?: string | null;
  data_competencia?: string | null;
  total?: number | null;
  pago?: number | null;
  nao_pago?: number | null;
  status?: string | null;
  status_traduzido?: string | null;
  cliente?: { nome?: string | null } | null;
  fornecedor?: { nome?: string | null } | null;
};

const PAGINA_PARCELAS = 200;

async function sincronizarParcelas(clienteId: string, token: string, agora: string) {
  // A API exige um intervalo de vencimento de até 365 dias.
  const hoje = diaBR(new Date());
  const de = somarDiasISO(hoje, -330);
  const ate = somarDiasISO(hoje, 30);
  let total = 0;
  for (const [tipo, caminho] of [["receber", "contas-a-receber"], ["pagar", "contas-a-pagar"]] as const) {
    const linhas: Record<string, unknown>[] = [];
    for (let pagina = 1; pagina <= LIMITE_PAGINAS; pagina++) {
      const q = new URLSearchParams({
        pagina: String(pagina),
        tamanho_pagina: String(PAGINA_PARCELAS),
        data_vencimento_de: de,
        data_vencimento_ate: ate,
        status: "EM_ABERTO,ATRASADO,RECEBIDO_PARCIAL",
      });
      const r = await getComToken<{ itens?: ParcelaCA[] }>(token, `/v1/financeiro/${caminho}?${q}`);
      const itens = r.itens ?? [];
      for (const p of itens) {
        if (!p?.id) continue;
        linhas.push({
          cliente_id: clienteId,
          tipo,
          id: p.id,
          descricao: texto(p.descricao),
          contraparte: texto((tipo === "receber" ? p.cliente : p.fornecedor)?.nome),
          vencimento: texto(p.data_vencimento)?.slice(0, 10) ?? null,
          competencia: texto(p.data_competencia)?.slice(0, 10) ?? null,
          total: numero(p.total),
          pago: numero(p.pago),
          nao_pago: numero(p.nao_pago),
          status: texto(p.status_traduzido) ?? texto(p.status),
          atualizado_em: agora,
        });
      }
      if (itens.length < PAGINA_PARCELAS) break;
    }
    await gravarEmLotes("conta_azul_parcelas", linhas);
    await limparAntigos("conta_azul_parcelas", clienteId, agora, { tipo });
    total += linhas.length;
  }
  return total;
}

// --- Contas financeiras e saldos ------------------------------------------

type ContaCA = { id: string; nome?: string | null; tipo?: string | null; banco?: string | null };

async function sincronizarContas(clienteId: string, token: string, agora: string) {
  const q = new URLSearchParams({ pagina: "1", tamanho_pagina: "1000", apenas_ativo: "true" });
  const r = await getComToken<{ itens?: ContaCA[] }>(token, `/v1/financeiro/contas-financeiras?${q}`);
  const linhas: Record<string, unknown>[] = [];
  for (const c of r.itens ?? []) {
    if (!c?.id) continue;
    let saldo: number | null = null;
    try {
      const s = await getComToken<{ saldo_atual?: number }>(token, `/v1/financeiro/contas-financeiras/${encodeURIComponent(c.id)}/saldo-atual`);
      saldo = typeof s.saldo_atual === "number" ? s.saldo_atual : null;
    } catch (e) {
      if (e instanceof ContaAzulDesconectada) throw e;
      // Algumas contas (ex.: meios de recebimento) podem não ter saldo: segue sem.
    }
    linhas.push({ cliente_id: clienteId, id: c.id, nome: texto(c.nome) ?? "Conta", tipo: texto(c.tipo), banco: texto(c.banco), saldo, atualizado_em: agora });
  }
  await gravarEmLotes("conta_azul_contas", linhas);
  await limparAntigos("conta_azul_contas", clienteId, agora);
  return linhas.length;
}

// --- Vendas e notas (últimos 3 meses) -------------------------------------

const MESES = 3;

function mesesRecentes() {
  const hoje = diaBR(new Date());
  const [a, m] = hoje.split("-").map(Number);
  return Array.from({ length: MESES }, (_, i) => {
    const ini = new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 10);
    const fim = new Date(Date.UTC(a, m - i, 0)).toISOString().slice(0, 10);
    return { competencia: ini, de: ini, ate: fim < hoje ? fim : hoje };
  });
}

async function contarVendas(token: string, de: string, ate: string) {
  const q = new URLSearchParams({ pagina: "1", tamanho_pagina: "10", data_inicio: de, data_fim: ate, totais: "ALL" });
  const r = await getComToken<{ totais?: { aprovado?: number }; quantidades?: { aprovado?: number } }>(token, `/v1/venda/busca?${q}`);
  return { total: numero(r.totais?.aprovado), qtd: Math.round(numero(r.quantidades?.aprovado)) };
}

// NFS-e: a API aceita janelas de até 15 dias; soma as emitidas.
async function somarNfse(token: string, de: string, ate: string) {
  let total = 0;
  let qtd = 0;
  for (let ini = de; ini <= ate; ini = somarDiasISO(ini, 15)) {
    const fimJanela = somarDiasISO(ini, 14) < ate ? somarDiasISO(ini, 14) : ate;
    for (let pagina = 1; pagina <= LIMITE_PAGINAS; pagina++) {
      const q = new URLSearchParams({
        pagina: String(pagina),
        tamanho_pagina: "100",
        data_competencia_de: ini,
        data_competencia_ate: fimJanela,
        status: "EMITIDA,CORRIGIDA_SUCESSO",
      });
      const r = await getComToken<{ itens?: { valor_total_nfse?: number }[]; paginacao?: { total_paginas?: number } }>(
        token,
        `/v1/notas-fiscais-servico?${q}`,
      );
      for (const n of r.itens ?? []) {
        total += numero(n.valor_total_nfse);
        qtd++;
      }
      if ((r.itens?.length ?? 0) < 100 || pagina >= (r.paginacao?.total_paginas ?? 1)) break;
    }
  }
  return { total, qtd };
}

// NF-e emitidas no período (a listagem não traz o valor).
async function contarNfe(token: string, de: string, ate: string) {
  let qtd = 0;
  for (let pagina = 1; pagina <= LIMITE_PAGINAS; pagina++) {
    const q = new URLSearchParams({ pagina: String(pagina), tamanho_pagina: "100", data_inicial: de, data_final: ate });
    const r = await getComToken<{ itens?: unknown[] }>(token, `/v1/notas-fiscais?${q}`);
    const n = r.itens?.length ?? 0;
    qtd += n;
    if (n < 100) break;
  }
  return qtd;
}

// Devolve as fontes que falharam (a empresa pode não usar vendas, NFS-e ou NF-e).
async function sincronizarMensal(clienteId: string, token: string, agora: string) {
  const falhas: string[] = [];
  const meses = mesesRecentes();
  const linhas: Record<string, unknown>[] = [];
  for (const m of meses) {
    const linha: Record<string, unknown> = { cliente_id: clienteId, competencia: m.competencia, atualizado_em: agora };
    const tentar = async (rotulo: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        if (e instanceof ContaAzulDesconectada) throw e;
        console.error(`Conta Azul: ${rotulo} do cliente ${clienteId}`, e);
        if (!falhas.includes(rotulo)) falhas.push(rotulo);
      }
    };
    await tentar("vendas", async () => {
      const v = await contarVendas(token, m.de, m.ate);
      linha.vendas_total = v.total;
      linha.vendas_qtd = v.qtd;
    });
    await tentar("NFS-e", async () => {
      const s = await somarNfse(token, m.de, m.ate);
      linha.nfse_total = s.total;
      linha.nfse_qtd = s.qtd;
    });
    await tentar("NF-e", async () => {
      linha.nfe_qtd = await contarNfe(token, m.de, m.ate);
    });
    linhas.push(linha);
  }
  await gravarEmLotes("conta_azul_mensal", linhas);
  // Meses que saíram da janela.
  const { error } = await createAdminClient()
    .from("conta_azul_mensal")
    .delete()
    .eq("cliente_id", clienteId)
    .lt("competencia", meses[meses.length - 1].competencia);
  if (error) throw new Error(`Falha ao limpar conta_azul_mensal: ${error.message}`);
  return falhas;
}

// --- Um cliente, todas as áreas -------------------------------------------

export type ResultadoCliente =
  | { ok: true; pessoas: number; parcelas: number; contas: number; avisos: string[] }
  | { ok: false; erro: string; desconectado: boolean };

export async function sincronizarCliente(clienteId: string): Promise<ResultadoCliente> {
  const supabase = createAdminClient();
  const agora = new Date().toISOString();
  const avisos: string[] = [];
  let pessoas = 0;
  let parcelas = 0;
  let contas = 0;
  let nome: string | null = null;

  // Cada área roda separada: uma falha não impede as outras (vai para os avisos).
  const area = async (rotulo: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      if (e instanceof ContaAzulDesconectada) throw e;
      console.error(`Conta Azul: ${rotulo} do cliente ${clienteId}`, e);
      avisos.push(`${rotulo}: ${e instanceof Error ? e.message : "falha inesperada"}`);
    }
  };

  try {
    const token = await accessToken(clienteId);
    await area("Cadastro", async () => {
      nome = await sincronizarCadastro(clienteId, token, agora);
    });
    await area("Clientes e fornecedores", async () => {
      pessoas = await sincronizarPessoas(clienteId, token, agora);
    });
    await area("Contas a receber e a pagar", async () => {
      parcelas = await sincronizarParcelas(clienteId, token, agora);
    });
    await area("Saldos", async () => {
      contas = await sincronizarContas(clienteId, token, agora);
    });
    await area("Vendas e notas", async () => {
      const semAcesso = await sincronizarMensal(clienteId, token, agora);
      if (semAcesso.length) avisos.push(`Não foi possível ler: ${semAcesso.join(", ")}`);
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Falha inesperada.";
    console.error(`Conta Azul: falha ao sincronizar o cliente ${clienteId}`, e);
    await supabase.from("conta_azul_conexoes").update({ ultimo_erro: erro.slice(0, 1000) }).eq("cliente_id", clienteId);
    return { ok: false, erro, desconectado: e instanceof ContaAzulDesconectada };
  }

  await supabase
    .from("conta_azul_conexoes")
    .update({
      sincronizado_em: agora,
      ultimo_erro: avisos.length ? avisos.join(" · ").slice(0, 1000) : null,
      ...(nome ? { empresa_nome: nome } : {}),
    })
    .eq("cliente_id", clienteId);
  return { ok: true, pessoas, parcelas, contas, avisos };
}

// ---------------------------------------------------------------------------
// Sincronizar todos (rotina diária): do mais desatualizado para o mais novo,
// até o limite de tempo; o que sobrar fica para a próxima rodada.

export type ResultadoGeral = { conexoes: number; processadas: number; ok: number; falhas: number; pendentes: number };

export async function sincronizarTodos({ origem, limiteMs = 240_000 }: { origem: string; limiteMs?: number }): Promise<ResultadoGeral> {
  const iniciadoEm = new Date();
  const supabase = createAdminClient();

  if (!contaAzulConfigurada()) {
    await registrarExecucao({
      integracao: INTEGRACAO_CONTA_AZUL, status: "erro", origem, iniciadoEm,
      mensagem: "Integração não configurada no servidor (CONTA_AZUL_CLIENT_ID e CONTA_AZUL_CLIENT_SECRET).",
    });
    return { conexoes: 0, processadas: 0, ok: 0, falhas: 0, pendentes: 0 };
  }

  const { data } = await supabase
    .from("conta_azul_conexoes")
    .select("cliente_id, clientes(razao_social)")
    .order("sincronizado_em", { ascending: true, nullsFirst: true });
  const conexoes = (data ?? []) as unknown as { cliente_id: string; clientes: { razao_social: string } | null }[];

  let ok = 0;
  let pessoas = 0;
  const erros: string[] = [];
  let processadas = 0;
  for (const c of conexoes) {
    if (Date.now() - iniciadoEm.getTime() > limiteMs) break;
    const r = await sincronizarCliente(c.cliente_id);
    processadas++;
    if (r.ok) {
      ok++;
      pessoas += r.pessoas;
    } else {
      erros.push(`${c.clientes?.razao_social ?? c.cliente_id}: ${r.erro}`);
    }
  }
  const pendentes = conexoes.length - processadas;
  const falhas = erros.length;

  await registrarExecucao({
    integracao: INTEGRACAO_CONTA_AZUL,
    status: conexoes.length === 0 ? "recusado" : falhas && !ok ? "erro" : "sucesso",
    origem,
    iniciadoEm,
    mensagem:
      conexoes.length === 0
        ? "Nenhum cliente conectado à Conta Azul."
        : `${ok} de ${processadas} empresas sincronizadas · ${pessoas} clientes e fornecedores` +
          (falhas ? ` · ${falhas} com erro` : "") +
          (pendentes ? ` · ${pendentes} ficaram para a próxima rodada` : ""),
    resultado: { recebidas: processadas, atualizadas: ok, detalhes: { erros: erros.slice(0, 50) } },
  });
  return { conexoes: conexoes.length, processadas, ok, falhas, pendentes };
}

// ---------------------------------------------------------------------------
// Tela (nunca devolve tokens)

export type ConexaoResumo = {
  clienteId: string;
  cliente: string;
  empresa: string | null;
  documento: string | null;
  conectadoEm: string;
  sincronizadoEm: string | null;
  erro: string | null;
  pessoas: number;
};

export async function listarConexoes(): Promise<ConexaoResumo[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("conta_azul_conexoes")
    .select("cliente_id, empresa_nome, empresa_documento, conectado_em, sincronizado_em, ultimo_erro, clientes(razao_social, fantasia)")
    .order("conectado_em", { ascending: false });
  const linhas = (data ?? []) as unknown as {
    cliente_id: string; empresa_nome: string | null; empresa_documento: string | null; conectado_em: string;
    sincronizado_em: string | null; ultimo_erro: string | null; clientes: { razao_social: string; fantasia: string | null } | null;
  }[];

  // Quantidade de clientes e fornecedores lidos de cada empresa.
  const contagens = await Promise.all(
    linhas.map(async (l) => {
      const { count } = await supabase
        .from("conta_azul_pessoas")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", l.cliente_id);
      return count ?? 0;
    }),
  );

  return linhas.map((l, i) => ({
    clienteId: l.cliente_id,
    cliente: l.clientes?.fantasia || l.clientes?.razao_social || "—",
    empresa: l.empresa_nome,
    documento: l.empresa_documento,
    conectadoEm: l.conectado_em,
    sincronizadoEm: l.sincronizado_em,
    erro: l.ultimo_erro,
    pessoas: contagens[i],
  }));
}

export async function desconectarCliente(clienteId: string) {
  const { error } = await createAdminClient().from("conta_azul_conexoes").delete().eq("cliente_id", clienteId);
  if (error) throw new Error(`Falha ao desconectar: ${error.message}`);
}
