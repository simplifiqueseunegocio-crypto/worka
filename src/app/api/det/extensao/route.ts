import { contarPendentes, gravarResultados, json, operadorDaExtensao, reservar, validarResultados } from "@/lib/det-integracao";

// POST /api/det/extensao
//
// A extensão "Robô do DET" (integracoes/det/extensao) roda na guia do DET em
// que a pessoa já entrou e fala com a plataforma usando a sessão de quem está
// logado neste navegador (gestor ou admin). Sem token guardado em lugar nenhum.
//
//   X-Robo-Det: 1
//   Corpo: { "acao": "pendentes" }                      → { pendentes, operador }
//          { "acao": "reservar", "limite": 10 }         → { consultas: [...] }
//          { "acao": "resultados", "resultados": [...] } → resumo (formato de /api/integracoes/det/resultados)

export async function POST(request: Request) {
  const operador = await operadorDaExtensao(request);
  if (operador instanceof Response) return operador;

  let corpo: { acao?: unknown; limite?: unknown; resultados?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return json(400, { erro: "Corpo da requisição não é um JSON válido." });
  }

  try {
    switch (corpo?.acao) {
      case "pendentes":
        return json(200, { pendentes: await contarPendentes(), operador });
      case "reservar":
        return json(200, { consultas: await reservar(Number.isInteger(corpo.limite) ? Number(corpo.limite) : 10) });
      case "resultados": {
        const v = validarResultados(corpo.resultados);
        if ("erros" in v) return json(422, { erro: "Dados inválidos.", detalhes: v.erros.slice(0, 50) });
        return json(200, await gravarResultados(v.resultados));
      }
      default:
        return json(400, { erro: "Ação desconhecida." });
    }
  } catch (e) {
    console.error(e);
    return json(500, { erro: "Falha ao falar com o banco. Tente de novo." });
  }
}
