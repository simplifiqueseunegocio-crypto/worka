import { origemDaRequisicao, registrarExecucao, tokenValido } from "@/lib/integracoes/execucoes";

// POST /api/integracoes/dominio/execucoes
//
// A rotina do servidor do Domínio reporta aqui as falhas que acontecem ANTES
// do envio (Domínio fora do ar, senha errada, consulta com erro), para elas
// também aparecerem no log de sincronização.
//
//   Authorization: Bearer <DOMINIO_API_TOKEN>
//   Corpo: { "mensagem": "...", "etapa": "consulta" }

export async function POST(request: Request) {
  const iniciadoEm = new Date();
  if (!tokenValido(request)) return Response.json({ erro: "Token inválido." }, { status: 401 });
  if (!process.env.SUPABASE_SECRET_KEY) {
    return Response.json({ erro: "Integração não configurada no servidor." }, { status: 503 });
  }

  let corpo: { mensagem?: unknown; etapa?: unknown } = {};
  try {
    corpo = await request.json();
  } catch {
    // corpo inválido: registra mesmo assim, com mensagem genérica
  }
  const etapa = typeof corpo.etapa === "string" ? corpo.etapa.slice(0, 40) : "rotina";
  const mensagem = typeof corpo.mensagem === "string" ? corpo.mensagem : "Falha não informada pela rotina.";

  await registrarExecucao({
    status: "erro",
    origem: origemDaRequisicao(request),
    iniciadoEm,
    mensagem: `[${etapa}] ${mensagem}`,
  });
  return Response.json({ registrado: true });
}
