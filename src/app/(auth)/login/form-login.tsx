"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { entrar, type EstadoLogin } from "@/lib/auth-actions";

const campo =
  "h-12 w-full rounded-bloco border border-borda bg-superficie px-4 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";

export function FormLogin() {
  const proximo = useSearchParams().get("proximo") ?? "/";
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao} className="mt-8 flex flex-col gap-5">
      <input type="hidden" name="proximo" value={proximo} />

      {estado.erro && (
        <p role="alert" className="flex items-center gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo">
          <AlertCircle className="size-4 shrink-0" />
          {estado.erro}
        </p>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-texto">E-mail</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={estado.email}
          placeholder="nome@empresa.com.br"
          className={campo}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-texto">Senha</span>
        <input name="senha" type="password" autoComplete="current-password" required className={campo} />
      </label>

      <button
        type="submit"
        disabled={enviando}
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-full bg-primaria text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:opacity-70"
      >
        {enviando && <LoaderCircle className="size-4 animate-spin" />}
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
