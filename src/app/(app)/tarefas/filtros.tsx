"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import type { FiltrosTarefas } from "@/lib/tarefas";

const seletor =
  "h-11 max-w-full cursor-pointer rounded-full border border-borda bg-superficie px-4 text-sm font-medium text-texto outline-none focus:border-primaria focus:ring-4 focus:ring-primaria/15";

// Formulário GET: funciona sem JS; com JS, os selects aplicam na hora.
export function Filtros({
  filtros,
  padrao,
  competencias,
  departamentos,
  equipe,
}: {
  filtros: FiltrosTarefas;
  padrao: string;
  competencias: { valor: string; rotulo: string }[];
  departamentos: { slug: string; nome: string }[];
  equipe: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pendente, iniciar] = useTransition();

  function aplicar() {
    const dados = new FormData(form.current!);
    const params = new URLSearchParams();
    for (const [chave, valor] of dados) {
      const v = String(valor).trim();
      if (v && !(chave === "competencia" && v === padrao)) params.set(chave, v);
    }
    const qs = params.toString();
    iniciar(() => router.push(qs ? `/tarefas?${qs}` : "/tarefas"));
  }

  const temFiltro =
    filtros.busca || filtros.departamento || filtros.responsavel || filtros.status || filtros.prazo;
  // Competência fora da lista (ex.: link antigo) continua selecionável.
  const opcoes = competencias.some((c) => c.valor === filtros.competencia) || filtros.competencia === "todas"
    ? competencias
    : [{ valor: filtros.competencia, rotulo: filtros.competencia.split("-").reverse().join("/") }, ...competencias];

  return (
    <form
      ref={form}
      action="/tarefas"
      onSubmit={(e) => {
        e.preventDefault();
        aplicar();
      }}
      className="flex flex-wrap items-center gap-3"
      role="search"
    >
      {filtros.prazo && <input type="hidden" name="prazo" value={filtros.prazo} />}

      <label className="relative min-w-0 flex-1 basis-64">
        <span className="sr-only">Buscar por cliente</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-texto-suave" />
        <input
          type="search"
          name="busca"
          defaultValue={filtros.busca}
          placeholder="Cliente, CNPJ ou código"
          className="h-11 w-full rounded-full border border-borda bg-superficie pr-4 pl-11 text-sm outline-none placeholder:text-texto-suave/80 focus:border-primaria focus:ring-4 focus:ring-primaria/15"
        />
      </label>

      <label>
        <span className="sr-only">Competência</span>
        <select name="competencia" defaultValue={filtros.competencia} onChange={aplicar} className={seletor}>
          {opcoes.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
          <option value="todas">Todas as competências</option>
        </select>
      </label>

      <label>
        <span className="sr-only">Departamento</span>
        <select name="departamento" defaultValue={filtros.departamento} onChange={aplicar} className={seletor}>
          <option value="">Todos os departamentos</option>
          {departamentos.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.nome}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="sr-only">Responsável</span>
        <select name="responsavel" defaultValue={filtros.responsavel} onChange={aplicar} className={seletor}>
          <option value="">Todos os responsáveis</option>
          <option value="sem">Sem responsável</option>
          {equipe.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="sr-only">Status</span>
        <select name="status" defaultValue={filtros.status} onChange={aplicar} className={seletor}>
          <option value="">Todos os status</option>
          <option value="abertas">Abertas</option>
          <option value="atrasada">Atrasadas</option>
          <option value="pendente">Pendentes</option>
          <option value="em_andamento">Em andamento</option>
          <option value="aguardando_cliente">Aguardando cliente</option>
          <option value="concluida">Concluídas</option>
          <option value="dispensada">Dispensadas</option>
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
          onClick={() => {
            const p = filtros.competencia === padrao ? "" : `?competencia=${filtros.competencia}`;
            iniciar(() => router.push(`/tarefas${p}`));
          }}
          className="flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave hover:text-texto"
        >
          <X className="size-4" /> Limpar
        </button>
      )}
    </form>
  );
}
