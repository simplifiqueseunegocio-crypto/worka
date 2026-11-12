import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracoes/execucoes";
import { lerLugar } from "@/lib/cnd-lugar";

// POST /api/integracoes/cnd/pendentes
//
// O worker de CND pergunta quantas consultas podem ser reservadas agora, por
// tipo e origem, sem reservar nada. Com a fila vazia ele nem abre o navegador.
//
//   Authorization: Bearer <CND_WORKER_TOKEN>
//   Corpo (opcional): { "uf": "SP", "municipio": "JACI" }: só clientes desse lugar
//
// Resposta 200: { pendentes: { federal: { manual: 0, agendada: 12 }, ... } }

const json = (status: number, corpo: unknown) => Response.json(corpo, { status });

export async function POST(request: Request) {
  if (!tokenValido(request, "CND_WORKER_TOKEN")) return json(401, { erro: "Token inválido." });
  if (!process.env.SUPABASE_SECRET_KEY) return json(503, { erro: "Integração não configurada no servidor." });

  let corpo: { uf?: unknown; municipio?: unknown } = {};
  try {
    corpo = (await request.json()) ?? {};
  } catch {
    // sem corpo: conta tudo
  }
  const lugar = lerLugar(corpo);
  if ("erro" in lugar) return json(422, { erro: lugar.erro });

  const { data, error } = await createAdminClient().rpc("contar_cnd_pendentes", { p_uf: lugar.uf, p_municipio: lugar.municipio });
  if (error) {
    console.error("Falha ao contar consultas de CND", error);
    return json(500, { erro: "Falha ao contar consultas." });
  }

  const pendentes: Record<string, Record<string, number>> = {};
  for (const linha of (data ?? []) as { tipo: string; origem: string; quantidade: number }[]) {
    pendentes[linha.tipo] ??= {};
    pendentes[linha.tipo][linha.origem] = linha.quantidade;
  }
  return json(200, { pendentes });
}
