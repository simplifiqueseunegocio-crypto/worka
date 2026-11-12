import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarEmpresas } from "@/lib/integracoes/dominio";
import {
  origemDaRequisicao,
  registrarExecucao,
  tokenValido,
  type Execucao,
} from "@/lib/integracoes/execucoes";

// POST /api/integracoes/dominio/clientes
//
// Recebe a lista COMPLETA de empresas ativas do Domínio
// (integracoes/dominio/empresas-ativas.sql) e sincroniza a tabela clientes.
// Toda chamada autenticada fica registrada em integracao_execucoes.
//
//   Authorization: Bearer <DOMINIO_API_TOKEN>
//   X-Origem: opcional (a rotina manda "agendada" ou "manual: ...")
//   Corpo: [ {...}, ... ]  ou  { "empresas": [ ... ] }
//   ?forcar=true  aceita uma lista bem menor que a carteira atual
//
// Resposta 200: { recebidas, inseridas, atualizadas, reativadas, suspensas, regimes_alterados, detalhes }

const json = (status: number, corpo: unknown) => Response.json(corpo, { status });

export async function POST(request: Request) {
  const iniciadoEm = new Date();

  if (!tokenValido(request)) {
    return json(401, { erro: "Token inválido." });
  }
  if (!process.env.SUPABASE_SECRET_KEY) {
    return json(503, { erro: "Integração não configurada no servidor." });
  }

  const origem = origemDaRequisicao(request);
  const forcar = new URL(request.url).searchParams.get("forcar") === "true";
  const registrar = (status: Execucao["status"], extra: Pick<Execucao, "mensagem" | "resultado" | "detalhes"> = {}) =>
    registrarExecucao({ status, origem, iniciadoEm, forcar, ...extra });

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    await registrar("recusado", { mensagem: "Corpo da requisição não é um JSON válido." });
    return json(400, { erro: "Corpo da requisição não é um JSON válido." });
  }

  const resultado = normalizarEmpresas(corpo);
  if (!resultado.ok) {
    await registrar("recusado", { mensagem: "Dados inválidos.", detalhes: { erros: resultado.erros } });
    return json(422, { erro: "Dados inválidos.", detalhes: resultado.erros });
  }

  const { data, error } = await createAdminClient().rpc("sincronizar_clientes_dominio", {
    p_empresas: resultado.empresas,
    p_forcar: forcar,
  });

  if (error) {
    // 22023 = recusa de negócio (lista vazia ou muito menor que a carteira).
    if (error.code === "22023") {
      await registrar("recusado", { mensagem: error.message, resultado: { recebidas: resultado.empresas.length } });
      return json(409, { erro: error.message });
    }
    console.error("Falha ao sincronizar clientes do Domínio", error);
    await registrar("erro", { mensagem: `Falha ao gravar no banco: ${error.message}` });
    return json(500, { erro: "Falha ao gravar no banco." });
  }

  await registrar("sucesso", { resultado: data });
  return json(200, data);
}
