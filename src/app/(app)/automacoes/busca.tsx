"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LoaderCircle, Search, X } from "lucide-react";

type Filtros = { tipo: string; dep: string };

const href = (busca: string, filtros: Filtros) => {
  const q = new URLSearchParams();
  if (busca) q.set("busca", busca);
  if (filtros.tipo) q.set("tipo", filtros.tipo);
  if (filtros.dep) q.set("dep", filtros.dep);
  const s = q.toString();
  return s ? `/automacoes?${s}` : "/automacoes";
};

// Formulário GET: funciona sem JS; com JS, navega sem recarregar a página.
// Os filtros de tipo e departamento continuam valendo na nova busca.
export function BuscaAutomacoes({ busca, filtros }: { busca: string; filtros: Filtros }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  return (
    <form
      action="/automacoes"
      onSubmit={(e) => {
        e.preventDefault();
        const termo = String(new FormData(e.currentTarget).get("busca") ?? "").trim();
        iniciar(() => router.push(href(termo, filtros)));
      }}
      className="flex flex-wrap items-center gap-3"
      role="search"
    >
      {filtros.tipo && <input type="hidden" name="tipo" value={filtros.tipo} />}
      {filtros.dep && <input type="hidden" name="dep" value={filtros.dep} />}
      <label className="relative min-w-0 flex-1 basis-64">
        <span className="sr-only">Buscar automações</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-texto-suave" />
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Nome, módulo ou horário (ex.: certidões, e-mail, 23:00)"
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
      {(busca || filtros.tipo || filtros.dep) && (
        <button
          type="button"
          onClick={() => iniciar(() => router.push("/automacoes"))}
          className="flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave hover:text-texto"
        >
          <X className="size-4" /> Limpar
        </button>
      )}
    </form>
  );
}
