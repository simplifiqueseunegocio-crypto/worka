import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { calendarioDoMes, lerFiltrosCalendario, somarMeses, type FiltrosCalendario } from "@/lib/calendario";
import { hojeISO, somarDias } from "@/lib/tarefas";
import { CalendarioMes } from "@/components/calendario/calendario-mes";
import { Contador } from "@/components/ui/contador";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Calendário" };

export default function Pagina({ searchParams }: PageProps<"/calendario">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <Suspense
          fallback={
            <Esqueleto>
              <Carregando />
            </Esqueleto>
          }
        >
          <Revelar>
            <Conteudo searchParams={searchParams} />
          </Revelar>
        </Suspense>
      </main>
    </TransicaoPagina>
  );
}

function hrefCalendario(f: FiltrosCalendario, mudar: Partial<FiltrosCalendario> = {}) {
  const n = { ...f, ...mudar };
  const p = new URLSearchParams();
  if (n.mes !== hojeISO().slice(0, 7)) p.set("mes", n.mes);
  if (n.departamento) p.set("departamento", n.departamento);
  if (n.minhas) p.set("minhas", "1");
  const qs = p.toString();
  return qs ? `/calendario?${qs}` : "/calendario";
}

const rotuloMes = (mes: string) => {
  const t = new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

async function Conteudo({ searchParams }: { searchParams: PageProps<"/calendario">["searchParams"] }) {
  // "Hoje" e o mês padrão dependem da data: calcula na requisição, não no prerender.
  await connection();
  const hoje = hojeISO();
  const filtros = lerFiltrosCalendario(await searchParams, hoje);
  const usuario = await getUsuario();
  const { vencimentos, feriados, departamentos, departamento } = await calendarioDoMes(filtros, usuario.id);

  const geradas = vencimentos.filter((v) => !v.prevista);
  const total = geradas.reduce((s, v) => s + v.total, 0);
  const feitas = geradas.reduce((s, v) => s + v.feitas, 0);
  const atrasadas = geradas.filter((v) => v.data < hoje).reduce((s, v) => s + v.abertas, 0);
  const proximos7 = geradas
    .filter((v) => v.data >= hoje && v.data <= somarDias(hoje, 7))
    .reduce((s, v) => s + v.abertas, 0);
  const previstas = vencimentos.length - geradas.length;
  const conclusao = total ? Math.round((feitas / total) * 100) : 0;
  const mesAtual = filtros.mes === hoje.slice(0, 7);

  const cartoes = [
    {
      rotulo: "Vencimentos no mês",
      valor: vencimentos.length,
      detalhe: previstas ? `${previstas} previstos, ainda sem tarefas` : "Obrigações com prazo legal",
      cor: "",
    },
    {
      rotulo: "Atrasadas",
      valor: atrasadas,
      detalhe: "Abertas com o prazo já vencido",
      cor: atrasadas ? "text-perigo" : "",
    },
    {
      rotulo: "Vencem em 7 dias",
      valor: proximos7,
      detalhe: "Tarefas abertas",
      cor: proximos7 ? "text-alerta" : "",
    },
    {
      rotulo: "Feriados",
      valor: feriados.length,
      detalhe: feriados.length ? feriados.map((f) => Number(f.data.slice(8))).join(", ") : "Nenhum neste mês",
      cor: "",
    },
  ];

  const chip = (ativo: boolean) =>
    `flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors ${
      ativo ? "bg-escuro text-white" : "bg-superficie text-texto-suave hover:bg-suave hover:text-texto"
    }`;

  return (
    <>
      <div className="entrada flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave uppercase">
            Vencimentos{filtros.minhas ? " · só minhas tarefas" : ""}
          </p>
          <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">
            {rotuloMes(filtros.mes)}
            {departamento && <span className="text-destaque"> · {departamento.nome}</span>}
          </h1>
        </div>
        <nav aria-label="Mês" className="flex items-center gap-2">
          {!mesAtual && (
            <Link
              href={hrefCalendario(filtros, { mes: hoje.slice(0, 7) })}
              className="flex h-11 items-center rounded-full border border-borda bg-superficie px-4 text-sm font-semibold text-texto hover:bg-suave"
            >
              Hoje
            </Link>
          )}
          <Link
            href={hrefCalendario(filtros, { mes: somarMeses(filtros.mes, -1) })}
            className="grid size-11 place-items-center rounded-full border border-borda bg-superficie text-texto hover:bg-suave"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <Link
            href={hrefCalendario(filtros, { mes: somarMeses(filtros.mes, 1) })}
            className="grid size-11 place-items-center rounded-full border border-borda bg-superficie text-texto hover:bg-suave"
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-5" />
          </Link>
        </nav>
      </div>

      <section aria-label="Resumo" className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <div className="relative col-span-2 animate-surgir overflow-hidden rounded-card bg-escuro p-5 text-white xl:col-span-1">
          <span className="block text-sm font-semibold text-texto-inverso-suave">Conclusão do mês</span>
          <span className="mt-2 flex items-baseline gap-1 text-3xl font-display">
            <Contador valor={conclusao} />
            <span className="text-xl text-realce">%</span>
          </span>
          <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full origin-left animate-crescer rounded-full bg-realce"
              style={{ width: `${conclusao}%` }}
            />
          </span>
          <span className="mt-2 block text-xs text-texto-inverso-suave tabular-nums">
            {feitas.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} tarefas vencendo no mês
          </span>
        </div>
        {cartoes.map((c, i) => (
          <div
            key={c.rotulo}
            className="animate-surgir rounded-card bg-superficie ring-1 ring-borda p-5"
            style={{ animationDelay: `${(i + 1) * 50}ms` }}
          >
            <span className="block text-sm font-semibold text-texto-suave">{c.rotulo}</span>
            <span className={`mt-2 block text-3xl font-display tabular-nums ${c.cor || "text-texto"}`}>
              <Contador valor={c.valor} />
            </span>
            <span className="mt-1 block truncate text-xs text-texto-suave">{c.detalhe}</span>
          </div>
        ))}
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Departamento" className="flex flex-wrap items-center gap-1.5">
          <Link href={hrefCalendario(filtros, { departamento: "" })} className={chip(!filtros.departamento)}>
            Todos
          </Link>
          {departamentos.map((d) => (
            <Link
              key={d.slug}
              href={hrefCalendario(filtros, { departamento: filtros.departamento === d.slug ? "" : d.slug })}
              aria-current={filtros.departamento === d.slug ? "page" : undefined}
              className={chip(filtros.departamento === d.slug)}
            >
              <span className="size-2 rounded-full" style={{ background: d.cor }} aria-hidden="true" />
              {d.nome}
            </Link>
          ))}
        </nav>
        <Link
          href={hrefCalendario(filtros, { minhas: !filtros.minhas })}
          role="switch"
          aria-checked={filtros.minhas}
          className="flex h-9 items-center gap-2.5 rounded-full bg-superficie px-3.5 text-sm font-semibold text-texto hover:bg-suave"
        >
          <span
            className={`relative h-5 w-9 rounded-full transition-colors ${filtros.minhas ? "bg-primaria" : "bg-borda"}`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-0.5 size-4 rounded-full bg-superficie shadow transition-all ${
                filtros.minhas ? "left-[18px]" : "left-0.5"
              }`}
            />
          </span>
          Só minhas tarefas
        </Link>
      </div>

      <div className="mt-4">
        <CalendarioMes key={filtros.mes} mes={filtros.mes} hoje={hoje} vencimentos={vencimentos} feriados={feriados} />
      </div>

      <ul aria-label="Legenda" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-texto-suave">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-superficie shadow-[0_0_0_1px_var(--color-borda)]" /> Em aberto (número =
          abertas)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-sucesso-suave" /> Tudo concluído
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-perigo-suave" /> Prazo vencido com tarefas abertas
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded border border-dashed border-texto-suave/50" /> Prevista (tarefas não geradas)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-alerta-suave" /> Feriado nacional
        </li>
      </ul>
    </>
  );
}

function Carregando() {
  return (
    <>
      <div className="h-[86px]" />
      <div className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="brilho h-[124px] rounded-card bg-superficie" />
        ))}
      </div>
      <div className="brilho mt-4 h-9 w-2/3 rounded-full bg-superficie" />
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="brilho h-[640px] rounded-card bg-superficie" />
        <div className="brilho h-[320px] rounded-card bg-superficie" />
      </div>
    </>
  );
}
