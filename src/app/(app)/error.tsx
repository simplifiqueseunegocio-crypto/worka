"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

// Erro ao carregar uma página da área logada (ex.: banco fora do ar).
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-start justify-center gap-4 px-4 py-16 sm:px-8">
      <span className="grid size-12 place-items-center rounded-xl bg-perigo-suave text-perigo">
        <AlertTriangle className="size-6" />
      </span>
      <h1 className="font-display text-3xl leading-[1.1] text-texto">Não foi possível carregar esta página.</h1>
      <p className="text-base leading-relaxed text-texto-suave">
        Tente de novo em instantes. Se continuar, avise o administrador
        {error.digest ? (
          <>
            {" "}
            informando o código <code className="rounded bg-suave px-1.5 py-0.5 text-sm text-texto">{error.digest}</code>
          </>
        ) : null}
        .
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 flex h-11 items-center gap-2 rounded-full bg-primaria px-6 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover"
      >
        <RotateCcw className="size-4" /> Tentar de novo
      </button>
    </main>
  );
}
