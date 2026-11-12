import type { Metadata } from "next";
import { Suspense } from "react";
import { FormDefinirSenha } from "./form-definir-senha";

export const metadata: Metadata = { title: "Definir senha" };

// Aberta pelo link do e-mail enviado quando o admin cria o usuário (ou pede
// uma nova senha). O token só é usado quando a pessoa envia o formulário.
export default function DefinirSenha() {
  return (
    <>
      <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">ACESSO À PLATAFORMA</p>
      <h1 className="mt-2 font-display text-4xl text-texto">Definir senha</h1>
      <p className="mt-2 text-sm text-texto-suave">Escolha a senha que você vai usar para entrar no Worka.</p>
      <Suspense>
        <FormDefinirSenha />
      </Suspense>
    </>
  );
}
