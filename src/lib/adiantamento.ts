import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Usuario } from "@/lib/auth";

// Folha de adiantamento: o PDF vem do Domínio Folha e sai por e-mail para os
// contatos do cliente marcados como "recebe adiantamento" (ou, sem nenhum,
// para o e-mail do cadastro). Cada envio fica em adiantamento_envios.

// A Vercel recusa corpos acima de 4,5 MB; o bodySizeLimit do next.config acompanha.
export const LIMITE_PDF = 4 * 1024 * 1024;

// Migration do adiantamento ainda não aplicada (tabela ou coluna ausente).
export class AdiantamentoIndisponivel extends Error {}
export function migracaoAusente(error: { code?: string }) {
  return error.code === "PGRST205" || error.code === "42P01" || error.code === "42703" || error.code === "PGRST204";
}

export type EnvioAdiantamento = {
  id: string;
  arquivo_nome: string;
  arquivo_bytes: number;
  destinatarios: string[];
  email_id: string | null;
  erro: string | null;
  enviado_em: string;
  cliente: { id: string; razao_social: string; fantasia: string | null; codigo_dominio: number | null };
  enviado_por: { nome: string } | null;
};

// Envia quem é admin ou está ligado ao Departamento Pessoal (mesma regra da RLS).
export async function podeEnviarAdiantamento(usuario: Usuario) {
  if (usuario.papel === "admin") return true;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_departamentos")
    .select("departamento_id, departamentos!inner(nome)")
    .eq("profile_id", usuario.id)
    .eq("departamentos.nome", "Pessoal")
    .limit(1);
  return Boolean(data?.length);
}

// Envios da competência ("AAAA-MM"), do mais recente ao mais antigo.
export async function listarEnviosAdiantamento(competencia: string): Promise<EnvioAdiantamento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("adiantamento_envios")
    .select(
      "id, arquivo_nome, arquivo_bytes, destinatarios, email_id, erro, enviado_em, cliente:clientes!inner(id, razao_social, fantasia, codigo_dominio), enviado_por:profiles!enviado_por(nome)",
    )
    .eq("competencia", `${competencia}-01`)
    .order("enviado_em", { ascending: false })
    .limit(500);
  if (error && migracaoAusente(error)) throw new AdiantamentoIndisponivel();
  if (error) throw new Error(`Falha ao listar os envios: ${error.message}`);
  return (data ?? []) as unknown as EnvioAdiantamento[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Destinatarios = { emails: string[]; origem: "contatos" | "cadastro" | null };

// Para quem vai a folha do cliente: contatos marcados; sem nenhum, o e-mail do
// cadastro (o do Domínio pode ter vários, separados por ; ou ,).
export async function destinatariosAdiantamento(clienteIds: string[]) {
  const mapa = new Map<string, Destinatarios>();
  if (!clienteIds.length) return mapa;
  const supabase = await createClient();
  const [{ data: contatos }, { data: clientes }] = await Promise.all([
    supabase
      .from("cliente_contatos")
      .select("cliente_id, email")
      .in("cliente_id", clienteIds)
      .eq("recebe_adiantamento", true)
      .not("email", "is", null),
    supabase.from("clientes").select("id, email").in("id", clienteIds),
  ]);
  for (const id of clienteIds) {
    const marcados = (contatos ?? []).filter((c) => c.cliente_id === id).map((c) => String(c.email).trim());
    const deContatos = [...new Set(marcados.filter((e) => EMAIL.test(e)))];
    if (deContatos.length) {
      mapa.set(id, { emails: deContatos, origem: "contatos" });
      continue;
    }
    const cadastro = String((clientes ?? []).find((c) => c.id === id)?.email ?? "");
    const doCadastro = [...new Set(cadastro.split(/[;,\s]+/).filter((e) => EMAIL.test(e)))];
    mapa.set(id, { emails: doCadastro, origem: doCadastro.length ? "cadastro" : null });
  }
  return mapa;
}
