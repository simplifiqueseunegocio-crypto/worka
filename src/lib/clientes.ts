import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Regime = "mei" | "simples" | "presumido" | "real";
export type StatusCliente = "ativo" | "suspenso" | "encerrado";

export type Cliente = {
  id: string;
  codigo_dominio: number | null;
  tipo_inscricao: number | null;
  documento: string;
  razao_social: string;
  fantasia: string | null;
  regime: Regime | null;
  status: StatusCliente;
  uf: string | null;
  municipio: string | null;
  cnae: string | null;
  ramo_atividade: string | null;
  sincronizado_em: string | null;
};

export type FiltrosClientes = {
  busca: string;
  regime: Regime | "sem" | "";
  status: StatusCliente | "todos";
  pagina: number;
};

export const POR_PAGINA = 25;
const REGIMES = ["mei", "simples", "presumido", "real", "sem"] as const;
const STATUS = ["ativo", "suspenso", "encerrado", "todos"] as const;

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function lerFiltros(params: Record<string, string | string[] | undefined>): FiltrosClientes {
  const regime = um(params.regime);
  const status = um(params.status);
  const pagina = Number.parseInt(um(params.pagina), 10);
  return {
    busca: um(params.busca).trim().slice(0, 80),
    regime: (REGIMES as readonly string[]).includes(regime) ? (regime as FiltrosClientes["regime"]) : "",
    status: (STATUS as readonly string[]).includes(status) ? (status as FiltrosClientes["status"]) : "ativo",
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

export async function listarClientes(f: FiltrosClientes) {
  const supabase = await createClient();
  let consulta = supabase
    .from("clientes")
    .select(
      "id, codigo_dominio, tipo_inscricao, documento, razao_social, fantasia, regime, status, uf, municipio, cnae, ramo_atividade, sincronizado_em",
      { count: "exact" },
    );

  if (f.status !== "todos") consulta = consulta.eq("status", f.status);
  if (f.regime === "sem") consulta = consulta.is("regime", null);
  else if (f.regime) consulta = consulta.eq("regime", f.regime);

  if (f.busca) {
    // Vírgulas e parênteses quebrariam a sintaxe do filtro "or" do PostgREST.
    const termo = f.busca.replace(/[,()*%\\]/g, " ").trim();
    const digitos = termo.replace(/\D/g, "");
    const condicoes = [`razao_social.ilike.*${termo}*`, `fantasia.ilike.*${termo}*`];
    if (digitos.length >= 3) condicoes.push(`documento.like.*${digitos}*`);
    if (/^\d{1,6}$/.test(termo)) condicoes.push(`codigo_dominio.eq.${termo}`);
    consulta = consulta.or(condicoes.join(","));
  }

  const inicio = (f.pagina - 1) * POR_PAGINA;
  const { data, count, error } = await consulta
    .order("razao_social")
    .range(inicio, inicio + POR_PAGINA - 1);

  if (error) throw new Error(`Falha ao listar clientes: ${error.message}`);
  return { clientes: (data ?? []) as Cliente[], total: count ?? 0 };
}

export type ClienteDetalhe = Cliente & {
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  data_inicio_atividade: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  responsavel_legal: string | null;
  busca_cnd: boolean;
  status_manual?: boolean; // migration clientes_status_manual
};

// Um cliente pelo id; null se não existir (ou o id não for um uuid).
export async function obterCliente(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao ler o cliente: ${error.message}`);
  return data as ClienteDetalhe | null;
}

// Contagens dos clientes ativos por regime, para os cartões de resumo.
export async function resumoClientes() {
  const supabase = await createClient();
  const base = () => supabase.from("clientes").select("id", { count: "exact", head: true }).eq("status", "ativo");
  const contar = async (aplicar: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count } = await aplicar(base());
    return count ?? 0;
  };

  const [ativos, simples, presumido, real, mei, semRegime] = await Promise.all([
    contar((q) => q),
    contar((q) => q.eq("regime", "simples")),
    contar((q) => q.eq("regime", "presumido")),
    contar((q) => q.eq("regime", "real")),
    contar((q) => q.eq("regime", "mei")),
    contar((q) => q.is("regime", null)),
  ]);
  return { ativos, simples, presumido, real, mei, semRegime };
}

export type Contato = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  recebe_adiantamento: boolean;
};

export async function contatosDoCliente(clienteId: string): Promise<Contato[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente_contatos")
    .select("id, nome, email, telefone, cargo, recebe_adiantamento")
    .eq("cliente_id", clienteId)
    .order("nome");
  // Sem a migration do adiantamento a coluna recebe_adiantamento não existe: null.
  if (error?.code === "42703") return null;
  if (error) throw new Error(`Falha ao ler os contatos: ${error.message}`);
  return (data ?? []) as Contato[];
}

// O que some junto ao excluir o cliente, e se a exclusão é possível (o banco
// recusa cliente ativo ou que veio na última sincronização do Domínio).
export async function impactoExclusao(clienteId: string) {
  const supabase = await createClient();
  const contar = async (tabela: string) => {
    const { count } = await supabase
      .from(tabela)
      .select("*", { count: "exact", head: true })
      .eq("cliente_id", clienteId);
    return count ?? 0; // tabela de migration não aplicada conta como 0
  };
  const [tarefas, contatos, consultasCnd, certidoes, envios, { data: noDominio }] = await Promise.all([
    contar("tarefas"),
    contar("cliente_contatos"),
    contar("cnd_consultas"),
    contar("certidoes"),
    contar("adiantamento_envios"),
    supabase.rpc("cliente_no_dominio", { p_cliente_id: clienteId }),
  ]);
  return { tarefas, contatos, consultasCnd, certidoes, envios, noDominio: Boolean(noDominio) };
}
