import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracoes/execucoes";
import { lerLugar } from "@/lib/cnd-lugar";

// POST /api/integracoes/cnd/reservar
//
// O worker de CND (integracoes/cnd, no servidor do escritório) pede um lote da
// fila. As consultas devolvidas ficam 'processando' até o worker mandar o
// resultado em /api/integracoes/cnd/resultados (ou por 15 minutos, quando
// voltam a ser reservadas).
//
//   Authorization: Bearer <CND_WORKER_TOKEN>
//   Corpo (opcional): { "limite": 10, "tipo": "federal", "origem": "manual", "uf": "SP", "municipio": "JACI" }
//     limite 1 a 50 · sem tipo = qualquer um · origem "manual" (pedidos da tela) ou "agendada" (rodada do dia 23)
//     uf e municipio: só clientes desse lugar (municipal: cada prefeitura tem a sua rotina)
//
// Resposta 200: { consultas: [{ id, tipo, tentativas, cliente_id, documento, tipo_inscricao,
//                 razao_social, uf, codigo_municipio, inscricao_estadual, inscricao_municipal, municipio }] }

const json = (status: number, corpo: unknown) => Response.json(corpo, { status });
const TIPOS = ["federal", "fgts", "trabalhista", "estadual", "municipal"];
const ORIGENS = ["manual", "agendada"];

export async function POST(request: Request) {
  if (!tokenValido(request, "CND_WORKER_TOKEN")) return json(401, { erro: "Token inválido." });
  if (!process.env.SUPABASE_SECRET_KEY) return json(503, { erro: "Integração não configurada no servidor." });

  let limite = 10;
  let tipo: string | null = null;
  let origem: string | null = null;
  let lugar: { uf: string | null; municipio: string | null } = { uf: null, municipio: null };
  try {
    const corpo = (await request.json()) as { limite?: unknown; tipo?: unknown; origem?: unknown; uf?: unknown; municipio?: unknown };
    if (Number.isInteger(corpo?.limite)) limite = Math.min(50, Math.max(1, Number(corpo.limite)));
    if (corpo?.tipo !== undefined && corpo.tipo !== null) {
      if (!TIPOS.includes(String(corpo.tipo))) return json(422, { erro: `tipo deve ser ${TIPOS.join(", ")}.` });
      tipo = String(corpo.tipo);
    }
    if (corpo?.origem !== undefined && corpo.origem !== null) {
      if (!ORIGENS.includes(String(corpo.origem))) return json(422, { erro: `origem deve ser ${ORIGENS.join(" ou ")}.` });
      origem = String(corpo.origem);
    }
    const l = lerLugar(corpo);
    if ("erro" in l) return json(422, { erro: l.erro });
    lugar = l;
  } catch {
    // sem corpo: usa o padrão
  }

  const { data, error } = await createAdminClient().rpc("reservar_cnd", {
    p_limite: limite,
    p_tipo: tipo,
    p_origem: origem,
    p_uf: lugar.uf,
    p_municipio: lugar.municipio,
  });
  if (error) {
    console.error("Falha ao reservar consultas de CND", error);
    return json(500, { erro: "Falha ao reservar consultas." });
  }
  return json(200, { consultas: data ?? [] });
}
