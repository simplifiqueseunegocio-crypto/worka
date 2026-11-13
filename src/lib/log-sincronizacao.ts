import "server-only";
import { createClient } from "@/lib/supabase/server";

export type StatusExecucao = "sucesso" | "recusado" | "erro";

// Domínio (histórico) grava códigos numéricos; a Conta Azul grava "Nome · CNPJ".
export type ItemLog = number | string;

export type DetalhesExecucao = {
  inseridos?: ItemLog[];
  reativados?: ItemLog[];
  suspensos?: ItemLog[];
  vinculados?: string[];
  ignorados?: string[];
  inativos?: number;
  regimes?: { codigo: number; de: string | null; para: string | null }[];
  erros?: string[];
};

export type ExecucaoLog = {
  id: number;
  iniciado_em: string;
  duracao_ms: number | null;
  status: StatusExecucao;
  origem: string | null;
  recebidas: number | null;
  inseridas: number | null;
  atualizadas: number | null;
  reativadas: number | null;
  suspensas: number | null;
  regimes_alterados: number | null;
  forcar: boolean;
  mensagem: string | null;
  detalhes: DetalhesExecucao | null;
};

export const POR_PAGINA_LOG = 30;

// A tabela do log ainda não existe no banco (migration não aplicada).
export class LogIndisponivel extends Error {
  constructor() {
    super("Tabela integracao_execucoes não encontrada: aplique a migration 20261016000000_log_sincronizacao.sql.");
  }
}

function falha(error: { code?: string; message: string }): never {
  if (error.code === "PGRST205" || error.code === "42P01") throw new LogIndisponivel();
  throw new Error(`Falha ao ler o log: ${error.message}`);
}

export const FUSO = "America/Sao_Paulo";

// AAAA-MM-DD no horário de Brasília.
export function diaBrasilia(data: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(data);
}

export async function listarExecucoes(pagina: number, status?: StatusExecucao) {
  const supabase = await createClient();
  const inicio = (pagina - 1) * POR_PAGINA_LOG;
  let consulta = supabase
    .from("integracao_execucoes")
    .select("*", { count: "exact" })
    .order("iniciado_em", { ascending: false });
  if (status) consulta = consulta.eq("status", status);

  const { data, count, error } = await consulta.range(inicio, inicio + POR_PAGINA_LOG - 1);
  if (error) falha(error);
  return { execucoes: (data ?? []) as ExecucaoLog[], total: count ?? 0 };
}

export type DiaLog = { dia: string; status: StatusExecucao | null; execucoes: number };

// Situação de cada um dos últimos N dias: o pior resultado do dia, ou null se
// não houve nenhuma execução (rotina não rodou).
export async function resumoDias(dias = 14): Promise<DiaLog[]> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - dias * 86_400_000);
  const { data, error } = await supabase
    .from("integracao_execucoes")
    .select("iniciado_em, status")
    .gte("iniciado_em", desde.toISOString());
  if (error) falha(error);

  const peso: Record<StatusExecucao, number> = { sucesso: 0, recusado: 1, erro: 2 };
  const porDia = new Map<string, { status: StatusExecucao; execucoes: number }>();
  for (const e of (data ?? []) as Pick<ExecucaoLog, "iniciado_em" | "status">[]) {
    const dia = diaBrasilia(new Date(e.iniciado_em));
    const atual = porDia.get(dia);
    if (!atual) porDia.set(dia, { status: e.status, execucoes: 1 });
    else {
      atual.execucoes++;
      if (peso[e.status] > peso[atual.status]) atual.status = e.status;
    }
  }

  return Array.from({ length: dias }, (_, i) => {
    const dia = diaBrasilia(new Date(Date.now() - (dias - 1 - i) * 86_400_000));
    const r = porDia.get(dia);
    return { dia, status: r?.status ?? null, execucoes: r?.execucoes ?? 0 };
  });
}

// Nomes dos clientes citados nos detalhes, para exibir "Cód. 123 · Empresa X".
export async function nomesPorCodigo(codigos: number[]) {
  const unicos = [...new Set(codigos)].slice(0, 1000);
  if (unicos.length === 0) return new Map<number, string>();
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("codigo_dominio, razao_social")
    .in("codigo_dominio", unicos);
  return new Map((data ?? []).map((c) => [c.codigo_dominio as number, c.razao_social as string]));
}
