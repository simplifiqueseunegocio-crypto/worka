"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { definirSenha, type EstadoDefinirSenha } from "@/lib/equipe-actions";

const campo =
  "h-12 w-full rounded-bloco border border-borda bg-superficie px-4 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";

export function FormDefinirSenha() {
  const params = useSearchParams();
  const tokenHash = params.get("token_hash") ?? "";
  const tipo = params.get("tipo") ?? "";
  const [estado, acao, enviando] = useActionState<EstadoDefinirSenha, FormData>(definirSenha, {});

  if (!tokenHash || (tipo !== "invite" && tipo !== "recovery")) {
    return (
      <div className="mt-8 rounded-bloco border border-dashed border-borda bg-superficie p-4 text-sm">
        <p className="font-semibold text-texto">Link incompleto</p>
        <p className="mt-1 text-texto-suave">
          Abra o link exatamente como veio no e-mail. Se não funcionar, peça ao administrador um novo e-mail.
        </p>
        <Link href="/login" className="mt-3 inline-flex font-semibold text-destaque hover:underline">
          Ir para o login →
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="mt-8 flex flex-col gap-5">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="tipo" value={tipo} />
      {estado.usuarioId && <input type="hidden" name="usuario_id" value={estado.usuarioId} />}

      {estado.erro && (
        <p role="alert" className="flex items-center gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo">
          <AlertCircle className="size-4 shrink-0" />
          {estado.erro}
        </p>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-texto">Nova senha</span>
        <input name="senha" type="password" autoComplete="new-password" minLength={8} required className={campo} />
        <span className="text-xs text-texto-suave">Pelo menos 8 caracteres.</span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-texto">Confirme a senha</span>
        <input name="confirmacao" type="password" autoComplete="new-password" minLength={8} required className={campo} />
      </label>

      <button
        type="submit"
        disabled={enviando}
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-full bg-primaria text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:opacity-70"
      >
        {enviando && <LoaderCircle className="size-4 animate-spin" />}
        {enviando ? "Salvando…" : "Definir senha e entrar"}
      </button>
    </form>
  );
}
