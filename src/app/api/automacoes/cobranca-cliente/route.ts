import { rotaAgendada } from "@/lib/automacao-execucao";
import { AUTOMACAO_COBRANCA, executarCobranca } from "@/lib/cobranca-cliente";

// GET /api/automacoes/cobranca-cliente · Vercel Cron, segunda a sexta às 08:00 (Brasília).
// Authorization: Bearer <CRON_SECRET>.

export const maxDuration = 300;
export const GET = rotaAgendada(AUTOMACAO_COBRANCA, executarCobranca);
