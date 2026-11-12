"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Recorrencia } from "@/lib/tarefas-pessoais";

export type EstadoTarefaPessoal = { ok?: string; erro?: string };

export type DadosTarefaPessoal = {
  titulo: string;
  descricao: string;
  prazo: string; // "AAAA-MM-DD"
  recorrencia: Recorrencia;
  clienteId: string; // vazio = sem cliente
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const RECORRENCIAS: Recorrencia[] = ["nenhuma", "mensal", "anual"];

// Cria (sem id) ou altera uma tarefa pessoal. O dono é sempre quem está logado (RLS).
export async function salvarTarefaPessoal(d: DadosTarefaPessoal, id?: string): Promise<EstadoTarefaPessoal> {
  const titulo = d.titulo.trim().slice(0, 200);
  if (!titulo) return { erro: "Dê um título para a tarefa." };
  if (!DATA.test(d.prazo)) return { erro: "Informe o prazo." };
  if (!RECORRENCIAS.includes(d.recorrencia)) return { erro: "Repetição inválida." };
  if (d.clienteId && !UUID.test(d.clienteId)) return { erro: "Cliente inválido." };
  if (id && !UUID.test(id)) return { erro: "Tarefa inválida." };

  const registro = {
    titulo,
    descricao: d.descricao.trim().slice(0, 2000) || null,
    prazo: d.prazo,
    recorrencia: d.recorrencia,
    cliente_id: d.clienteId || null,
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("tarefas_pessoais").update(registro).eq("id", id).select("id")
    : await supabase.from("tarefas_pessoais").insert(registro).select("id");
  if (error) return { erro: "Não foi possível salvar agora. Tente de novo." };
  if (!data?.length) return { erro: "Tarefa não encontrada." };
  refresh();
  return { ok: id ? "Tarefa atualizada." : "Tarefa criada." };
}

// Concluir uma tarefa que se repete cria a próxima ocorrência (trigger no banco).
export async function concluirTarefaPessoal(id: string, concluida: boolean): Promise<EstadoTarefaPessoal> {
  if (!UUID.test(id)) return { erro: "Tarefa inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarefas_pessoais")
    .update({ concluida_em: concluida ? new Date().toISOString() : null })
    .eq("id", id)
    .select("recorrencia");
  if (error) return { erro: "Não foi possível alterar agora. Tente de novo." };
  if (!data?.length) return { erro: "Tarefa não encontrada." };
  refresh();
  if (!concluida) return { ok: "Tarefa reaberta." };
  const r = data[0].recorrencia as Recorrencia;
  return { ok: r === "nenhuma" ? "Tarefa concluída." : `Concluída. A próxima já está na lista (${r}).` };
}

export async function excluirTarefaPessoal(id: string): Promise<EstadoTarefaPessoal> {
  if (!UUID.test(id)) return { erro: "Tarefa inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tarefas_pessoais").delete().eq("id", id).select("id");
  if (error) return { erro: "Não foi possível excluir agora. Tente de novo." };
  if (!data?.length) return { erro: "Tarefa não encontrada." };
  refresh();
  return { ok: "Tarefa excluída." };
}
