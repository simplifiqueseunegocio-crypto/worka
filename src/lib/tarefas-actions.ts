"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { StatusTarefaBanco } from "@/lib/tarefas";

export type EstadoAcaoTarefa = { ok?: string; erro?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: StatusTarefaBanco[] = ["pendente", "em_andamento", "aguardando_cliente", "concluida", "dispensada"];

const confirmacoes: Record<StatusTarefaBanco, string> = {
  pendente: "Tarefa reaberta.",
  em_andamento: "Tarefa em andamento.",
  aguardando_cliente: "Marcada como aguardando o cliente.",
  concluida: "Tarefa concluída.",
  dispensada: "Tarefa dispensada.",
};

// Muda o status de uma tarefa. O responsável só pode alterar status e observação
// das tarefas dele (RLS + trigger tarefas_regras); o gestor, as do departamento.
// Dispensar exige justificativa, que fica na observação.
export async function alterarStatusTarefa(
  tarefaId: string,
  status: StatusTarefaBanco,
  justificativa?: string,
): Promise<EstadoAcaoTarefa> {
  if (!UUID.test(tarefaId)) return { erro: "Tarefa inválida." };
  if (!STATUS.includes(status)) return { erro: "Status inválido." };

  const alteracao: { status: StatusTarefaBanco; observacao?: string } = { status };
  if (status === "dispensada") {
    const texto = justificativa?.trim().slice(0, 500);
    if (!texto) return { erro: "Informe por que a tarefa foi dispensada." };
    alteracao.observacao = texto;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("tarefas").update(alteracao).eq("id", tarefaId).select("id");
  if (error) {
    if (error.code === "42501") return { erro: "Você não tem permissão para alterar esta tarefa." };
    return { erro: "Não foi possível alterar agora. Tente de novo." };
  }
  // Sem permissão a RLS não dá erro: só não altera nenhuma linha.
  if (!data?.length) return { erro: "Você não tem permissão para alterar esta tarefa." };
  refresh();
  return { ok: confirmacoes[status] };
}

// Troca o responsável de uma tarefa (admin ou gestor do departamento).
// responsavelId vazio deixa a tarefa sem responsável.
export async function atribuirResponsavel(tarefaId: string, responsavelId: string): Promise<EstadoAcaoTarefa> {
  if (!UUID.test(tarefaId)) return { erro: "Tarefa inválida." };
  if (responsavelId && !UUID.test(responsavelId)) return { erro: "Responsável inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarefas")
    .update({ responsavel_id: responsavelId || null })
    .eq("id", tarefaId)
    .select("id");
  if (error) {
    if (error.code === "42501") return { erro: "Apenas admin ou gestor do departamento troca o responsável." };
    if (error.code === "23503") return { erro: "Essa pessoa não está mais na equipe." };
    return { erro: "Não foi possível alterar agora. Tente de novo." };
  }
  if (!data?.length) return { erro: "Apenas admin ou gestor do departamento troca o responsável." };
  refresh();
  return { ok: responsavelId ? "Responsável alterado." : "Tarefa sem responsável." };
}

// Gera as tarefas de uma competência ("AAAA-MM"). Pode rodar de novo: não duplica.
export async function gerarTarefas(competencia: string): Promise<EstadoAcaoTarefa> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return { erro: "Escolha uma competência." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gerar_tarefas", { p_competencia: `${competencia}-01` });
  if (error) {
    if (error.code === "42501") return { erro: "Apenas admin ou gestor pode gerar tarefas." };
    return { erro: "Não foi possível gerar agora. Tente de novo." };
  }
  refresh();
  const qtd = Number(data ?? 0);
  const [a, m] = competencia.split("-");
  if (!qtd) return { ok: `Nenhuma tarefa nova para ${m}/${a}: a competência já está gerada.` };
  return { ok: `${qtd.toLocaleString("pt-BR")} tarefas geradas para ${m}/${a}.` };
}

// ---------------------------------------------------------------------------
// Nova tarefa (avulsa): uma obrigação do catálogo para um cliente numa competência.

export type ClienteNovaTarefa = {
  id: string;
  razao_social: string;
  fantasia: string | null;
  codigo_dominio: number | null;
  // Responsável do cliente em cada departamento, para sugerir na tarefa.
  responsaveis: { departamento_id: number; profile_id: string }[];
};

// Clientes ativos para o campo de busca do formulário (nome, fantasia, código ou CNPJ/CPF).
export async function buscarClientesTarefa(busca: string): Promise<ClienteNovaTarefa[]> {
  const termo = busca.replace(/[,()*%\\]/g, " ").trim().slice(0, 80);
  if (termo.length < 2) return [];
  const digitos = termo.replace(/\D/g, "");
  const condicoes = [`razao_social.ilike.*${termo}*`, `fantasia.ilike.*${termo}*`];
  if (digitos.length >= 3) condicoes.push(`documento.like.*${digitos}*`);
  if (/^\d{1,6}$/.test(termo)) condicoes.push(`codigo_dominio.eq.${termo}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("id, razao_social, fantasia, codigo_dominio, responsaveis:cliente_responsaveis(departamento_id, profile_id)")
    .eq("status", "ativo")
    .or(condicoes.join(","))
    .order("razao_social")
    .limit(8);
  if (error) return [];
  return (data ?? []) as ClienteNovaTarefa[];
}

export type DadosNovaTarefa = {
  clienteId: string;
  obrigacaoId: number;
  competencia: string; // "AAAA-MM"
  prazoLegal: string; // "AAAA-MM-DD"
  prazoMeta: string;
  responsavelId: string; // vazio = sem responsável
  observacao: string;
};

const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Cria a tarefa. Só admin ou gestor do departamento da obrigação (RLS "criacao").
// O departamento vem da obrigação, não do formulário.
export async function criarTarefa(d: DadosNovaTarefa): Promise<EstadoAcaoTarefa> {
  if (!UUID.test(d.clienteId)) return { erro: "Escolha o cliente." };
  if (!Number.isInteger(d.obrigacaoId) || d.obrigacaoId <= 0) return { erro: "Escolha a obrigação." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.competencia)) return { erro: "Escolha a competência." };
  if (!DATA.test(d.prazoLegal)) return { erro: "Informe o prazo legal." };
  const prazoMeta = d.prazoMeta || d.prazoLegal;
  if (!DATA.test(prazoMeta)) return { erro: "Prazo meta inválido." };
  if (prazoMeta > d.prazoLegal) return { erro: "A meta não pode ser depois do prazo legal." };
  if (d.responsavelId && !UUID.test(d.responsavelId)) return { erro: "Responsável inválido." };

  const supabase = await createClient();
  const { data: obrigacao } = await supabase
    .from("obrigacoes")
    .select("departamento_id")
    .eq("id", d.obrigacaoId)
    .maybeSingle();
  if (!obrigacao) return { erro: "Obrigação não encontrada." };

  const { error } = await supabase.from("tarefas").insert({
    cliente_id: d.clienteId,
    obrigacao_id: d.obrigacaoId,
    departamento_id: obrigacao.departamento_id,
    competencia: `${d.competencia}-01`,
    prazo_legal: d.prazoLegal,
    prazo_meta: prazoMeta,
    responsavel_id: d.responsavelId || null,
    observacao: d.observacao.trim().slice(0, 500) || null,
  });
  if (error) {
    if (error.code === "23505") return { erro: "Esse cliente já tem essa obrigação nessa competência." };
    if (error.code === "42501") return { erro: "Apenas admin ou gestor do departamento cria tarefas nele." };
    if (error.code === "23503") return { erro: "Cliente ou responsável não existe mais. Recarregue a página." };
    return { erro: "Não foi possível criar agora. Tente de novo." };
  }
  refresh();
  const [a, m] = d.competencia.split("-");
  return { ok: `Tarefa criada para ${m}/${a}.` };
}

// "Pegar para mim": assume tarefas abertas e sem responsável do seu
// departamento (função assumir_tarefas; vale para qualquer papel).
export async function assumirTarefas(ids: string[]): Promise<EstadoAcaoTarefa> {
  const validos = [...new Set(ids)].filter((id) => UUID.test(id));
  if (!validos.length) return { erro: "Selecione ao menos uma tarefa." };
  if (validos.length > 500) return { erro: "Selecione no máximo 500 tarefas por vez." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assumir_tarefas", { p_tarefas: validos });
  if (error?.code === "PGRST202") return { erro: "Aplique a migration de assumir tarefas no banco." };
  if (error) return { erro: "Não foi possível assumir agora. Tente de novo." };
  refresh();
  const qtd = Number(data ?? 0);
  const fora = validos.length - qtd;
  if (!qtd) return { erro: "Nenhuma assumida: já têm responsável, estão fechadas ou são de outro departamento." };
  const base = qtd === 1 ? "1 tarefa agora é sua." : `${qtd} tarefas agora são suas.`;
  return { ok: fora ? `${base} ${fora} não ${fora === 1 ? "pôde" : "puderam"} ser assumida${fora === 1 ? "" : "s"}.` : base };
}
