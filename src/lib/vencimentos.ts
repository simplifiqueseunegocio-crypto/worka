import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TipoVencimento } from "@/lib/vencimentos-regras";

// Monitor de vencimentos (migration 20261112000200_vencimentos.sql).

export class VencimentosIndisponivel extends Error {}

export type Vencimento = {
  id: string;
  tipo: TipoVencimento;
  descricao: string;
  identificador: string | null;
  vence_em: string;
  avisar_dias: number;
  observacao: string | null;
  ativo: boolean;
  ultimo_aviso_em: string | null;
  cliente: { id: string; razao_social: string; codigo_dominio: number | null } | null;
};

export async function listarVencimentos(arquivados = false): Promise<Vencimento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vencimentos")
    .select("id, tipo, descricao, identificador, vence_em, avisar_dias, observacao, ativo, ultimo_aviso_em, cliente:clientes(id, razao_social, codigo_dominio)")
    .eq("ativo", !arquivados)
    .order("vence_em")
    .limit(2000)
    .overrideTypes<Vencimento[], { merge: false }>();
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") throw new VencimentosIndisponivel();
    throw new Error(`Falha ao ler os vencimentos: ${error.message}`);
  }
  return data ?? [];
}
