"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { StatusCliente } from "@/lib/clientes";

export type EstadoCliente = { ok?: string; erro?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: StatusCliente[] = ["ativo", "suspenso", "encerrado"];
const confirmacoes: Record<StatusCliente, string> = {
  ativo: "Cliente reativado. A sincronização do Domínio volta a atualizar o status.",
  suspenso: "Cliente suspenso. A sincronização do Domínio não o reativa.",
  encerrado: "Cliente encerrado. A sincronização do Domínio não o reativa.",
};

// Suspender, encerrar ou reativar (admin e gestor; RLS "edicao" em clientes).
// Fora de "ativo", status_manual impede a sincronização de reativar o cliente
// (trigger clientes_status_manual); status_alterado_em marca a mudança pela tela.
export async function alterarStatusCliente(id: string, status: StatusCliente): Promise<EstadoCliente> {
  if (!UUID.test(id)) return { erro: "Cliente inválido." };
  if (!STATUS.includes(status)) return { erro: "Situação inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .update({ status, status_manual: status !== "ativo", status_alterado_em: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error?.code === "42703") return { erro: "Aplique a migration de status dos clientes no banco." };
  if (error) return { erro: "Não foi possível alterar agora. Tente de novo." };
  if (!data?.length) return { erro: "Apenas admin ou gestor altera a situação do cliente." };
  refresh();
  return { ok: confirmacoes[status] };
}

// Exclui o cliente e tudo dele (só admin; o banco recusa cliente ativo ou que
// ainda vem do Domínio). Os PDFs das certidões saem do Storage em seguida.
export async function excluirCliente(id: string): Promise<EstadoCliente> {
  if (!UUID.test(id)) return { erro: "Cliente inválido." };
  const supabase = await createClient();

  const { data: pdfs } = await supabase.from("certidoes").select("arquivo_path").eq("cliente_id", id);
  const { data, error } = await supabase.from("clientes").delete().eq("id", id).select("id");
  if (error?.code === "23514") return { erro: error.message };
  if (error) return { erro: "Não foi possível excluir agora. Tente de novo." };
  if (!data?.length) return { erro: "Apenas o admin exclui clientes." };

  const caminhos = (pdfs ?? []).map((p) => p.arquivo_path as string | null).filter((p): p is string => Boolean(p));
  if (caminhos.length) await supabase.storage.from("certidoes").remove(caminhos);
  redirect("/clientes");
}
