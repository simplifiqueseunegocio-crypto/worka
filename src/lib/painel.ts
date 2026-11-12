import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hojeISO, somarDias, type StatusTarefaBanco } from "@/lib/tarefas";

// Consultas do painel (Início) que não existem na página Tarefas.
// Os números da competência vêm de resumoTarefas (src/lib/tarefas.ts).

const ABERTAS = "(pendente,em_andamento,aguardando_cliente)";
const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export type DiaSemana = { iso: string; dia: string; vencimentos: number; feriado: string | null; hoje: boolean };

export type ProximoVencimento = {
  id: string;
  prazo_legal: string;
  status: StatusTarefaBanco;
  cliente: { id: string; razao_social: string; fantasia: string | null };
  obrigacao: { nome: string } | null;
  departamento: { nome: string } | null;
  responsavel: { nome: string } | null;
};

export type CargaPessoa = { id: string; nome: string; departamento: string | null; abertas: number; atrasadas: number };

// Tarefas abertas da competência ("AAAA-MM") que vencem hoje.
export async function vencemHoje(competencia: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("tarefas")
    .select("id", { count: "exact", head: true })
    .eq("competencia", `${competencia}-01`)
    .filter("status", "in", ABERTAS)
    .eq("prazo_legal", hojeISO());
  return count ?? 0;
}

// Semana corrente (segunda a domingo): tarefas com prazo legal em cada dia e feriados.
export async function semanaAtual(): Promise<DiaSemana[]> {
  const supabase = await createClient();
  const hoje = hojeISO();
  const diaDaSemana = (new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7; // segunda = 0
  const segunda = somarDias(hoje, -diaDaSemana);
  const dias = SEMANA.map((dia, i) => ({ dia, iso: somarDias(segunda, i) }));

  const [contagens, { data: feriados }] = await Promise.all([
    Promise.all(
      dias.map(async (d) => {
        const { count } = await supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .eq("prazo_legal", d.iso);
        return count ?? 0;
      }),
    ),
    supabase
      .from("feriados")
      .select("data, descricao")
      .is("uf", null)
      .gte("data", dias[0].iso)
      .lte("data", dias[6].iso),
  ]);

  return dias.map((d, i) => ({
    ...d,
    vencimentos: contagens[i],
    feriado: (feriados ?? []).find((f) => f.data === d.iso)?.descricao ?? null,
    hoje: d.iso === hoje,
  }));
}

// Tarefas abertas por prazo legal, as atrasadas primeiro (todas as competências).
export async function proximosVencimentos(limite = 6): Promise<ProximoVencimento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarefas")
    .select(
      "id, prazo_legal, status, cliente:clientes!inner(id, razao_social, fantasia), obrigacao:obrigacoes(nome), departamento:departamentos(nome), responsavel:profiles!responsavel_id(nome)",
    )
    .filter("status", "in", ABERTAS)
    .order("prazo_legal")
    .order("id")
    .limit(limite);
  if (error) throw new Error(`Falha ao ler os próximos vencimentos: ${error.message}`);
  return (data ?? []) as unknown as ProximoVencimento[];
}

// Tarefas abertas (e quantas atrasadas) de cada pessoa ativa, da maior carga à menor.
export async function cargaEquipe(limite = 6): Promise<CargaPessoa[]> {
  const supabase = await createClient();
  const hoje = hojeISO();
  const { data: pessoas, error } = await supabase
    .from("profiles")
    .select("id, nome, profile_departamentos(departamentos(nome))")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error(`Falha ao ler a equipe: ${error.message}`);

  const contar = async (id: string, atrasadas: boolean) => {
    let q = supabase
      .from("tarefas")
      .select("id", { count: "exact", head: true })
      .eq("responsavel_id", id)
      .filter("status", "in", ABERTAS);
    if (atrasadas) q = q.lt("prazo_legal", hoje);
    const { count } = await q;
    return count ?? 0;
  };

  type Pessoa = { id: string; nome: string; profile_departamentos: { departamentos: { nome: string } | null }[] };
  const carga = await Promise.all(
    ((pessoas ?? []) as unknown as Pessoa[]).map(async (p) => {
      const [abertas, atrasadas] = await Promise.all([contar(p.id, false), contar(p.id, true)]);
      const deps = p.profile_departamentos.map((d) => d.departamentos?.nome).filter(Boolean);
      return { id: p.id, nome: p.nome, departamento: deps.join(", ") || null, abertas, atrasadas };
    }),
  );
  return carga
    .filter((p) => p.abertas > 0)
    .sort((a, b) => b.abertas - a.abertas || a.nome.localeCompare(b.nome))
    .slice(0, limite);
}
