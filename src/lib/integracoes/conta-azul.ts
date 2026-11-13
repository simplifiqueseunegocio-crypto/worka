import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarExecucao } from "@/lib/integracoes/execucoes";

// Integração com a Conta Azul (API v2, OAuth 2.0): a lista de clientes da
// conta do escritório alimenta o cadastro de clientes da plataforma.
//
// Documentação: https://developers.contaazul.com
//   Login:  https://login.contaazul.com/#/oauth/authorize
//   Token:  POST https://api-v2.contaazul.com/oauth/token (Basic client_id:secret)
//   Dados:  GET  https://api-v2.contaazul.com/v1/pessoas?tipo_perfil=Cliente
//
// O access_token vale 1 hora; o refresh_token MUDA a cada renovação e por isso
// fica no banco (tabela conta_azul_conexao, acessível só pelo servidor).

const URL_LOGIN = "https://login.contaazul.com/#/oauth/authorize";
const URL_TOKEN = "https://api-v2.contaazul.com/oauth/token";
const URL_API = "https://api-v2.contaazul.com";
const ESCOPO = "openid+profile+aws.cognito.signin.user.admin";
const MARGEM_RENOVACAO_MS = 2 * 60_000;
const TAMANHO_PAGINA = 1000; // máximo aceito pela API
const LIMITE_PAGINAS = 50;

export const INTEGRACAO_CONTA_AZUL = "conta_azul_clientes";

// Cookie com o state do login OAuth (proteção contra CSRF).
export const COOKIE_STATE = "worka_ca_state";

/** Conta Azul não conectada, ou a autorização foi revogada/expirou. */
export class ContaAzulDesconectada extends Error {
  constructor(mensagem = "Conta Azul não conectada. Um administrador precisa conectar em Configurações → Conta Azul.") {
    super(mensagem);
  }
}

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

// Troca o código do login pelos tokens e grava a conexão (substitui a anterior).
export async function concluirConexao(code: string, redirectUri: string, usuarioId: string) {
  const t = await pedirToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const supabase = createAdminClient();
  const { error } = await supabase.from("conta_azul_conexao").upsert({
    id: 1,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expira_em: expiraEm(t),
    conectado_por: usuarioId,
    conectado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    conta_nome: null,
    conta_documento: null,
  });
  if (error) throw new Error(`Falha ao gravar a conexão: ${error.message}`);

  // Nome da empresa conectada, só para exibir. Falha aqui não desfaz a conexão.
  try {
    const conta = await chamarApi<{ razao_social?: string; nome_fantasia?: string; documento?: string }>("/v1/pessoas/conta-conectada");
    await supabase
      .from("conta_azul_conexao")
      .update({ conta_nome: conta.nome_fantasia || conta.razao_social || null, conta_documento: conta.documento ?? null })
      .eq("id", 1);
  } catch (e) {
    console.error("Conta Azul: não foi possível ler a conta conectada", e);
  }
}

// Access token válido, renovando quando faltam menos de 2 minutos.
async function accessToken(): Promise<string> {
  const supabase = createAdminClient();
  const ler = async () => {
    const { data, error } = await supabase
      .from("conta_azul_conexao")
      .select("access_token, refresh_token, expira_em")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(`Falha ao ler a conexão da Conta Azul: ${error.message}`);
    if (!data) throw new ContaAzulDesconectada();
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
      .from("conta_azul_conexao")
      .update({ access_token: t.access_token, refresh_token: t.refresh_token, expira_em: expiraEm(t), atualizado_em: new Date().toISOString() })
      .eq("id", 1)
      .eq("refresh_token", atual.refresh_token);
    return t.access_token;
  } catch (e) {
    // Outra execução pode ter renovado ao mesmo tempo: usa o token novo dela.
    const depois = await ler();
    if (depois.refresh_token !== atual.refresh_token && depois.access_token) return depois.access_token;
    const status = (e as { status?: number }).status;
    if (status === 400 || status === 401) {
      throw new ContaAzulDesconectada("A autorização da Conta Azul expirou ou foi revogada. Conecte de novo em Configurações → Conta Azul.");
    }
    throw e;
  }
}

async function chamarApi<T>(caminho: string, tentativa = 0): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${URL_API}${caminho}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  // Limite da API (cerca de 10 por segundo / 50 por minuto): espera e tenta de novo.
  if (r.status === 429 && tentativa < 3) {
    const espera = Number(r.headers.get("retry-after")) * 1000 || 2000 * (tentativa + 1);
    await new Promise((ok) => setTimeout(ok, Math.min(espera, 15_000)));
    return chamarApi<T>(caminho, tentativa + 1);
  }
  if (r.status === 401) throw new ContaAzulDesconectada("A Conta Azul recusou o acesso. Conecte de novo em Configurações → Conta Azul.");
  if (!r.ok) throw new Error(`Conta Azul respondeu ${r.status} em ${caminho}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()) as T;
}

// ---------------------------------------------------------------------------
// Clientes

type EnderecoCA = {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
};

export type PessoaCA = {
  id: string;
  nome?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  ativo?: boolean | null;
  tipo_pessoa?: string | null;
  perfis?: string[] | null;
  endereco?: EnderecoCA | null;
};

type PaginaPessoas = { items?: PessoaCA[]; totalItems?: number };

// Todas as pessoas com perfil Cliente, físicas e jurídicas (a API filtra por um
// tipo de pessoa de cada vez; o padrão dela é só "Física").
export async function listarClientesContaAzul(): Promise<PessoaCA[]> {
  const todas = new Map<string, PessoaCA>();
  for (const tipo of ["Jurídica", "Física"]) {
    for (let pagina = 1; pagina <= LIMITE_PAGINAS; pagina++) {
      const q = new URLSearchParams({
        pagina: String(pagina),
        tamanho_pagina: String(TAMANHO_PAGINA),
        tipo_perfil: "Cliente",
        tipos_pessoa: tipo,
      });
      const r = await chamarApi<PaginaPessoas>(`/v1/pessoas?${q}`);
      const itens = r.items ?? [];
      for (const p of itens) if (p?.id) todas.set(p.id, p);
      if (itens.length < TAMANHO_PAGINA) break;
    }
  }
  return [...todas.values()];
}

const texto = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const digitos = (v: unknown) => texto(v)?.replace(/\D/g, "") || null;

export type ClienteNormalizado = {
  conta_azul_id: string;
  documento: string;
  razao_social: string;
  email: string | null;
  telefone: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
};

// Só entram pessoas ATIVAS com CPF ou CNPJ válido e nome. As demais ficam de
// fora e são listadas no log.
export function normalizarClientes(pessoas: PessoaCA[]) {
  const clientes: ClienteNormalizado[] = [];
  const ignorados: string[] = [];
  let inativos = 0;

  for (const p of pessoas) {
    if (p.ativo === false) {
      inativos++;
      continue;
    }
    const nome = texto(p.nome);
    const documento = digitos(p.documento);
    if (!nome || !documento || !/^(\d{11}|\d{14})$/.test(documento)) {
      ignorados.push(`${nome ?? "(sem nome)"}: ${documento ? "documento inválido" : "sem CPF/CNPJ"}`);
      continue;
    }
    const e = p.endereco ?? {};
    const uf = texto(e.estado)?.toUpperCase() ?? null;
    clientes.push({
      conta_azul_id: p.id,
      documento,
      razao_social: nome,
      email: texto(p.email)?.toLowerCase() ?? null,
      telefone: digitos(p.telefone),
      logradouro: texto(e.logradouro),
      numero: texto(e.numero),
      complemento: texto(e.complemento),
      bairro: texto(e.bairro),
      municipio: texto(e.cidade),
      uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : null,
      cep: digitos(e.cep),
    });
  }
  return { clientes, ignorados, inativos };
}

// ---------------------------------------------------------------------------
// Sincronização

export type ResultadoSincronizacao =
  | { ok: true; recebidas: number; inseridas: number; atualizadas: number; reativadas: number; suspensas: number; vinculadas: number; ignorados: number }
  | { ok: false; status: "recusado" | "erro"; mensagem: string };

// Lê a Conta Azul, grava na tabela clientes e registra no log de sincronização.
export async function sincronizarContaAzul({ origem, forcar = false }: { origem: string; forcar?: boolean }): Promise<ResultadoSincronizacao> {
  const iniciadoEm = new Date();
  const registrar = (status: "sucesso" | "recusado" | "erro", extra: { mensagem?: string; resultado?: Record<string, unknown>; detalhes?: unknown } = {}) =>
    registrarExecucao({ integracao: INTEGRACAO_CONTA_AZUL, status, origem, iniciadoEm, forcar, ...extra });

  if (!contaAzulConfigurada()) {
    const mensagem = "Integração não configurada no servidor (CONTA_AZUL_CLIENT_ID e CONTA_AZUL_CLIENT_SECRET).";
    await registrar("erro", { mensagem });
    return { ok: false, status: "erro", mensagem };
  }

  let normalizado: ReturnType<typeof normalizarClientes>;
  try {
    normalizado = normalizarClientes(await listarClientesContaAzul());
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha ao ler os clientes da Conta Azul.";
    console.error("Conta Azul: falha na leitura", e);
    await registrar("erro", { mensagem });
    return { ok: false, status: "erro", mensagem };
  }

  const { clientes, ignorados, inativos } = normalizado;
  if (clientes.length === 0) {
    const mensagem = "Nenhum cliente ativo com CPF/CNPJ encontrado na Conta Azul. Nada foi alterado.";
    await registrar("recusado", { mensagem, detalhes: { ignorados: ignorados.slice(0, 50), inativos } });
    return { ok: false, status: "recusado", mensagem };
  }

  const { data, error } = await createAdminClient().rpc("sincronizar_clientes_conta_azul", {
    p_clientes: clientes,
    p_forcar: forcar,
  });

  if (error) {
    const recusa = error.code === "22023";
    if (!recusa) console.error("Conta Azul: falha ao gravar", error);
    const mensagem = recusa ? error.message : `Falha ao gravar no banco: ${error.message}`;
    await registrar(recusa ? "recusado" : "erro", { mensagem, resultado: { recebidas: clientes.length } });
    return { ok: false, status: recusa ? "recusado" : "erro", mensagem };
  }

  const r = data as {
    recebidas: number; inseridas: number; atualizadas: number; reativadas: number; suspensas: number; vinculadas: number;
    detalhes: Record<string, string[]>;
  };
  await registrar("sucesso", {
    resultado: { ...r, detalhes: { ...r.detalhes, ignorados: ignorados.slice(0, 50), inativos } },
  });
  return {
    ok: true,
    recebidas: r.recebidas,
    inseridas: r.inseridas,
    atualizadas: r.atualizadas,
    reativadas: r.reativadas,
    suspensas: r.suspensas,
    vinculadas: r.vinculadas,
    ignorados: ignorados.length,
  };
}

// ---------------------------------------------------------------------------
// Situação da conexão (para a tela; nunca devolve tokens)

export type SituacaoConexao = {
  conectada: boolean;
  contaNome: string | null;
  contaDocumento: string | null;
  conectadoEm: string | null;
  conectadoPor: string | null;
};

export async function situacaoConexao(): Promise<SituacaoConexao> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("conta_azul_conexao")
    .select("conta_nome, conta_documento, conectado_em, conectado_por")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return { conectada: false, contaNome: null, contaDocumento: null, conectadoEm: null, conectadoPor: null };

  let conectadoPor: string | null = null;
  if (data.conectado_por) {
    const { data: p } = await supabase.from("profiles").select("nome").eq("id", data.conectado_por).maybeSingle();
    conectadoPor = (p?.nome as string | undefined) ?? null;
  }
  return {
    conectada: true,
    contaNome: (data.conta_nome as string | null) ?? null,
    contaDocumento: (data.conta_documento as string | null) ?? null,
    conectadoEm: data.conectado_em as string,
    conectadoPor,
  };
}

export async function desconectarContaAzul() {
  const { error } = await createAdminClient().from("conta_azul_conexao").delete().eq("id", 1);
  if (error) throw new Error(`Falha ao desconectar: ${error.message}`);
}
