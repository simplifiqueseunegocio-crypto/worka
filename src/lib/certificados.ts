import "server-only";
import { createClient } from "@/lib/supabase/server";

// Certificado digital A1 (.pfx) guardado na plataforma. A senha não é guardada.

export const BUCKET_CERTIFICADOS = "certificados";
export const LIMITE_PFX = 100 * 1024;

export type Certificado = {
  id: string;
  nome: string;
  valido_ate: string;
  arquivo_nome: string;
  arquivo_bytes: number;
  observacao: string | null;
  enviado_em: string;
  enviado_por: { nome: string } | null;
};

export type Download = { id: number; baixado_em: string; pessoa: { nome: string } | null; certificado: { nome: string } | null };

// Do mais novo para o mais antigo; o primeiro é o atual.
export async function listarCertificados() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("certificados")
    .select("id, nome, valido_ate, arquivo_nome, arquivo_bytes, observacao, enviado_em, enviado_por:profiles!enviado_por(nome)")
    .order("enviado_em", { ascending: false })
    .overrideTypes<Certificado[], { merge: false }>();
  if (error) throw new Error(`Falha ao ler os certificados: ${error.message}`);
  return data ?? [];
}

// Admin vê todos; os demais, só os próprios (RLS).
export async function ultimosDownloads(limite = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("certificado_downloads")
    .select("id, baixado_em, pessoa:profiles!profile_id(nome), certificado:certificados(nome)")
    .order("baixado_em", { ascending: false })
    .limit(limite)
    .overrideTypes<Download[], { merge: false }>();
  if (error) throw new Error(`Falha ao ler os downloads: ${error.message}`);
  return data ?? [];
}
