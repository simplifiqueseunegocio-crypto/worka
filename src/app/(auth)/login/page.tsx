import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { primeiroAcessoLiberado } from "@/lib/usuarios";
import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Entrar" };

export default function Login() {
  return (
    <>
      <h1 className="font-display text-3xl text-texto">Entrar</h1>
      <p className="mt-2 text-sm text-texto-suave">Use o e-mail e a senha cadastrados pelo administrador.</p>
      <Suspense>
        <FormLogin />
      </Suspense>
      <Suspense>
        <AvisoPrimeiroAcesso />
      </Suspense>
    </>
  );
}

// Só aparece no ambiente local, enquanto a plataforma não tem nenhum usuário.
async function AvisoPrimeiroAcesso() {
  if (!(await primeiroAcessoLiberado())) return null;
  return (
    <div className="mt-8 rounded-bloco border border-dashed border-borda bg-superficie p-4 text-sm">
      <p className="font-semibold text-texto">Primeiro acesso à plataforma?</p>
      <p className="mt-1 text-texto-suave">Nenhum usuário foi cadastrado ainda. Crie a conta do administrador.</p>
      <Link href="/primeiro-acesso" className="mt-3 inline-flex font-semibold text-destaque hover:underline">
        Criar administrador →
      </Link>
    </div>
  );
}
