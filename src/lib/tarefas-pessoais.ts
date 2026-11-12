import "server-only";
import { createClient } from "@/lib/supabase/server";

// Tarefas pessoais: só o dono vê (RLS "dono" em tarefas_pessoais).

export type Recorrencia = "nenhuma" | "mensal" | "anual";

export type TarefaPessoal = {
  id: string;
  titulo: string;
  descricao: string | null;
  prazo: string;
  recorrencia: Recorrencia;
  concluida_em: string | null;
  cliente: { id: string; razao_social: string; fantasia: string | null; codigo_dominio: number | null } | null;
};

const CAMPOS =
  "id, titulo, descricao, prazo, recorrencia, concluida_em, cliente:clientes(id, razao_social, fantasia, codigo_dominio)";

// Abertas por prazo e as últimas concluídas. null: migration ainda não aplicada.
export async function listarTarefasPessoais(): Promise<{
  abertas: TarefaPessoal[];
  concluidas: TarefaPessoal[];
} | null> {
  const supabase = await createClient();
  const [abertas, concluidas] = await Promise.all([
    supabase
      .from("tarefas_pessoais")
      .select(CAMPOS)
      .is("concluida_em", null)
      .order("prazo")
      .order("criado_em")
      .limit(200),
    supabase
      .from("tarefas_pessoais")
      .select(CAMPOS)
      .not("concluida_em", "is", null)
      .order("concluida_em", { ascending: false })
      .limit(15),
  ]);
  const erro = abertas.error ?? concluidas.error;
  if (erro?.code === "PGRST205" || erro?.code === "42P01") return null;
  if (erro) throw new Error(`Falha ao ler suas tarefas pessoais: ${erro.message}`);
  return {
    abertas: (abertas.data ?? []) as unknown as TarefaPessoal[],
    concluidas: (concluidas.data ?? []) as unknown as TarefaPessoal[],
  };
}
