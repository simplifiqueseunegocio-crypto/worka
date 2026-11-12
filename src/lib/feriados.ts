import "server-only";
import { createClient } from "@/lib/supabase/server";

// Feriados usados nos prazos e no calendário. Os nacionais (uf nulo) entram no
// cálculo de dia útil do banco (is_dia_util); estaduais e municipais ficam
// registrados para consulta.

export type Feriado = { data: string; descricao: string; uf: string | null; municipio: string | null };

export async function listarFeriados(ano: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feriados")
    .select("data, descricao, uf, municipio")
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`)
    .order("data")
    .order("uf", { nullsFirst: true })
    .order("municipio", { nullsFirst: true });
  if (error) throw new Error(`Falha ao ler os feriados: ${error.message}`);
  return (data ?? []) as Feriado[];
}
