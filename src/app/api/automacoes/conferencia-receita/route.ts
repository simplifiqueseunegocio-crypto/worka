import { rotaAgendada } from "@/lib/automacao-execucao";
import { AUTOMACAO_RECEITA, executarConferenciaReceita } from "@/lib/conferencia-receita";

// GET /api/automacoes/conferencia-receita · Vercel Cron, todo dia às 05:00 (Brasília).
// Authorization: Bearer <CRON_SECRET>. Consulta a BrasilAPI mesmo sem e-mail configurado.

export const maxDuration = 300;
export const GET = rotaAgendada(AUTOMACAO_RECEITA, executarConferenciaReceita, { precisaEmail: false });
