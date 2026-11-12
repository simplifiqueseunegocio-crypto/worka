import "server-only";
import type { Usuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import { tipoDocumento, type Dados } from "@/lib/documentos/tipos";

// Leituras de documentos (migration 20261112000100_documentos.sql).

export class DocumentosIndisponivel extends Error {}
export const BUCKET_DOCUMENTOS = "documentos";

export type StatusDocumento = "enviando" | "lendo" | "conferir" | "confirmada" | "erro";
export type ArquivoDocumento = { path: string; nome: string; tipo: string; bytes: number };

export type ItemDocumento = {
  id: string;
  ordem: number;
  dados: Dados;
  origem: { arquivo: number; pagina: number } | null;
  funcionario_id: string | null;
  conferido: boolean;
};

export type LeituraDocumento = {
  id: string;
  tipo: string;
  status: StatusDocumento;
  mensagem: string | null;
  enviada_em: string;
  paginas_total: number;
  paginas_lidas: number;
  confirmada_em: string | null;
  arquivos: ArquivoDocumento[];
  cliente: { id: string; razao_social: string; codigo_dominio: number | null; documento: string | null } | null;
  enviada_por: { nome: string } | null;
  confirmada_por: { nome: string } | null;
  itens: ItemDocumento[];
};

const indisponivel = (code?: string) => code === "PGRST205" || code === "42P01";

// Departamentos da pessoa (uma consulta por requisição).
const departamentosDe = cache(async (usuarioId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("profile_departamentos").select("departamentos!inner(nome)").eq("profile_id", usuarioId);
  return new Set((data ?? []).map((d) => (d.departamentos as unknown as { nome: string }).nome));
});

// Mesma regra da RLS (pode_documento): gestores e admins, ou quem está num
// dos departamentos do tipo.
export async function podeUsarDocumento(usuario: Usuario, tipo: string) {
  if (!usuario.ativo) return false;
  if (usuario.papel === "admin" || usuario.papel === "gestor") return true;
  const t = tipoDocumento(tipo);
  if (!t) return false;
  const meus = await departamentosDe(usuario.id);
  return t.departamentos.some((d) => meus.has(d));
}

export async function listarLeiturasDocumento(tipo: string, limite = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documentos_leituras")
    .select(
      "id, tipo, status, mensagem, enviada_em, paginas_total, paginas_lidas, arquivos, cliente:clientes(id, razao_social, codigo_dominio, documento), enviada_por:profiles!enviada_por(nome), itens:documentos_itens(count)",
    )
    .eq("tipo", tipo)
    .neq("status", "enviando")
    .order("enviada_em", { ascending: false })
    .limit(limite)
    .overrideTypes<(Omit<LeituraDocumento, "itens" | "confirmada_em" | "confirmada_por"> & { itens: { count: number }[] })[], { merge: false }>();
  if (error) {
    if (indisponivel(error.code)) throw new DocumentosIndisponivel();
    throw new Error(`Falha ao listar as leituras: ${error.message}`);
  }
  return data ?? [];
}

export async function leituraDocumento(id: string): Promise<LeituraDocumento | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documentos_leituras")
    .select(
      "id, tipo, status, mensagem, enviada_em, paginas_total, paginas_lidas, confirmada_em, arquivos, cliente:clientes(id, razao_social, codigo_dominio, documento), enviada_por:profiles!enviada_por(nome), confirmada_por:profiles!confirmada_por(nome), itens:documentos_itens(id, ordem, dados, origem, funcionario_id, conferido)",
    )
    .eq("id", id)
    .order("ordem", { referencedTable: "documentos_itens" })
    .maybeSingle()
    .overrideTypes<LeituraDocumento, { merge: false }>();
  if (error) {
    if (indisponivel(error.code)) throw new DocumentosIndisponivel();
    throw new Error(`Falha ao abrir a leitura: ${error.message}`);
  }
  return data;
}
