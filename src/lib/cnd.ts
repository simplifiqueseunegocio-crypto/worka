import "server-only";
import { createClient } from "@/lib/supabase/server";

export type TipoCnd = "federal" | "fgts" | "trabalhista" | "estadual" | "municipal";
export type StatusCnd = "regular" | "pendente" | "erro";
// Na tela, a estadual e a municipal de quem está fora da cobertura (cnd_cobertura),
// e "dispensada" quando o cliente não acompanha o tipo (cliente_certidao_tipos).
export type StatusCndTela = StatusCnd | "sem_cobertura" | "dispensada";
export type SituacaoCliente = StatusCnd | "sem_consulta";

// Certidões mostradas na tela. A trabalhista (CNDT/TST) fica de fora: o site do
// TST exige captcha em toda emissão e não há rotina automática para ela.
export const TIPOS_CND: { tipo: TipoCnd; rotulo: string; descricao: string }[] = [
  { tipo: "federal", rotulo: "Federal", descricao: "RFB/PGFN e INSS" },
  { tipo: "fgts", rotulo: "FGTS", descricao: "CRF da Caixa" },
  { tipo: "estadual", rotulo: "Estadual", descricao: "SEFAZ da UF" },
  { tipo: "municipal", rotulo: "Municipal", descricao: "Prefeitura" },
];

export type LinhaCnd = {
  cliente_id: string;
  codigo_dominio: number | null;
  tipo_inscricao: number | null;
  documento: string;
  razao_social: string;
  fantasia: string | null;
  uf: string | null;
  municipio: string | null;
  cliente_status: "ativo" | "suspenso" | "encerrado";
  busca_cnd: boolean;
  pendencias: number;
  erros: number;
  consultado_em: string | null;
  mensagens: Partial<Record<TipoCnd, string>> | null;
  na_fila: boolean;
  situacao: SituacaoCliente;
} & Record<TipoCnd, StatusCndTela | null>;

export type FiltrosCnd = {
  busca: string;
  situacao: SituacaoCliente | "";
  ordem: OrdemCnd;
  pagina: number;
};

// "" é o padrão (mais pendências primeiro) e fica fora da URL.
export const ORDENACOES_CND = [
  { ordem: "", rotulo: "Mais pendências primeiro" },
  { ordem: "menos", rotulo: "Menos pendências primeiro" },
  { ordem: "az", rotulo: "Nome (A–Z)" },
  { ordem: "za", rotulo: "Nome (Z–A)" },
] as const;
export type OrdemCnd = (typeof ORDENACOES_CND)[number]["ordem"];

export const POR_PAGINA_CND = 25;
const SITUACOES = ["pendente", "regular", "erro", "sem_consulta"] as const;

// Antes de aplicar a migration de CND, a view não existe.
export class CndIndisponivel extends Error {}
function falha(error: { code?: string; message: string }, acao: string): never {
  if (error.code === "PGRST205" || error.code === "42P01") throw new CndIndisponivel();
  throw new Error(`Falha ao ${acao}: ${error.message}`);
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function lerFiltrosCnd(params: Record<string, string | string[] | undefined>): FiltrosCnd {
  const situacao = um(params.situacao);
  const ordem = um(params.ordem);
  const pagina = Number.parseInt(um(params.pagina), 10);
  return {
    busca: um(params.busca).trim().slice(0, 80),
    situacao: (SITUACOES as readonly string[]).includes(situacao) ? (situacao as FiltrosCnd["situacao"]) : "",
    ordem: ORDENACOES_CND.some((o) => o.ordem === ordem) ? (ordem as OrdemCnd) : "",
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

// Clientes na tela: busca mensal ligada, ou consultados/pedidos sob demanda.
const ACOMPANHADOS = "busca_cnd.eq.true,na_fila.eq.true,consultado_em.not.is.null";

const COLUNAS =
  "cliente_id, codigo_dominio, tipo_inscricao, documento, razao_social, fantasia, uf, municipio, cliente_status, busca_cnd, federal, fgts, trabalhista, estadual, municipal, pendencias, erros, consultado_em, mensagens, na_fila, situacao";

// Clientes ativos acompanhados (busca ligada ou consultados sob demanda) com a
// última situação de cada certidão. Por padrão, pendências primeiro: é o que a equipe precisa resolver.
export async function listarCnd(f: FiltrosCnd) {
  const supabase = await createClient();
  let consulta = supabase
    .from("cnd_painel")
    .select(COLUNAS, { count: "exact" })
    .eq("cliente_status", "ativo");

  if (f.situacao) consulta = consulta.eq("situacao", f.situacao);
  if (f.busca) {
    const termo = f.busca.replace(/[,()*%\\]/g, " ").trim();
    const digitos = termo.replace(/\D/g, "");
    const condicoes = [`razao_social.ilike.*${termo}*`, `fantasia.ilike.*${termo}*`];
    if (digitos.length >= 3) condicoes.push(`documento.like.*${digitos}*`);
    if (/^\d{1,6}$/.test(termo)) condicoes.push(`codigo_dominio.eq.${termo}`);
    // Um único "or" do PostgREST: acompanhado E (algum termo da busca).
    consulta = consulta.or(`and(or(${ACOMPANHADOS}),or(${condicoes.join(",")}))`);
  } else {
    consulta = consulta.or(ACOMPANHADOS);
  }

  if (f.ordem === "az" || f.ordem === "za") {
    consulta = consulta.order("razao_social", { ascending: f.ordem === "az" });
  } else {
    const ascending = f.ordem === "menos";
    consulta = consulta
      .order("pendencias", { ascending })
      .order("erros", { ascending })
      .order("razao_social");
  }

  const inicio = (f.pagina - 1) * POR_PAGINA_CND;
  const { data, count, error } = await consulta
    .order("cliente_id")
    .range(inicio, inicio + POR_PAGINA_CND - 1);

  if (error) falha(error, "listar CNDs");
  return { linhas: (data ?? []) as unknown as LinhaCnd[], total: count ?? 0 };
}

export async function resumoCnd() {
  const supabase = await createClient();
  const base = () =>
    supabase
      .from("cnd_painel")
      .select("cliente_id", { count: "exact", head: true })
      .or(ACOMPANHADOS)
      .eq("cliente_status", "ativo");

  const [monitorados, pendente, regular, erro, semConsulta, fila, ultima] = await Promise.all([
    base(),
    base().eq("situacao", "pendente"),
    base().eq("situacao", "regular"),
    base().eq("situacao", "erro"),
    base().eq("situacao", "sem_consulta"),
    supabase.from("cnd_consultas").select("id", { count: "exact", head: true }).in("status", ["na_fila", "processando"]),
    supabase
      .from("cnd_consultas")
      .select("processada_em")
      .not("processada_em", "is", null)
      .order("processada_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (monitorados.error) falha(monitorados.error, "resumir CNDs");

  return {
    monitorados: monitorados.count ?? 0,
    pendente: pendente.count ?? 0,
    regular: regular.count ?? 0,
    erro: erro.count ?? 0,
    semConsulta: semConsulta.count ?? 0,
    naFila: fila.count ?? 0,
    ultimaConsulta: (ultima.data?.processada_em as string | undefined) ?? null,
  };
}

// Situação de um cliente, para a página do cliente. null = nunca consultado.
export async function cndDoCliente(clienteId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cnd_painel").select(COLUNAS).eq("cliente_id", clienteId).maybeSingle();
  if (error) falha(error, "ler a CND do cliente");
  return data as unknown as LinhaCnd | null;
}

// Próxima rodada automática: dia 23 deste mês ou do próximo (Brasília).
export function proximaRodada(agora = new Date()) {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(agora)
    .split("-")
    .map(Number);
  const proxima = dia < 23 ? new Date(Date.UTC(ano, mes - 1, 23)) : new Date(Date.UTC(ano, mes, 23));
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }).format(proxima);
}
