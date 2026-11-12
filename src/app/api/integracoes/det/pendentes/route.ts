import { contarPendentes, json } from "@/lib/det-integracao";
import { tokenValido } from "@/lib/integracoes/execucoes";

// POST /api/integracoes/det/pendentes
//
// O robô do DET pergunta quantas consultas podem ser reservadas agora, sem
// reservar nada. Com a fila vazia ele nem abre o navegador nem faz login.
//
//   Authorization: Bearer <DET_ROBO_TOKEN>
//
// Resposta 200: { pendentes: 12 }


export async function POST(request: Request) {
  if (!tokenValido(request, "DET_ROBO_TOKEN")) return json(401, { erro: "Token inválido." });
  if (!process.env.SUPABASE_SECRET_KEY) return json(503, { erro: "Integração não configurada no servidor." });

  try {
    return json(200, { pendentes: await contarPendentes() });
  } catch (e) {
    console.error(e);
    return json(500, { erro: "Falha ao contar consultas." });
  }
}
