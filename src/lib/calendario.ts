import "server-only";
import { createClient } from "@/lib/supabase/server";
import { geraNaCompetencia, prazoLegal, type RegraObrigacao } from "@/lib/prazos";
import { listarDepartamentos, type Departamento } from "@/lib/tarefas";

// Calendário de vencimentos: cada dia mostra as obrigações com prazo legal
// nele, somando as tarefas já geradas. Competências ainda não geradas aparecem
// como "prevista", calculadas pela regra do catálogo (src/lib/prazos.ts).

export type Vencimento = {
  data: string; // prazo legal, "AAAA-MM-DD"
  obrigacao: string;
  departamento: Pick<Departamento, "nome" | "slug" | "cor">;
  competencia: string; // "AAAA-MM"
  total: number;
  feitas: number; // concluídas ou dispensadas
  abertas: number;
  prevista: boolean; // ainda sem tarefas geradas
};

export type Feriado = { data: string; descricao: string };

export type FiltrosCalendario = {
  mes: string; // "AAAA-MM"
  departamento: string; // slug ou ""
  minhas: boolean;
};

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function lerFiltrosCalendario(
  params: Record<string, string | string[] | undefined>,
  hoje: string,
): FiltrosCalendario {
  const mes = um(params.mes);
  return {
    mes: /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : hoje.slice(0, 7),
    departamento: um(params.departamento)
      .replace(/[^a-z]/g, "")
      .slice(0, 20),
    minhas: um(params.minhas) === "1",
  };
}

export function somarMeses(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export function ultimoDia(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

const FEITAS = ["concluida", "dispensada"];
const PAGINA = 1000; // limite de linhas por resposta do PostgREST

type LinhaTarefa = {
  prazo_legal: string;
  competencia: string;
  status: string;
  obrigacao_id: number;
  departamento_id: number;
};
type LinhaObrigacao = RegraObrigacao & { id: number; nome: string; departamento_id: number };

export async function calendarioDoMes(f: FiltrosCalendario, usuarioId: string) {
  const supabase = await createClient();
  const inicio = `${f.mes}-01`;
  const fim = ultimoDia(f.mes);
  const departamentos = await listarDepartamentos();
  const departamento = departamentos.find((d) => d.slug === f.departamento) ?? null;

  // Tarefas com prazo legal no mês, só as colunas que o calendário soma.
  async function tarefas() {
    const linhas: LinhaTarefa[] = [];
    for (let de = 0; ; de += PAGINA) {
      let q = supabase
        .from("tarefas")
        .select("prazo_legal, competencia, status, obrigacao_id, departamento_id")
        .gte("prazo_legal", inicio)
        .lte("prazo_legal", fim);
      if (departamento) q = q.eq("departamento_id", departamento.id);
      if (f.minhas) q = q.eq("responsavel_id", usuarioId);
      const { data, error } = await q.order("id").range(de, de + PAGINA - 1);
      if (error) throw new Error(`Falha ao ler as tarefas do mês: ${error.message}`);
      linhas.push(...((data ?? []) as LinhaTarefa[]));
      if (!data || data.length < PAGINA) return linhas;
    }
  }

  const [linhas, { data: obrigacoes, error: e1 }, { data: feriados, error: e2 }] = await Promise.all([
    tarefas(),
    supabase
      .from("obrigacoes")
      .select("id, nome, departamento_id, periodicidade, dia_vencimento, meses_apos, ajuste, meta_dias_antes, ativo")
      .order("nome"),
    // Os nacionais são os que o banco usa no dia útil; um ano para cobrir o ajuste.
    supabase
      .from("feriados")
      .select("data, descricao")
      .is("uf", null)
      .gte("data", somarMeses(f.mes, -1) + "-01")
      .lte("data", ultimoDia(somarMeses(f.mes, 1)))
      .order("data"),
  ]);
  if (e1) throw new Error(`Falha ao ler as obrigações: ${e1.message}`);
  if (e2) throw new Error(`Falha ao ler os feriados: ${e2.message}`);

  const porId = new Map((obrigacoes ?? []).map((o) => [o.id as number, o as LinhaObrigacao & { ativo: boolean }]));
  const depDe = (id: number) => {
    const d = departamentos.find((x) => x.id === id);
    return { nome: d?.nome ?? "—", slug: d?.slug ?? "", cor: d?.cor ?? "#CBC5BB" };
  };

  const mapa = new Map<string, Vencimento>();
  for (const t of linhas) {
    const competencia = t.competencia.slice(0, 7);
    const chave = `${t.prazo_legal}|${t.obrigacao_id}|${competencia}`;
    let v = mapa.get(chave);
    if (!v) {
      v = {
        data: t.prazo_legal,
        obrigacao: porId.get(t.obrigacao_id)?.nome ?? "Obrigação",
        departamento: depDe(t.departamento_id),
        competencia,
        total: 0,
        feitas: 0,
        abertas: 0,
        prevista: false,
      };
      mapa.set(chave, v);
    }
    v.total++;
    if (FEITAS.includes(t.status)) v.feitas++;
    else v.abertas++;
  }

  // Previstas: competências cujo vencimento cai no mês e que ainda não têm
  // tarefas. Só na visão geral (nas "minhas" não há como saber de quem serão).
  if (!f.minhas) {
    const feriadosSet = new Set((feriados ?? []).map((x) => x.data as string));
    const geradas = await competenciasGeradas(supabase, f.mes);
    for (const o of porId.values()) {
      if (!o.ativo || (departamento && o.departamento_id !== departamento.id)) continue;
      // O vencimento cai meses_apos depois da competência; o ajuste de dia útil
      // pode empurrar para o mês vizinho, por isso olha três competências.
      for (const desvio of [-1, 0, 1]) {
        const competencia = somarMeses(f.mes, -o.meses_apos + desvio);
        if (geradas.has(competencia)) continue;
        if (!geraNaCompetencia(o.periodicidade, Number(competencia.slice(5, 7)))) continue;
        const data = prazoLegal(o, `${competencia}-01`, feriadosSet);
        if (data < inicio || data > fim) continue;
        const chave = `${data}|${o.id}|${competencia}`;
        if (mapa.has(chave)) continue;
        mapa.set(chave, {
          data,
          obrigacao: o.nome,
          departamento: depDe(o.departamento_id),
          competencia,
          total: 0,
          feitas: 0,
          abertas: 0,
          prevista: true,
        });
      }
    }
  }

  const vencimentos = [...mapa.values()].sort(
    (a, b) => a.data.localeCompare(b.data) || b.total - a.total || a.obrigacao.localeCompare(b.obrigacao),
  );
  const doMes = (feriados ?? []).filter((x) => x.data >= inicio && x.data <= fim) as Feriado[];
  return { vencimentos, feriados: doMes, departamentos, departamento };
}

// Competências com alguma tarefa gerada entre as que podem vencer no mês
// (até 13 meses antes, o maior meses_apos do catálogo mais o ajuste).
async function competenciasGeradas(supabase: Awaited<ReturnType<typeof createClient>>, mes: string) {
  const candidatas = Array.from({ length: 15 }, (_, i) => somarMeses(mes, 1 - i));
  const resultados = await Promise.all(
    candidatas.map(async (c) => {
      const { count } = await supabase
        .from("tarefas")
        .select("id", { count: "exact", head: true })
        .eq("competencia", `${c}-01`)
        .limit(1);
      return count ? c : null;
    }),
  );
  return new Set(resultados.filter(Boolean) as string[]);
}
