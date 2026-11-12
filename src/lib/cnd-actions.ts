"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoAcaoCnd = { ok?: string; erro?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mensagemErro(error: { code?: string; message: string }) {
  if (error.code === "42501") return "Você não tem permissão para esta ação.";
  if (error.code === "PGRST202" || error.code === "PGRST205") return "A migration de CND ainda não foi aplicada no banco.";
  return "Não foi possível concluir agora. Tente de novo.";
}

// Liga ou desliga a busca de CND do cliente (admin e gestor, pela RLS de clientes).
export async function alterarBuscaCnd(clienteId: string, ativo: boolean): Promise<EstadoAcaoCnd> {
  if (!UUID.test(clienteId)) return { erro: "Cliente inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .update({ busca_cnd: ativo })
    .eq("id", clienteId)
    .select("id");
  if (error) return { erro: mensagemErro(error) };
  // Sem permissão a RLS não dá erro: só não altera nenhuma linha.
  if (!data?.length) return { erro: "Apenas admin ou gestor pode alterar a busca de CND." };
  refresh();
  return { ok: ativo ? "Busca de CND ligada." : "Busca de CND desligada." };
}

// Coloca na fila (origem manual) as certidões automáticas de um cliente ativo,
// mesmo sem a busca mensal ligada, ou, sem clienteId, da carteira monitorada.
export async function consultarCnd(clienteId?: string): Promise<EstadoAcaoCnd> {
  if (clienteId && !UUID.test(clienteId)) return { erro: "Cliente inválido." };
  const supabase = await createClient();
  const { data, error } = clienteId
    ? await supabase.rpc("enfileirar_cnd_selecionados", { p_clientes: [clienteId] })
    : await supabase.rpc("enfileirar_cnd", { p_cliente_id: null });
  if (error) return { erro: mensagemErro(error) };
  refresh();
  const qtd = Number(data ?? 0);
  if (!qtd) return { ok: clienteId ? "As certidões deste cliente já estão na fila." : "A carteira já está na fila." };
  return { ok: `${qtd.toLocaleString("pt-BR")} consultas na fila. ${AVISO_SOB_DEMANDA}` };
}

const AVISO_SOB_DEMANDA =
  "Estadual e municipal são consultadas em até 10 minutos; federal e FGTS, nos dias úteis às 9h, 13h e 16h.";

// Coloca na fila (origem manual) as certidões automáticas dos clientes selecionados
// na tela Clientes, mesmo sem a busca mensal ligada. Só clientes ativos entram.
export async function consultarSelecionados(clienteIds: string[]): Promise<EstadoAcaoCnd> {
  const ids = [...new Set(clienteIds)].filter((id) => UUID.test(id));
  if (!ids.length) return { erro: "Selecione ao menos um cliente." };
  if (ids.length > 500) return { erro: "Selecione no máximo 500 clientes por vez." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enfileirar_cnd_selecionados", { p_clientes: ids });
  if (error) return { erro: mensagemErro(error) };
  refresh();
  const qtd = Number(data ?? 0);
  if (!qtd) return { ok: "As certidões desses clientes já estão na fila (ou eles não estão ativos)." };
  return { ok: `${qtd.toLocaleString("pt-BR")} consultas na fila (${ids.length} clientes). ${AVISO_SOB_DEMANDA}` };
}

// Liga a busca para todos os clientes ativos (primeira configuração do módulo).
export async function ligarBuscaCarteira(): Promise<EstadoAcaoCnd> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .update({ busca_cnd: true })
    .eq("status", "ativo")
    .eq("busca_cnd", false)
    .select("id");
  if (error) return { erro: mensagemErro(error) };
  if (!data?.length) return { erro: "Nenhum cliente alterado. Apenas admin ou gestor pode ligar a busca." };
  refresh();
  return { ok: `Busca ligada para ${data.length.toLocaleString("pt-BR")} clientes.` };
}
