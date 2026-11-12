import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Tarefas abertas por departamento (todas as competências), para o menu.
// cache(): os cinco contadores do menu fazem uma leitura só por requisição.
const abertasPorDepartamento = cache(async () => {
  const supabase = await createClient();

  // Uma consulta só (migration 20261110000700_desempenho.sql).
  const { data, error } = await supabase.rpc("abertas_por_departamento");
  if (!error) {
    return new Map((data as { departamento: string; abertas: number }[]).map((l) => [l.departamento, Number(l.abertas)]));
  }

  // Sem a migration: uma contagem por departamento, como antes.
  const { data: departamentos } = await supabase.from("departamentos").select("id, nome");
  const contagens = await Promise.all(
    (departamentos ?? []).map(async (d) => {
      const { count } = await supabase
        .from("tarefas")
        .select("id", { count: "exact", head: true })
        .eq("departamento_id", d.id)
        .filter("status", "in", "(pendente,em_andamento,aguardando_cliente)");
      return [d.nome as string, count ?? 0] as const;
    }),
  );
  return new Map(contagens);
});

export async function ContadorDepartamento({ nome }: { nome: string }) {
  const n = (await abertasPorDepartamento()).get(nome);
  if (!n) return null;
  return <span className="text-xs text-texto-suave tabular-nums">{n.toLocaleString("pt-BR")}</span>;
}
