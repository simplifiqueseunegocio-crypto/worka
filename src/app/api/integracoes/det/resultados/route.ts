import { gravarResultados, json, validarResultados } from "@/lib/det-integracao";
import { tokenValido } from "@/lib/integracoes/execucoes";

// POST /api/integracoes/det/resultados
//
// O robô do DET devolve o que leu na LISTA da Caixa Postal de cada empresa
// (ele nunca abre mensagens: abrir registra ciência no DET).
//
//   Authorization: Bearer <DET_ROBO_TOKEN>
//   Corpo: { "resultados": [{
//     "id": 1,
//     "status": "concluida" | "sem_procuracao" | "erro",
//     "mensagem": "...",
//     "repetir": false,     // erro temporário: volta à fila em 1 hora (até 3 tentativas)
//     "devolver": false,    // o lote parou antes desta: volta sem gastar tentativa
//     "avisos": [{ "data": "2026-11-22", "assunto": "...", "periodo_averbacao": "21/10 a 20/11",
//                  "competencia_desconto": "2026-11", "lida": false }]
//   }] }
//
// "avisos": TODAS as mensagens da 1ª página da lista (não só as de consignado),
// lidas ou não. Delas saem as colunas da planilha: avisos de consignado na 1ª
// página, mensagens não lidas e o último aviso de consignado.
//
// Aviso novo de consignado (assunto com consignado, Crédito do Trabalhador ou
// averbação) vira tarefa para o responsável do DP do cliente.
//
// Resposta 200: { gravadas, repetir, devolvidas, avisos_novos, tarefas_criadas } · 422 dados inválidos

export async function POST(request: Request) {
  if (!tokenValido(request, "DET_ROBO_TOKEN")) return json(401, { erro: "Token inválido." });
  if (!process.env.SUPABASE_SECRET_KEY) return json(503, { erro: "Integração não configurada no servidor." });

  let corpo: { resultados?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return json(400, { erro: "Corpo da requisição não é um JSON válido." });
  }
  const v = validarResultados(corpo?.resultados);
  if ("erros" in v) return json(422, { erro: "Dados inválidos.", detalhes: v.erros.slice(0, 50) });
  try {
    return json(200, await gravarResultados(v.resultados));
  } catch (e) {
    console.error(e);
    return json(500, { erro: "Falha ao gravar no banco." });
  }
}
