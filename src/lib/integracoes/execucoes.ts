import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Token Bearer das integrações (DOMINIO_API_TOKEN, CND_WORKER_TOKEN), comparado
// por hash para o tempo não depender do tamanho nem do conteúdo.
export function tokenValido(request: Request, variavel = "DOMINIO_API_TOKEN") {
  const esperado = process.env[variavel];
  const recebido = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!esperado || !recebido) return false;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(recebido), hash(esperado));
}

// Quem chamou: a rotina manda X-Origem ("agendada" ou "manual: usuário@máquina").
export function origemDaRequisicao(request: Request) {
  return request.headers.get("x-origem")?.slice(0, 120) || "api";
}

export type Execucao = {
  integracao?: string; // padrão da tabela: dominio_clientes
  status: "sucesso" | "recusado" | "erro";
  origem: string;
  iniciadoEm: Date;
  forcar?: boolean;
  mensagem?: string | null;
  resultado?: {
    recebidas?: number;
    inseridas?: number;
    atualizadas?: number;
    reativadas?: number;
    suspensas?: number;
    regimes_alterados?: number;
    detalhes?: unknown;
  } | null;
  detalhes?: unknown;
};

// Grava no log de sincronização. Falha ao registrar não derruba a integração.
export async function registrarExecucao(e: Execucao) {
  const r = e.resultado ?? {};
  const { error } = await createAdminClient()
    .from("integracao_execucoes")
    .insert({
      ...(e.integracao ? { integracao: e.integracao } : {}),
      status: e.status,
      origem: e.origem,
      iniciado_em: e.iniciadoEm.toISOString(),
      duracao_ms: Date.now() - e.iniciadoEm.getTime(),
      forcar: e.forcar ?? false,
      mensagem: e.mensagem?.slice(0, 2000) ?? null,
      recebidas: r.recebidas ?? null,
      inseridas: r.inseridas ?? null,
      atualizadas: r.atualizadas ?? null,
      reativadas: r.reativadas ?? null,
      suspensas: r.suspensas ?? null,
      regimes_alterados: r.regimes_alterados ?? null,
      detalhes: r.detalhes ?? e.detalhes ?? null,
    });
  if (error) console.error("Falha ao registrar execução da integração", error);
}
