import { rotaAgendada } from "@/lib/automacao-execucao";
import { AUTOMACAO_MONITOR_VENCIMENTOS, executarMonitorVencimentos } from "@/lib/monitor-vencimentos";

// GET /api/automacoes/monitor-vencimentos · Vercel Cron, segunda a sexta às 07:40 (Brasília).
// Authorization: Bearer <CRON_SECRET>.

export const maxDuration = 300;
export const GET = rotaAgendada(AUTOMACAO_MONITOR_VENCIMENTOS, executarMonitorVencimentos);
