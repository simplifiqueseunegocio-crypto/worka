import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Usuario } from "@/lib/auth";
import { competenciaPadrao, hojeISO, listarDepartamentos, meusDepartamentos, type Departamento } from "@/lib/tarefas";

// Relatórios de pontualidade sobre as tarefas de um período de competências.
// "No prazo": concluída até o prazo legal (data de conclusão no fuso de SP).
// "Atraso": concluída depois do prazo legal, ou ainda aberta com ele vencido.
// Dispensadas não entram na pontualidade.

export type FiltrosRelatorio = {
  de: string; // "AAAA-MM"
  ate: string; // "AAAA-MM"
  departamento: string; // slug ou ""
};

export type Indicadores = {
  total: number;
  concluidas: number;
  noPrazo: number;
  naMeta: number; // concluídas até a meta interna
  entreguesComAtraso: number;
  abertas: number;
  abertasAtrasadas: number;
  dispensadas: number;
};

export type LinhaColaborador = Indicadores & { id: string | null; nome: string };
export type LinhaCliente = Indicadores & {
  id: string;
  nome: string;
  razao_social: string;
  codigo_dominio: number | null;
};
export type LinhaMes = Indicadores & { competencia: string };

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_MESES = 12;
const PAGINA = 1000; // limite de linhas por resposta do PostgREST

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function somarMeses(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

const mesesEntre = (de: string, ate: string) => {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
};

// Padrão: as 6 últimas competências até a de trabalho. No máximo 12 meses.
export function lerFiltrosRelatorio(params: Record<string, string | string[] | undefined>): FiltrosRelatorio {
  const padraoAte = competenciaPadrao();
  let ate = COMPETENCIA.test(um(params.ate)) ? um(params.ate) : padraoAte;
  let de = COMPETENCIA.test(um(params.de)) ? um(params.de) : somarMeses(ate, -5);
  if (de > ate) [de, ate] = [ate, de];
  if (mesesEntre(de, ate) > MAX_MESES) de = somarMeses(ate, -(MAX_MESES - 1));
  return {
    de,
    ate,
    departamento: um(params.departamento)
      .replace(/[^a-z]/g, "")
      .slice(0, 20),
  };
}

export const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : null);
// Pontualidade: das tarefas com desfecho de prazo (concluídas ou já vencidas), quantas no prazo.
export const pontualidade = (i: Indicadores) => pct(i.noPrazo, i.concluidas + i.abertasAtrasadas);
export const atrasos = (i: Indicadores) => i.entreguesComAtraso + i.abertasAtrasadas;

const vazio = (): Indicadores => ({
  total: 0,
  concluidas: 0,
  noPrazo: 0,
  naMeta: 0,
  entreguesComAtraso: 0,
  abertas: 0,
  abertasAtrasadas: 0,
  dispensadas: 0,
});

type Tarefa = {
  competencia: string;
  status: string;
  prazo_legal: string;
  prazo_meta: string;
  concluida_em: string | null;
  responsavel_id: string | null;
  cliente_id: string;
};

const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

function somar(i: Indicadores, t: Tarefa, hoje: string) {
  i.total++;
  if (t.status === "dispensada") {
    i.dispensadas++;
  } else if (t.status === "concluida") {
    i.concluidas++;
    const dia = t.concluida_em ? diaSP.format(new Date(t.concluida_em)) : t.prazo_legal;
    if (dia <= t.prazo_legal) i.noPrazo++;
    else i.entreguesComAtraso++;
    if (dia <= t.prazo_meta) i.naMeta++;
  } else {
    i.abertas++;
    if (t.prazo_legal < hoje) i.abertasAtrasadas++;
  }
}

// Departamentos que o usuário pode ver nos relatórios: admin, todos; gestor, os dele.
export async function departamentosDoRelatorio(usuario: Usuario) {
  if (usuario.papel !== "admin" && usuario.papel !== "gestor") return [];
  const [todos, meus] = await Promise.all([
    listarDepartamentos(),
    usuario.papel === "gestor" ? meusDepartamentos(usuario.id) : null,
  ]);
  return meus ? todos.filter((d) => meus.includes(d.id)) : todos;
}

export async function gerarRelatorio(f: FiltrosRelatorio, departamentos: Departamento[]) {
  const supabase = await createClient();
  const hoje = hojeISO();
  const escolhido = departamentos.find((d) => d.slug === f.departamento);
  const ids = escolhido ? [escolhido.id] : departamentos.map((d) => d.id);

  const base = () =>
    supabase
      .from("tarefas")
      .select("competencia, status, prazo_legal, prazo_meta, concluida_em, responsavel_id, cliente_id", {
        count: "exact",
      })
      .gte("competencia", `${f.de}-01`)
      .lte("competencia", `${f.ate}-01`)
      .in("departamento_id", ids)
      .order("id");

  // Equipe e clientes vêm junto com as tarefas, sem esperar por elas.
  const auxiliares = Promise.all([
    // Inclui quem foi desativado: as tarefas antigas continuam no nome dele.
    supabase.from("profiles").select("id, nome"),
    todosOsClientes(supabase),
  ]);
  auxiliares.catch(() => undefined); // se as tarefas falharem antes, o erro delas é o que sobe

  // Primeira página traz a contagem; as demais vão em paralelo.
  const primeira = await base().range(0, PAGINA - 1);
  if (primeira.error) throw new Error(`Falha ao ler as tarefas: ${primeira.error.message}`);
  const total = primeira.count ?? 0;
  const resto = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(total / PAGINA) - 1) }, (_, i) =>
      base().range((i + 1) * PAGINA, (i + 2) * PAGINA - 1),
    ),
  );
  const tarefas = [primeira, ...resto].flatMap((r) => {
    if (r.error) throw new Error(`Falha ao ler as tarefas: ${r.error.message}`);
    return (r.data ?? []) as Tarefa[];
  });

  const [{ data: pessoas }, clientes] = await auxiliares;
  const nomePessoa = new Map((pessoas ?? []).map((p) => [p.id as string, p.nome as string]));

  const geral = vazio();
  const porMes = new Map<string, LinhaMes>();
  const porPessoa = new Map<string, LinhaColaborador>();
  const porCliente = new Map<string, LinhaCliente>();

  for (let c = f.de; c <= f.ate; c = somarMeses(c, 1)) porMes.set(c, { competencia: c, ...vazio() });

  for (const t of tarefas) {
    somar(geral, t, hoje);
    somar(porMes.get(t.competencia.slice(0, 7))!, t, hoje);

    const chave = t.responsavel_id ?? "sem";
    let p = porPessoa.get(chave);
    if (!p) {
      p = {
        id: t.responsavel_id,
        nome: t.responsavel_id ? (nomePessoa.get(t.responsavel_id) ?? "—") : "Sem responsável",
        ...vazio(),
      };
      porPessoa.set(chave, p);
    }
    somar(p, t, hoje);

    let c = porCliente.get(t.cliente_id);
    if (!c) {
      const cl = clientes.get(t.cliente_id);
      c = {
        id: t.cliente_id,
        nome: cl?.fantasia || cl?.razao_social || "—",
        razao_social: cl?.razao_social ?? "—",
        codigo_dominio: cl?.codigo_dominio ?? null,
        ...vazio(),
      };
      porCliente.set(t.cliente_id, c);
    }
    somar(c, t, hoje);
  }

  const colaboradores = [...porPessoa.values()].sort(
    (a, b) => Number(a.id === null) - Number(b.id === null) || b.total - a.total || a.nome.localeCompare(b.nome),
  );
  const clientesComAtraso = [...porCliente.values()]
    .filter((c) => atrasos(c) > 0)
    .sort((a, b) => atrasos(b) - atrasos(a) || b.abertasAtrasadas - a.abertasAtrasadas || a.nome.localeCompare(b.nome));

  return {
    geral,
    meses: [...porMes.values()],
    colaboradores,
    clientes: clientesComAtraso,
    totalClientes: porCliente.size,
    departamento: escolhido ?? null,
  };
}

async function todosOsClientes(supabase: Awaited<ReturnType<typeof createClient>>) {
  type C = { id: string; razao_social: string; fantasia: string | null; codigo_dominio: number | null };
  const mapa = new Map<string, C>();
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social, fantasia, codigo_dominio")
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(`Falha ao ler os clientes: ${error.message}`);
    for (const c of (data ?? []) as C[]) mapa.set(c.id, c);
    if (!data || data.length < PAGINA) return mapa;
  }
}
