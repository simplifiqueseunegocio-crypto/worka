import { rotaAgendada } from "@/lib/automacao-execucao";
import { AUTOMACAO_ALERTAS_CND, executarAlertasCnd } from "@/lib/alertas-cnd";

// GET /api/automacoes/alertas-cnd · Vercel Cron, segunda a sexta às 07:10 (Brasília),
// depois das rodadas noturnas de CND. Authorization: Bearer <CRON_SECRET>.

export const maxDuration = 300;
export const GET = rotaAgendada(AUTOMACAO_ALERTAS_CND, executarAlertasCnd);
