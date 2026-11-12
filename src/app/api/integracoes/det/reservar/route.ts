import { json, reservar } from "@/lib/det-integracao";
import { tokenValido } from "@/lib/integracoes/execucoes";

// POST /api/integracoes/det/reservar
//
// O robô do DET (integracoes/det, no computador do escritório) pede um lote da
// fila. As consultas devolvidas ficam 'processando' até o robô mandar o
// resultado em /api/integracoes/det/resultados (ou por 15 minutos, quando
// voltam a ser reservadas).
//
//   Authorization: Bearer <DET_ROBO_TOKEN>
//   Corpo (opcional): { "limite": 10 }   (1 a 50)
//
// Resposta 200: { consultas: [{ id, tentativas, competencia, cliente_id, documento, tipo_inscricao, razao_social }] }


export async function POST(request: Request) {
  if (!tokenValido(request, "DET_ROBO_TOKEN")) return json(401, { erro: "Token inválido." });
  if (!process.env.SUPABASE_SECRET_KEY) return json(503, { erro: "Integração não configurada no servidor." });

  let limite = 10;
  try {
    const corpo = (await request.json()) as { limite?: unknown };
    if (Number.isInteger(corpo?.limite)) limite = Math.min(50, Math.max(1, Number(corpo.limite)));
  } catch {
    // sem corpo: usa o padrão
  }

  try {
    return json(200, { consultas: await reservar(limite) });
  } catch (e) {
    console.error(e);
    return json(500, { erro: "Falha ao reservar consultas." });
  }
}
