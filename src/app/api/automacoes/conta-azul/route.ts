import { origemDaRequisicao, tokenValido } from "@/lib/integracoes/execucoes";
import { sincronizarTodos } from "@/lib/integracoes/conta-azul";

// GET /api/automacoes/conta-azul · Vercel Cron, todo dia às 23:00 (Brasília).
// Authorization: Bearer <CRON_SECRET>. Sincroniza cada cliente conectado
// (cadastro da empresa + clientes e fornecedores), do mais desatualizado ao
// mais novo, até o limite de tempo. Resumo no Log de sincronização.

export const maxDuration = 300;

export async function GET(request: Request) {
  const json = (status: number, corpo: unknown) => Response.json(corpo, { status });
  if (!tokenValido(request, "CRON_SECRET")) return json(401, { erro: "Token inválido." });
  if (!process.env.SUPABASE_SECRET_KEY) return json(503, { erro: "Integração não configurada no servidor." });

  const origem = request.headers.get("user-agent")?.startsWith("vercel-cron") ? "agendada" : origemDaRequisicao(request);
  const r = await sincronizarTodos({ origem });
  return json(r.falhas && !r.ok ? 500 : 200, r);
}
