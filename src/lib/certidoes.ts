import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TipoCnd } from "@/lib/cnd";

// Certidões lançadas pela equipe e o catálogo de tipos (migration certidoes).
// A situação das consultas automáticas continua em lib/cnd.ts.

export const LIMITE_PDF_CERTIDAO = 4 * 1024 * 1024; // corpo da Vercel: 4,5 MB

export type SituacaoCertidao = "negativa" | "positiva_efeito_negativa" | "positiva";

export type TipoCertidao = {
  id: number;
  nome: string;
  orgao: string | null;
  validade_dias: number | null;
  padrao: boolean;
  cnd_tipo: TipoCnd | null;
  ativo: boolean;
};

export type TipoDoCliente = TipoCertidao & { acompanha: boolean; escolhido: boolean | null };

export type Certidao = {
  id: string;
  tipo_id: number;
  situacao: SituacaoCertidao;
  emitida_em: string;
  valida_ate: string | null;
  arquivo_nome: string | null;
  tem_arquivo: boolean;
  observacao: string | null;
  criado_em: string;
  criado_por: { id: string; nome: string } | null;
};

const indisponivel = (code?: string) => code === "PGRST205" || code === "42P01";
const CAMPOS_TIPO = "id, nome, orgao, validade_dias, padrao, cnd_tipo, ativo";

// Catálogo completo (Configurações → Certidões). null: migration não aplicada.
export async function listarTiposCertidao(): Promise<(TipoCertidao & { lancadas: number })[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("certidao_tipos").select(CAMPOS_TIPO).order("id");
  if (error && indisponivel(error.code)) return null;
  if (error) throw new Error(`Falha ao ler os tipos de certidão: ${error.message}`);
  const lancadas = await Promise.all(
    (data ?? []).map(async (t) => {
      const { count } = await supabase
        .from("certidoes")
        .select("id", { count: "exact", head: true })
        .eq("tipo_id", t.id);
      return count ?? 0;
    }),
  );
  return (data ?? []).map((t, i) => ({ ...(t as TipoCertidao), lancadas: lancadas[i] }));
}

// Tipos ativos com a escolha do cliente e as certidões lançadas (mais recentes primeiro).
export async function certidoesDoCliente(clienteId: string) {
  const supabase = await createClient();
  const [tipos, escolhas, certidoes] = await Promise.all([
    supabase.from("certidao_tipos").select(CAMPOS_TIPO).order("id"),
    supabase.from("cliente_certidao_tipos").select("tipo_id, acompanha").eq("cliente_id", clienteId),
    supabase
      .from("certidoes")
      .select(
        "id, tipo_id, situacao, emitida_em, valida_ate, arquivo_nome, arquivo_path, observacao, criado_em, criado_por:profiles!criado_por(id, nome)",
      )
      .eq("cliente_id", clienteId)
      .order("emitida_em", { ascending: false })
      .order("criado_em", { ascending: false })
      .limit(300),
  ]);
  const erro = tipos.error ?? escolhas.error ?? certidoes.error;
  if (erro && indisponivel(erro.code)) return null;
  if (erro) throw new Error(`Falha ao ler as certidões do cliente: ${erro.message}`);

  const escolha = new Map((escolhas.data ?? []).map((e) => [e.tipo_id as number, e.acompanha as boolean]));
  const lancadas = (certidoes.data ?? []).map(({ arquivo_path, ...c }) => ({
    ...c,
    tem_arquivo: Boolean(arquivo_path),
  })) as unknown as Certidao[];

  // Tipo desativado no catálogo só aparece se o cliente já tem certidão dele.
  const doCliente: TipoDoCliente[] = ((tipos.data ?? []) as TipoCertidao[])
    .filter((t) => t.ativo || lancadas.some((c) => c.tipo_id === t.id))
    .map((t) => {
      const escolhido = escolha.get(t.id) ?? null;
      return { ...t, escolhido, acompanha: escolhido ?? (t.padrao && t.ativo) };
    });
  return { tipos: doCliente, certidoes: lancadas };
}
