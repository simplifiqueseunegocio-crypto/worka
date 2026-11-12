import "server-only";
import { cache } from "react";
import type { Usuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DiaPonto, JornadaDia, TotalOrigem } from "@/lib/ponto-regras";

// Leitura de ficha ponto (migration 20261112000000_ponto.sql).

export class PontoIndisponivel extends Error {}

export type StatusLeitura = "enviando" | "lendo" | "conferir" | "confirmada" | "erro";

export type LeituraResumo = {
  id: string;
  status: StatusLeitura;
  competencia: string | null;
  empresa_lida: string | null;
  enviada_em: string;
  paginas_total: number;
  paginas_lidas: number;
  mensagem: string | null;
  arquivos: { nome: string }[];
  cliente: { id: string; razao_social: string; codigo_dominio: number | null } | null;
  enviada_por: { nome: string } | null;
  fichas: { count: number }[];
};

export type FichaPonto = {
  id: string;
  ordem: number;
  nome: string;
  cpf: string | null;
  cargo: string | null;
  admissao: string | null;
  jornada: JornadaDia[];
  dias: DiaPonto[];
  totais_origem: TotalOrigem[];
  observacoes: string | null;
  conferida: boolean;
  funcionario_id: string | null;
  // Cliente da ficha (fichas de empresas diferentes na mesma leitura); null = o da leitura.
  cliente: { id: string; razao_social: string; codigo_dominio: number | null } | null;
};

export type LeituraCompleta = Omit<LeituraResumo, "fichas"> & {
  documento_lido: string | null;
  arquivos: { nome: string; tipo: string; bytes: number }[];
  confirmada_em: string | null;
  confirmada_por: { nome: string } | null;
  fichas: FichaPonto[];
};

const indisponivel = (code?: string) => code === "PGRST205" || code === "42P01";

// Mesma regra da RLS (pode_ponto): Departamento Pessoal, gestor ou admin.
export const podeUsarPonto = cache(async (usuario: Usuario) => {
  if (!usuario.ativo) return false;
  if (usuario.papel === "admin" || usuario.papel === "gestor") return true;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_departamentos")
    .select("departamento_id, departamentos!inner(nome)")
    .eq("profile_id", usuario.id)
    .eq("departamentos.nome", "Pessoal")
    .limit(1);
  return Boolean(data?.length);
});

export async function listarLeituras(limite = 30): Promise<LeituraResumo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ponto_leituras")
    .select(
      "id, status, competencia, empresa_lida, enviada_em, paginas_total, paginas_lidas, mensagem, arquivos, cliente:clientes(id, razao_social, codigo_dominio), enviada_por:profiles!enviada_por(nome), fichas:ponto_fichas(count)",
    )
    .neq("status", "enviando")
    .order("enviada_em", { ascending: false })
    .limit(limite)
    .overrideTypes<LeituraResumo[], { merge: false }>();
  if (error) {
    if (indisponivel(error.code)) throw new PontoIndisponivel();
    throw new Error(`Falha ao listar as leituras: ${error.message}`);
  }
  return data ?? [];
}

export async function leituraPonto(id: string): Promise<LeituraCompleta | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ponto_leituras")
    .select(
      "id, status, competencia, empresa_lida, documento_lido, enviada_em, paginas_total, paginas_lidas, mensagem, arquivos, confirmada_em, cliente:clientes(id, razao_social, codigo_dominio), enviada_por:profiles!enviada_por(nome), confirmada_por:profiles!confirmada_por(nome), fichas:ponto_fichas(id, ordem, nome, cpf, cargo, admissao, jornada, dias, totais_origem, observacoes, conferida, funcionario_id, cliente:clientes(id, razao_social, codigo_dominio))",
    )
    .eq("id", id)
    .order("ordem", { referencedTable: "ponto_fichas" })
    .maybeSingle()
    .overrideTypes<LeituraCompleta, { merge: false }>();
  if (error) {
    if (indisponivel(error.code)) throw new PontoIndisponivel();
    throw new Error(`Falha ao abrir a leitura: ${error.message}`);
  }
  return data;
}
