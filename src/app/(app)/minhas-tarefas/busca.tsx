"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import type { FiltrosMinhasTarefas } from "@/lib/tarefas";

function href(visao: string, busca: string) {
  const p = new URLSearchParams();
  if (visao !== "abertas") p.set("visao", visao);
  if (busca) p.set("busca", busca);
  const qs = p.toString();
  return qs ? `/minhas-tarefas?${qs}` : "/minhas-tarefas";
}

// Formulário GET: funciona sem JS; com JS, navega sem recarregar a página.
export function Busca({ filtros }: { filtros: FiltrosMinhasTarefas }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  return (
    <form
      action="/minhas-tarefas"
      onSubmit={(e) => {
        e.preventDefault();
        const busca = String(new FormData(e.currentTarget).get("busca") ?? "").trim();
        iniciar(() => router.push(href(filtros.visao, busca)));
      }}
      className="flex flex-wrap items-center gap-3"
      role="search"
    >
      {filtros.visao !== "abertas" && <input type="hidden" name="visao" value={filtros.visao} />}
      <label className="relative min-w-0 flex-1 basis-64">
        <span className="sr-only">Buscar nas suas tarefas</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-texto-suave" />
        <input
          type="search"
          name="busca"
          defaultValue={filtros.busca}
          placeholder="Cliente, fantasia ou código"
          className="h-11 w-full rounded-full border border-borda bg-superficie pr-4 pl-11 text-sm outline-none placeholder:text-texto-suave/80 focus:border-primaria focus:ring-4 focus:ring-primaria/15"
        />
      </label>
      <button
        type="submit"
        className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
      >
        {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
        Buscar
      </button>
      {filtros.busca && (
        <button
          type="button"
          onClick={() => iniciar(() => router.push(href(filtros.visao, "")))}
          className="flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave hover:text-texto"
        >
          <X className="size-4" /> Limpar
        </button>
      )}
    </form>
  );
}
