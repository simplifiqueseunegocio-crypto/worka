"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import type { FiltrosCnd, ORDENACOES_CND } from "@/lib/cnd";

const seletor =
  "h-11 cursor-pointer rounded-full border border-borda bg-superficie px-4 text-sm font-medium text-texto outline-none focus:border-primaria focus:ring-4 focus:ring-primaria/15";

// Formulário GET: funciona sem JS; com JS, o select aplica na hora.
// As ordenações vêm por prop: "@/lib/cnd" é server-only.
export function FiltrosCnd({
  filtros,
  ordenacoes,
}: {
  filtros: FiltrosCnd;
  ordenacoes: typeof ORDENACOES_CND;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pendente, iniciar] = useTransition();

  function aplicar() {
    const dados = new FormData(form.current!);
    const params = new URLSearchParams();
    for (const [chave, valor] of dados) {
      const v = String(valor).trim();
      if (v) params.set(chave, v);
    }
    const qs = params.toString();
    iniciar(() => router.push(qs ? `/cnd?${qs}` : "/cnd"));
  }

  return (
    <form
      ref={form}
      action="/cnd"
      onSubmit={(e) => {
        e.preventDefault();
        aplicar();
      }}
      className="flex flex-wrap items-center gap-3"
      role="search"
    >
      <label className="relative min-w-0 flex-1 basis-64">
        <span className="sr-only">Buscar clientes</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-texto-suave" />
        <input
          type="search"
          name="busca"
          defaultValue={filtros.busca}
          placeholder="Razão social, fantasia, CNPJ ou código"
          className="h-11 w-full rounded-full border border-borda bg-superficie pr-4 pl-11 text-sm outline-none placeholder:text-texto-suave/80 focus:border-primaria focus:ring-4 focus:ring-primaria/15"
        />
      </label>

      <label>
        <span className="sr-only">Situação</span>
        <select name="situacao" defaultValue={filtros.situacao} onChange={aplicar} className={seletor}>
          <option value="">Todas as situações</option>
          <option value="pendente">Com pendência</option>
          <option value="regular">Regulares</option>
          <option value="erro">Com erro na consulta</option>
          <option value="sem_consulta">Ainda não consultados</option>
        </select>
      </label>

      <label>
        <span className="sr-only">Ordenar por</span>
        <select name="ordem" defaultValue={filtros.ordem} onChange={aplicar} className={seletor}>
          {ordenacoes.map((o) => (
            <option key={o.ordem} value={o.ordem}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
      >
        {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
        Buscar
      </button>

      {(filtros.busca || filtros.situacao || filtros.ordem) && (
        <button
          type="button"
          onClick={() => iniciar(() => router.push("/cnd"))}
          className="flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave hover:text-texto"
        >
          <X className="size-4" /> Limpar
        </button>
      )}
    </form>
  );
}
