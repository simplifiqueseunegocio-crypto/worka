import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUsuario } from "@/lib/auth";
import { COOKIE_STATE, concluirConexao, sincronizarCliente, urlRetorno } from "@/lib/integracoes/conta-azul";

// GET /api/integracoes/conta-azul/retorno?code=...&state=...
// Volta do login da Conta Azul: confere o state, troca o código pelos tokens,
// identifica a empresa, cria/vincula o cliente e já faz a primeira leitura.
// Esta URL precisa estar cadastrada no app da Conta Azul.

export const maxDuration = 120;

const iguais = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destino = (q: string) => NextResponse.redirect(new URL(`/configuracoes/conta-azul?${q}`, url.origin));
  const falha = (erro: string) => destino(`erro=${encodeURIComponent(erro)}`);

  const jar = await cookies();
  const [esperado, clienteEsperado] = (jar.get(COOKIE_STATE)?.value ?? "").split(".");
  jar.delete({ name: COOKIE_STATE, path: "/api/integracoes/conta-azul" });

  const usuario = await getUsuario();
  if (usuario.papel !== "admin" || !usuario.ativo) return falha("Apenas administradores podem conectar a Conta Azul.");

  const recusa = url.searchParams.get("error");
  if (recusa) return falha(`A Conta Azul não autorizou a conexão (${recusa}).`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !esperado || !iguais(state, esperado)) {
    return falha("Sessão de conexão inválida ou expirada. Clique em conectar de novo.");
  }

  let r;
  try {
    r = await concluirConexao(code, urlRetorno(url.origin), usuario.id, clienteEsperado || null);
  } catch (e) {
    console.error("Conta Azul: falha ao concluir a conexão", e);
    return falha(e instanceof Error ? e.message : "Falha ao concluir a conexão.");
  }

  // Primeira leitura já na volta; se falhar, fica registrada na linha do cliente.
  await sincronizarCliente(r.clienteId);
  return destino(`conectado=${encodeURIComponent(r.nome)}&novo=${r.criado ? 1 : 0}`);
}
