import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { departamentos as departamentosNav } from "@/components/app-shell/navegacao";
import type { RegraObrigacao } from "@/lib/prazos";

export type StatusTarefaBanco = "pendente" | "em_andamento" | "aguardando_cliente" | "concluida" | "dispensada";

export type MinhaTarefa = {
  id: string;
  competencia: string;
  prazo_legal: string;
  prazo_meta: string;
  status: StatusTarefaBanco;
  observacao: string | null;
  concluida_em: string | null;
  cliente: { id: string; razao_social: string; fantasia: string | null; codigo_dominio: number | null };
  obrigacao: { nome: string } | null;
  departamento: { nome: string } | null;
};

// Abas da página: cada uma é também um cartão de resumo.
export type VisaoMinhasTarefas = "abertas" | "atrasadas" | "semana" | "aguardando" | "concluidas";

export type FiltrosMinhasTarefas = { visao: VisaoMinhasTarefas; busca: string };

const VISOES = ["abertas", "atrasadas", "semana", "aguardando", "concluidas"] as const;
const ABERTAS = "(pendente,em_andamento,aguardando_cliente)";
export const LIMITE_MINHAS_TAREFAS = 200;

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function lerFiltrosMinhasTarefas(params: Record<string, string | string[] | undefined>): FiltrosMinhasTarefas {
  const visao = um(params.visao);
  return {
    visao: (VISOES as readonly string[]).includes(visao) ? (visao as VisaoMinhasTarefas) : "abertas",
    busca: um(params.busca).trim().slice(0, 80),
  };
}

// Datas no fuso do escritório, como "AAAA-MM-DD" (o mesmo formato das colunas date).
const isoSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

export function hojeISO() {
  return isoSP.format(new Date());
}

export function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function listarMinhasTarefas(usuarioId: string, f: FiltrosMinhasTarefas) {
  const supabase = await createClient();
  const hoje = hojeISO();
  let consulta = supabase
    .from("tarefas")
    .select(
      "id, competencia, prazo_legal, prazo_meta, status, observacao, concluida_em, cliente:clientes!inner(id, razao_social, fantasia, codigo_dominio), obrigacao:obrigacoes(nome), departamento:departamentos(nome)",
      { count: "exact" },
    )
    .eq("responsavel_id", usuarioId);

  if (f.visao === "concluidas") consulta = consulta.in("status", ["concluida", "dispensada"]);
  else if (f.visao === "aguardando") consulta = consulta.eq("status", "aguardando_cliente");
  else consulta = consulta.filter("status", "in", ABERTAS);

  if (f.visao === "atrasadas") consulta = consulta.lt("prazo_legal", hoje);
  if (f.visao === "semana") consulta = consulta.gte("prazo_legal", hoje).lte("prazo_legal", somarDias(hoje, 7));

  if (f.busca) {
    // Vírgulas e parênteses quebrariam a sintaxe do filtro "or" do PostgREST.
    const termo = f.busca.replace(/[,()*%\\]/g, " ").trim();
    const condicoes = [`razao_social.ilike.*${termo}*`, `fantasia.ilike.*${termo}*`];
    if (/^\d{1,6}$/.test(termo)) condicoes.push(`codigo_dominio.eq.${termo}`);
    consulta = consulta.or(condicoes.join(","), { referencedTable: "clientes" });
  }

  consulta =
    f.visao === "concluidas"
      ? consulta.order("concluida_em", { ascending: false, nullsFirst: false }).order("atualizado_em", { ascending: false })
      : consulta.order("prazo_legal").order("prazo_meta");

  const { data, count, error } = await consulta.limit(LIMITE_MINHAS_TAREFAS);
  if (error) throw new Error(`Falha ao listar suas tarefas: ${error.message}`);
  return { tarefas: (data ?? []) as unknown as MinhaTarefa[], total: count ?? 0 };
}

// Contagens dos cartões de resumo (só as tarefas do usuário).
export async function resumoMinhasTarefas(usuarioId: string) {
  const supabase = await createClient();
  const hoje = hojeISO();
  const base = () =>
    supabase.from("tarefas").select("id", { count: "exact", head: true }).eq("responsavel_id", usuarioId);
  const contar = async (q: ReturnType<typeof base>) => {
    const { count, error } = await q;
    if (error) throw new Error(`Falha ao contar suas tarefas (${error.code ?? "sem código"})`);
    return count ?? 0;
  };

  const [abertas, atrasadas, semana, aguardando, concluidasNoMes] = await Promise.all([
    contar(base().filter("status", "in", ABERTAS)),
    contar(base().filter("status", "in", ABERTAS).lt("prazo_legal", hoje)),
    contar(base().filter("status", "in", ABERTAS).gte("prazo_legal", hoje).lte("prazo_legal", somarDias(hoje, 7))),
    contar(base().eq("status", "aguardando_cliente")),
    contar(base().eq("status", "concluida").gte("concluida_em", `${hoje.slice(0, 8)}01T00:00:00-03:00`)),
  ]);
  return { abertas, atrasadas, semana, aguardando, concluidasNoMes };
}

// ---------------------------------------------------------------------------
// Tarefas (todas as da competência, para gestão)

export type Departamento = { id: number; nome: string; slug: string; cor: string };
export type Responsavel = { id: string; nome: string };

export type Tarefa = MinhaTarefa & {
  departamento_id: number;
  responsavel: Responsavel | null;
};

// "atrasada" e "abertas" não são status do banco: são recortes dos status abertos.
export type StatusFiltro = StatusTarefaBanco | "atrasada" | "abertas";

export type FiltrosTarefas = {
  competencia: string; // "AAAA-MM" ou "todas"
  departamento: string; // slug
  responsavel: string; // uuid, "sem" ou ""
  status: StatusFiltro | "";
  prazo: "7d" | "";
  busca: string;
  pagina: number;
};

export const POR_PAGINA_TAREFAS = 50;
const STATUS_FILTRO = [
  "pendente",
  "em_andamento",
  "aguardando_cliente",
  "concluida",
  "dispensada",
  "atrasada",
  "abertas",
] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A competência em trabalho é a do mês anterior (o cron gera no dia 1º).
export function competenciaPadrao() {
  const [a, m] = hojeISO().split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

// Mês atual e os 11 anteriores, do mais recente ao mais antigo.
export function competenciasRecentes() {
  const [a, m] = hojeISO().split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    const valor = d.toISOString().slice(0, 7);
    const rotulo = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    return { valor, rotulo: rotulo.charAt(0).toUpperCase() + rotulo.slice(1) };
  });
}

export function lerFiltrosTarefas(params: Record<string, string | string[] | undefined>): FiltrosTarefas {
  const status = um(params.status);
  const responsavel = um(params.responsavel);
  const pagina = Number.parseInt(um(params.pagina), 10);
  const filtros: Omit<FiltrosTarefas, "competencia"> = {
    departamento: um(params.departamento).replace(/[^a-z]/g, "").slice(0, 20),
    responsavel: responsavel === "sem" || UUID.test(responsavel) ? responsavel : "",
    status: (STATUS_FILTRO as readonly string[]).includes(status) ? (status as StatusFiltro) : "",
    prazo: um(params.prazo) === "7d" ? "7d" : "",
    busca: um(params.busca).trim().slice(0, 80),
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
  const competencia = um(params.competencia);
  // Atrasadas e "vencem em 7 dias" (links do painel) olham todas as competências,
  // a não ser que uma seja escolhida.
  const padrao = filtros.status === "atrasada" || filtros.prazo === "7d" ? "todas" : competenciaPadrao();
  return {
    ...filtros,
    competencia: competencia === "todas" || /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) ? competencia : padrao,
  };
}

// cache(): menu, página e filtros leem os departamentos uma vez só por requisição.
export const listarDepartamentos = cache(async (): Promise<Departamento[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("departamentos").select("id, nome").order("id");
  if (error) throw new Error(`Falha ao listar departamentos: ${error.message}`);
  return (data ?? []).map((d) => {
    const nav = departamentosNav.find((n) => n.nome === d.nome);
    const slug = nav?.slug ?? d.nome.normalize("NFD").replace(/[^a-zA-Z]/g, "").toLowerCase();
    return { id: d.id, nome: d.nome, slug, cor: nav?.cor ?? "#CBC5BB" };
  });
});

export async function listarResponsaveis(): Promise<Responsavel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
  if (error) throw new Error(`Falha ao listar a equipe: ${error.message}`);
  return data ?? [];
}

// Departamentos ligados ao usuário (o gestor gere esses; o admin gere todos).
export const meusDepartamentos = cache(async (usuarioId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_departamentos")
    .select("departamento_id")
    .eq("profile_id", usuarioId);
  if (error) throw new Error(`Falha ao ler seus departamentos: ${error.message}`);
  return (data ?? []).map((d) => d.departamento_id as number);
});

export async function listarTarefas(
  f: FiltrosTarefas,
  departamentoId: number | null,
): Promise<{ tarefas: Tarefa[]; total: number; pagina: number }> {
  const supabase = await createClient();
  const hoje = hojeISO();
  let consulta = supabase
    .from("tarefas")
    .select(
      "id, competencia, prazo_legal, prazo_meta, status, observacao, concluida_em, departamento_id, cliente:clientes!inner(id, razao_social, fantasia, codigo_dominio), obrigacao:obrigacoes(nome), departamento:departamentos(nome), responsavel:profiles!responsavel_id(id, nome)",
      { count: "exact" },
    );

  if (f.competencia !== "todas") consulta = consulta.eq("competencia", `${f.competencia}-01`);
  if (departamentoId !== null) consulta = consulta.eq("departamento_id", departamentoId);
  if (f.responsavel === "sem") consulta = consulta.is("responsavel_id", null);
  else if (f.responsavel) consulta = consulta.eq("responsavel_id", f.responsavel);

  if (f.status === "abertas" || f.status === "atrasada" || f.prazo === "7d") {
    consulta = consulta.filter("status", "in", ABERTAS);
  }
  if (f.status === "atrasada") consulta = consulta.lt("prazo_legal", hoje);
  else if (f.status && f.status !== "abertas") consulta = consulta.eq("status", f.status);
  if (f.prazo === "7d") consulta = consulta.gte("prazo_legal", hoje).lte("prazo_legal", somarDias(hoje, 7));

  if (f.busca) {
    // Vírgulas e parênteses quebrariam a sintaxe do filtro "or" do PostgREST.
    const termo = f.busca.replace(/[,()*%\\]/g, " ").trim();
    const digitos = termo.replace(/\D/g, "");
    const condicoes = [`razao_social.ilike.*${termo}*`, `fantasia.ilike.*${termo}*`];
    if (digitos.length >= 3) condicoes.push(`documento.like.*${digitos}*`);
    if (/^\d{1,6}$/.test(termo)) condicoes.push(`codigo_dominio.eq.${termo}`);
    consulta = consulta.or(condicoes.join(","), { referencedTable: "clientes" });
  }

  const inicio = (f.pagina - 1) * POR_PAGINA_TAREFAS;
  const { data, count, error } = await consulta
    .order("prazo_legal")
    .order("departamento_id")
    .order("id")
    .range(inicio, inicio + POR_PAGINA_TAREFAS - 1);
  // Página além do fim (ex.: link antigo depois de um filtro): volta para a primeira.
  if (error?.code === "PGRST103" && f.pagina > 1) return listarTarefas({ ...f, pagina: 1 }, departamentoId);
  if (error) throw new Error(`Falha ao listar tarefas: ${error.message}`);
  return { tarefas: (data ?? []) as unknown as Tarefa[], total: count ?? 0, pagina: f.pagina };
}

// Números da competência (e do departamento, se filtrado) para os cartões,
// e o progresso de cada departamento.
export async function resumoTarefas(competencia: string, departamentos: Departamento[], departamentoId: number | null) {
  const supabase = await createClient();
  const hoje = hojeISO();
  const base = (dep: number | null = departamentoId) => {
    let q = supabase.from("tarefas").select("id", { count: "exact", head: true });
    if (competencia !== "todas") q = q.eq("competencia", `${competencia}-01`);
    if (dep !== null) q = q.eq("departamento_id", dep);
    return q;
  };
  const contar = async (q: ReturnType<typeof base>) => {
    const { count, error } = await q;
    if (error) throw new Error(`Falha ao contar tarefas (${error.code ?? "sem código"})`);
    return count ?? 0;
  };
  const feitas = (q: ReturnType<typeof base>) => q.in("status", ["concluida", "dispensada"]);

  const [total, concluidas, atrasadas, semana, aguardando, semResponsavel, ...porDep] = await Promise.all([
    contar(base()),
    contar(feitas(base())),
    contar(base().filter("status", "in", ABERTAS).lt("prazo_legal", hoje)),
    contar(base().filter("status", "in", ABERTAS).gte("prazo_legal", hoje).lte("prazo_legal", somarDias(hoje, 7))),
    contar(base().eq("status", "aguardando_cliente")),
    contar(base().filter("status", "in", ABERTAS).is("responsavel_id", null)),
    ...departamentos.flatMap((d) => [contar(base(d.id)), contar(feitas(base(d.id)))]),
  ]);

  return {
    total,
    concluidas,
    atrasadas,
    semana,
    aguardando,
    semResponsavel,
    departamentos: departamentos.map((d, i) => ({ ...d, total: porDep[i * 2], concluidas: porDep[i * 2 + 1] })),
  };
}

// Obrigações ativas para o formulário de nova tarefa, com a regra de prazo
// (o formulário calcula os prazos sugeridos com src/lib/prazos.ts).
export type ObrigacaoNovaTarefa = RegraObrigacao & { id: number; nome: string; departamento_id: number };

export async function obrigacoesParaTarefa(): Promise<ObrigacaoNovaTarefa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("obrigacoes")
    .select("id, nome, departamento_id, periodicidade, dia_vencimento, meses_apos, ajuste, meta_dias_antes")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error(`Falha ao listar obrigações: ${error.message}`);
  return (data ?? []) as ObrigacaoNovaTarefa[];
}
