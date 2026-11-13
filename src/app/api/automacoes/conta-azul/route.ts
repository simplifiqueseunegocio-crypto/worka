import { origemDaRequisicao, tokenValido } from "@/lib/integracoes/execucoes";
import { sincronizarContaAzul } from "@/lib/integracoes/conta-azul";

// GET /api/automacoes/conta-azul · Vercel Cron, todo dia às 23:00 (Brasília).
// Authorization: Bearer <CRON_SECRET>. ?forcar=1 aceita uma queda grande na carteira.
// Cada execução fica no log em Configurações → Log de sincronização.

export const maxDuration = 300;

export async function GET(request: Request) {
  const json = (status: number, corpo: unknown) => Response.json(corpo, { status });
  if (!tokenValido(request, "CRON_SECRET")) return json(401, { erro: "Token inválido." });
  if (!process.env.SUPABASE_SECRET_KEY) return json(503, { erro: "Integração não configurada no servidor." });

  const url = new URL(request.url);
  const origem = request.headers.get("user-agent")?.startsWith("vercel-cron") ? "agendada" : origemDaRequisicao(request);
  const r = await sincronizarContaAzul({ origem, forcar: url.searchParams.get("forcar") === "1" });
  return json(r.ok ? 200 : r.status === "recusado" ? 409 : 500, r);
}
