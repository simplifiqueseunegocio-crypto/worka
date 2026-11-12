import { createAdminClient } from "@/lib/supabase/admin";
import { tokenValido } from "@/lib/integracoes/execucoes";

// POST /api/integracoes/cnd/resultados
//
// O worker de CND devolve o resultado das consultas reservadas.
//
//   Authorization: Bearer <CND_WORKER_TOKEN>
//   Corpo: { "resultados": [{ "id": 1, "status": "regular" | "pendente" | "erro",
//            "mensagem": "...", "detalhes": {...}, "repetir": false }] }
//
// "repetir": true num erro temporário (site fora do ar) devolve a consulta
// para a fila, até 3 tentativas.
// "devolver": true (com repetir) devolve uma consulta reservada que nem chegou
// a ser feita (o lote parou antes dela): volta à fila sem gastar a tentativa.
//
// Resposta 200: { gravadas, repetir, devolvidas } · 422 dados inválidos

const json = (status: number, corpo: unknown) => Response.json(corpo, { status });
const STATUS = ["regular", "pendente", "erro"];

export async function POST(request: Request) {
  if (!tokenValido(request, "CND_WORKER_TOKEN")) return json(401, { erro: "Token inválido." });
  if (!process.env.SUPABASE_SECRET_KEY) return json(503, { erro: "Integração não configurada no servidor." });

  let corpo: { resultados?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return json(400, { erro: "Corpo da requisição não é um JSON válido." });
  }

  const lista = corpo?.resultados;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > 200) {
    return json(422, { erro: "Envie { resultados: [...] } com 1 a 200 itens." });
  }

  const erros: string[] = [];
  const resultados = lista.map((bruto, i) => {
    const r = (bruto ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(r.id)) erros.push(`resultado ${i + 1}: id inválido.`);
    if (!STATUS.includes(String(r.status))) erros.push(`resultado ${i + 1}: status deve ser ${STATUS.join(", ")}.`);
    return {
      id: r.id,
      status: r.status,
      mensagem: typeof r.mensagem === "string" ? r.mensagem.slice(0, 2000) : null,
      detalhes: r.detalhes && typeof r.detalhes === "object" ? r.detalhes : null,
      repetir: r.repetir === true,
      devolver: r.devolver === true,
    };
  });
  if (erros.length) return json(422, { erro: "Dados inválidos.", detalhes: erros });

  const admin = createAdminClient();
  const devolver = resultados.filter((r) => r.devolver).map((r) => r.id as number);
  let devolvidas = 0;
  if (devolver.length) {
    const { data: reservadas, error } = await admin
      .from("cnd_consultas")
      .select("id, tentativas")
      .in("id", devolver)
      .eq("status", "processando");
    if (error) {
      console.error("Falha ao devolver consultas de CND", error);
      return json(500, { erro: "Falha ao gravar no banco." });
    }
    const disponivel = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const gravacoes = await Promise.all(
      (reservadas ?? []).map((c) =>
        admin
          .from("cnd_consultas")
          .update({
            status: "na_fila",
            tentativas: Math.max(c.tentativas - 1, 0),
            iniciada_em: null,
            disponivel_em: disponivel,
          })
          .eq("id", c.id)
          .eq("status", "processando"),
      ),
    );
    const falha = gravacoes.find((g) => g.error);
    if (falha) {
      console.error("Falha ao devolver consultas de CND", falha.error);
      return json(500, { erro: "Falha ao gravar no banco." });
    }
    devolvidas = gravacoes.length;
  }

  const outros = resultados
    .filter((r) => !r.devolver)
    .map((r) => ({ id: r.id, status: r.status, mensagem: r.mensagem, detalhes: r.detalhes, repetir: r.repetir }));
  if (!outros.length) return json(200, { gravadas: 0, repetir: 0, devolvidas });
  const { data, error } = await admin.rpc("registrar_cnd_resultados", { p_resultados: outros });
  if (error) {
    console.error("Falha ao gravar resultados de CND", error);
    return json(500, { erro: "Falha ao gravar no banco." });
  }
  return json(200, { ...(data as Record<string, unknown>), devolvidas });
}
