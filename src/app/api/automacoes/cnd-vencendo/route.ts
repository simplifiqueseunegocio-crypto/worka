import { rotaAgendada } from "@/lib/automacao-execucao";
import { AUTOMACAO_CND_VENCENDO, executarCndVencendo } from "@/lib/cnd-vencendo";

// GET /api/automacoes/cnd-vencendo · Vercel Cron, segunda a sexta às 07:30 (Brasília).
// Authorization: Bearer <CRON_SECRET>.

export const maxDuration = 300;
export const GET = rotaAgendada(AUTOMACAO_CND_VENCENDO, executarCndVencendo);
