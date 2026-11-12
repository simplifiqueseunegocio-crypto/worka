import { rotaAgendada } from "@/lib/automacao-execucao";
import { AUTOMACAO_RESUMO, executarResumoDiario } from "@/lib/resumo-diario";

// GET /api/automacoes/resumo-diario · Vercel Cron, segunda a sexta às 07:00 (Brasília).
// Authorization: Bearer <CRON_SECRET>. ?forcar=1 reenvia mesmo se já enviado hoje.

export const maxDuration = 300;
export const GET = rotaAgendada(AUTOMACAO_RESUMO, executarResumoDiario);
