import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { primeiroAcessoLiberado } from "@/lib/usuarios";
import { FormPrimeiroAcesso } from "./form-primeiro-acesso";

export const metadata: Metadata = { title: "Primeiro acesso" };

export default function PrimeiroAcesso() {
  return (
    <>
      <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">PRIMEIRO ACESSO</p>
      <h1 className="mt-2 font-display text-4xl text-texto">Criar administrador</h1>
      <p className="mt-2 text-sm text-texto-suave">
        Esta conta terá acesso total e poderá cadastrar o restante da equipe. Esta tela só funciona no ambiente
        local e enquanto não existir nenhum usuário.
      </p>
      <Suspense>
        <Liberado />
      </Suspense>
    </>
  );
}

async function Liberado() {
  if (!(await primeiroAcessoLiberado())) redirect("/login");
  return <FormPrimeiroAcesso />;
}
