import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUsuario } from "@/lib/auth";
import { COOKIE_STATE, contaAzulConfigurada, urlAutorizacao, urlRetorno } from "@/lib/integracoes/conta-azul";

// GET /api/integracoes/conta-azul/conectar
// Admin clica em "Conectar": guarda um state aleatório num cookie (proteção
// contra CSRF) e manda para o login da Conta Azul.

export async function GET(request: Request) {
  const usuario = await getUsuario();
  const url = new URL(request.url);
  const voltar = (erro: string) =>
    NextResponse.redirect(new URL(`/configuracoes/conta-azul?erro=${encodeURIComponent(erro)}`, url.origin));

  if (usuario.papel !== "admin" || !usuario.ativo) return voltar("Apenas administradores podem conectar a Conta Azul.");
  if (!contaAzulConfigurada()) return voltar("Configure CONTA_AZUL_CLIENT_ID e CONTA_AZUL_CLIENT_SECRET no servidor.");

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(COOKIE_STATE, state, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/integracoes/conta-azul",
  });
  return NextResponse.redirect(urlAutorizacao(state, urlRetorno(url.origin)));
}
