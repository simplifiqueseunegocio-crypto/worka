import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Ajuste, Periodicidade, RegimeObrigacao } from "@/lib/prazos";

export type Obrigacao = {
  id: number;
  nome: string;
  departamento_id: number;
  periodicidade: Periodicidade;
  dia_vencimento: number;
  meses_apos: number;
  ajuste: Ajuste;
  meta_dias_antes: number;
  regimes: RegimeObrigacao[];
  ativo: boolean;
  clientes: number; // clientes ativos com o vínculo ativo
};

export async function listarObrigacoes(): Promise<Obrigacao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("obrigacoes")
    .select("id, nome, departamento_id, periodicidade, dia_vencimento, meses_apos, ajuste, meta_dias_antes, regimes, ativo")
    // Sem regimes = obrigação de sistema (ex.: consignado do DET): as tarefas
    // nascem de uma automação e ela não é editada no catálogo.
    .neq("regimes", "{}")
    .order("departamento_id")
    .order("nome");
  if (error) throw new Error(`Falha ao listar obrigações: ${error.message}`);

  const contagens = await Promise.all(
    (data ?? []).map(async (o) => {
      const { count } = await supabase
        .from("cliente_obrigacoes")
        .select("cliente_id, clientes!inner(status)", { count: "exact", head: true })
        .eq("obrigacao_id", o.id)
        .eq("ativo", true)
        .eq("clientes.status", "ativo");
      return count ?? 0;
    }),
  );
  return (data ?? []).map((o, i) => ({ ...(o as Omit<Obrigacao, "clientes">), clientes: contagens[i] }));
}

// Feriados nacionais (os que o banco usa para o dia útil).
export async function feriadosNacionais() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("feriados").select("data").is("uf", null).order("data");
  if (error) throw new Error(`Falha ao ler os feriados: ${error.message}`);
  return (data ?? []).map((f) => f.data as string);
}

// Clientes ativos sem regime: não recebem nenhuma obrigação até o regime ser definido.
export async function clientesSemRegime() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("clientes")
    .select("id", { count: "exact", head: true })
    .eq("status", "ativo")
    .is("regime", null);
  return count ?? 0;
}
