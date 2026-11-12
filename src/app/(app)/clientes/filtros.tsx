"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import type { FiltrosClientes } from "@/lib/clientes";

const seletor =
  "h-11 cursor-pointer rounded-full border border-borda bg-superficie px-4 text-sm font-medium text-texto outline-none focus:border-primaria focus:ring-4 focus:ring-primaria/15";

// Formulário GET: funciona sem JS; com JS, os selects aplicam na hora.
export function Filtros({ filtros }: { filtros: FiltrosClientes }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pendente, iniciar] = useTransition();

  function aplicar() {
    const dados = new FormData(form.current!);
    const params = new URLSearchParams();
    for (const [chave, valor] of dados) {
      const v = String(valor).trim();
      if (v && !(chave === "status" && v === "ativo")) params.set(chave, v);
    }
    const qs = params.toString();
    iniciar(() => router.push(qs ? `/clientes?${qs}` : "/clientes"));
  }

  const temFiltro = filtros.busca || filtros.regime || filtros.status !== "ativo";

  return (
    <form
      ref={form}
      action="/clientes"
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
        <span className="sr-only">Regime</span>
        <select name="regime" defaultValue={filtros.regime} onChange={aplicar} className={seletor}>
          <option value="">Todos os regimes</option>
          <option value="simples">Simples Nacional</option>
          <option value="presumido">Lucro Presumido</option>
          <option value="real">Lucro Real</option>
          <option value="mei">MEI</option>
          <option value="sem">Sem regime</option>
        </select>
      </label>

      <label>
        <span className="sr-only">Situação</span>
        <select name="status" defaultValue={filtros.status} onChange={aplicar} className={seletor}>
          <option value="ativo">Ativos</option>
          <option value="suspenso">Suspensos</option>
          <option value="encerrado">Encerrados</option>
          <option value="todos">Todas as situações</option>
        </select>
      </label>

      <button
        type="submit"
        className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
      >
        {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
        Buscar
      </button>

      {temFiltro && (
        <button
          type="button"
          onClick={() => iniciar(() => router.push("/clientes"))}
          className="flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave hover:text-texto"
        >
          <X className="size-4" /> Limpar
        </button>
      )}
    </form>
  );
}
