import { rotaAgendada } from "@/lib/automacao-execucao";
import { AUTOMACAO_ATRASOS, executarAtrasosGestor } from "@/lib/atrasos-gestor";

// GET /api/automacoes/atrasos-gestor · Vercel Cron, segunda a sexta às 07:20 (Brasília).
// Authorization: Bearer <CRON_SECRET>. ?forcar=1 reenvia mesmo se já enviado hoje.

export const maxDuration = 300;
export const GET = rotaAgendada(AUTOMACAO_ATRASOS, executarAtrasosGestor);
