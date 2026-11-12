"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, PartyPopper, Sparkles } from "lucide-react";
import type { Feriado, Vencimento } from "@/lib/calendario";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_NO_DIA = 3;

const diaLongo = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const rotuloDia = (iso: string) => {
  const t = diaLongo.format(new Date(`${iso}T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const competenciaCurta = (c: string) => c.split("-").reverse().join("/");
// Tarefas da obrigação na lista de Tarefas (competência e departamento; abertas, se houver).
const hrefTarefas = (v: Vencimento) => {
  const p = new URLSearchParams({ competencia: v.competencia });
  if (v.departamento.slug) p.set("departamento", v.departamento.slug);
  if (v.abertas) p.set("status", "abertas");
  return `/tarefas?${p}`;
};
const pct = (v: Vencimento) => (v.total ? Math.round((v.feitas / v.total) * 100) : 0);

type Dia = { iso: string; doMes: boolean; fimDeSemana: boolean };

function diasDaGrade(mes: string): Dia[] {
  const [a, m] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(a, m - 1, 1));
  const inicio = Date.UTC(a, m - 1, 1 - primeiro.getUTCDay());
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const semanas = Math.ceil((primeiro.getUTCDay() + ultimo) / 7);
  return Array.from({ length: semanas * 7 }, (_, i) => {
    const d = new Date(inicio + i * 86_400_000);
    return {
      iso: d.toISOString().slice(0, 10),
      doMes: d.getUTCMonth() === m - 1,
      fimDeSemana: d.getUTCDay() === 0 || d.getUTCDay() === 6,
    };
  });
}

export function CalendarioMes({
  mes,
  hoje,
  vencimentos,
  feriados,
}: {
  mes: string;
  hoje: string;
  vencimentos: Vencimento[];
  feriados: Feriado[];
}) {
  const porDia = useMemo(() => {
    const m = new Map<string, Vencimento[]>();
    for (const v of vencimentos) m.set(v.data, [...(m.get(v.data) ?? []), v]);
    return m;
  }, [vencimentos]);
  const feriadoDe = useMemo(() => new Map(feriados.map((f) => [f.data, f.descricao])), [feriados]);
  const dias = useMemo(() => diasDaGrade(mes), [mes]);

  const inicial = hoje.startsWith(mes) ? hoje : (vencimentos.find((v) => v.data >= `${mes}-01`)?.data ?? `${mes}-01`);
  const [selecionado, setSelecionado] = useState(inicial);
  const doDia = porDia.get(selecionado) ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* Grade do mês (tablet e desktop) */}
      <section aria-label="Mês" className="hidden animate-surgir rounded-card bg-superficie ring-1 ring-borda p-3 md:block">
        <div className="grid grid-cols-7">
          {SEMANA.map((s, i) => (
            <span
              key={s}
              className={`px-2 pt-1 pb-2.5 text-[11px] font-semibold tracking-[0.15em] uppercase ${
                i === 0 || i === 6 ? "text-texto-suave/60" : "text-texto-suave"
              }`}
            >
              {s}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((d) => {
            const lista = porDia.get(d.iso) ?? [];
            const feriado = feriadoDe.get(d.iso);
            const atrasado = d.iso < hoje && lista.some((v) => v.abertas > 0);
            const ehHoje = d.iso === hoje;
            const ativo = d.iso === selecionado;
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => setSelecionado(d.iso)}
                aria-pressed={ativo}
                aria-label={`${rotuloDia(d.iso)}${feriado ? `, feriado: ${feriado}` : ""}: ${lista.length} vencimento${lista.length === 1 ? "" : "s"}`}
                className={`group flex min-h-[116px] flex-col gap-1 rounded-bloco p-2 text-left transition ${
                  ativo
                    ? "bg-suave ring-2 ring-primaria"
                    : feriado
                      ? "bg-alerta-suave/60 hover:bg-alerta-suave"
                      : d.fimDeSemana
                        ? "bg-fundo/70 hover:bg-suave/70"
                        : "hover:bg-fundo"
                } ${d.doMes ? "" : "opacity-40"}`}
              >
                <span className="flex items-center justify-between gap-1">
                  <span
                    className={`grid size-7 place-items-center rounded-full text-sm font-bold tabular-nums ${
                      ehHoje ? "bg-primaria text-sobre-primaria" : "text-texto"
                    }`}
                  >
                    {Number(d.iso.slice(8))}
                  </span>
                  {atrasado && <span className="size-2 rounded-full bg-perigo-forte" title="Com tarefas atrasadas" />}
                </span>
                {feriado && (
                  <span className="truncate text-[11px] font-semibold text-alerta" title={feriado}>
                    {feriado}
                  </span>
                )}
                {lista.slice(0, MAX_NO_DIA).map((v) => (
                  <Pilula key={`${v.obrigacao}|${v.competencia}`} v={v} passou={d.iso < hoje} />
                ))}
                {lista.length > MAX_NO_DIA && (
                  <span className="px-1.5 text-[11px] font-semibold text-texto-suave">
                    +{lista.length - MAX_NO_DIA} {lista.length - MAX_NO_DIA === 1 ? "outra" : "outras"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Agenda (celular): só os dias com vencimento ou feriado */}
      <section aria-label="Agenda do mês" className="flex flex-col gap-3 md:hidden">
        {dias
          .filter((d) => d.doMes && (porDia.has(d.iso) || feriadoDe.has(d.iso)))
          .map((d) => (
            <div key={d.iso} className="animate-surgir rounded-card bg-superficie ring-1 ring-borda p-4">
              <p className={`text-sm font-bold ${d.iso === hoje ? "text-destaque" : "text-texto"}`}>
                {rotuloDia(d.iso)}
                {d.iso === hoje && " · hoje"}
              </p>
              {feriadoDe.has(d.iso) && (
                <p className="mt-0.5 text-xs font-semibold text-alerta">Feriado · {feriadoDe.get(d.iso)}</p>
              )}
              <ul className="mt-3 flex flex-col gap-2">
                {(porDia.get(d.iso) ?? []).map((v) => (
                  <ItemDetalhe key={`${v.obrigacao}|${v.competencia}`} v={v} hoje={hoje} href={hrefTarefas(v)} />
                ))}
              </ul>
            </div>
          ))}
        {!vencimentos.length && !feriados.length && (
          <p className="rounded-card bg-superficie p-6 text-center text-sm text-texto-suave">Nenhum vencimento neste mês.</p>
        )}
      </section>

      {/* Detalhe do dia escolhido */}
      <aside
        aria-live="polite"
        className="hidden animate-surgir self-start rounded-card bg-superficie ring-1 ring-borda p-5 md:block xl:sticky xl:top-6"
        style={{ animationDelay: "80ms" }}
      >
        <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave uppercase">
          {selecionado === hoje ? "Hoje" : selecionado < hoje ? "Passou" : "Próximo"}
        </p>
        <h2 className="mt-1 font-display text-2xl text-texto">{rotuloDia(selecionado)}</h2>
        {feriadoDe.has(selecionado) && (
          <p className="mt-3 flex items-center gap-2 rounded-bloco bg-alerta-suave px-3 py-2 text-sm font-semibold text-alerta">
            <PartyPopper className="size-4 shrink-0" /> Feriado · {feriadoDe.get(selecionado)}
          </p>
        )}
        {doDia.length ? (
          <ul className="rolagem-discreta mt-4 flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {doDia.map((v) => (
              <ItemDetalhe key={`${v.obrigacao}|${v.competencia}`} v={v} hoje={hoje} href={hrefTarefas(v)} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 flex items-center gap-2 rounded-bloco bg-fundo px-4 py-6 text-sm text-texto-suave">
            <CalendarCheck className="size-4 shrink-0 text-destaque" /> Nenhum vencimento neste dia.
          </p>
        )}
      </aside>
    </div>
  );
}

function Pilula({ v, passou }: { v: Vencimento; passou: boolean }) {
  const feito = v.total > 0 && v.abertas === 0;
  const atrasado = passou && v.abertas > 0;
  return (
    <span
      className={`flex items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
        v.prevista
          ? "border border-dashed border-borda text-texto-suave"
          : atrasado
            ? "bg-perigo-suave text-perigo"
            : feito
              ? "bg-sucesso-suave text-sucesso"
              : "bg-superficie text-texto shadow-[0_0_0_1px_var(--color-borda)]"
      }`}
      title={`${v.obrigacao} · ${v.departamento.nome}`}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: v.departamento.cor }} />
      <span className="truncate">{v.obrigacao}</span>
      {!v.prevista && <span className="ml-auto shrink-0 font-medium tabular-nums opacity-70">{v.abertas || "✓"}</span>}
    </span>
  );
}

function ItemDetalhe({ v, hoje, href }: { v: Vencimento; hoje: string; href: string }) {
  const atrasado = v.data < hoje && v.abertas > 0;
  const p = pct(v);
  const conteudo = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-texto">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: v.departamento.cor }} />
            <span className="truncate">{v.obrigacao}</span>
          </span>
          <span className="mt-0.5 block text-xs text-texto-suave">
            {v.departamento.nome} · competência {competenciaCurta(v.competencia)}
          </span>
        </span>
        {v.prevista ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-suave px-2 py-0.5 text-[11px] font-semibold text-texto-suave">
            <Sparkles className="size-3" /> Prevista
          </span>
        ) : atrasado ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-perigo-suave px-2 py-0.5 text-[11px] font-semibold text-perigo">
            <AlertTriangle className="size-3" /> {v.abertas} atrasada{v.abertas === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="shrink-0 text-xs font-bold text-texto tabular-nums">{p}%</span>
        )}
      </span>
      {v.prevista ? (
        <span className="mt-2 block text-xs text-texto-suave">Tarefas ainda não geradas para esta competência.</span>
      ) : (
        <>
          <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-suave">
            <span
              className="block h-full origin-left animate-crescer rounded-full"
              style={{ width: `${p}%`, background: atrasado ? "var(--color-perigo-forte)" : v.departamento.cor }}
            />
          </span>
          <span className="mt-1.5 block text-xs text-texto-suave tabular-nums">
            {v.feitas} de {v.total} concluídas{v.abertas ? ` · ${v.abertas} em aberto` : ""}
          </span>
        </>
      )}
    </>
  );

  return (
    <li>
      {v.prevista ? (
        <div className="rounded-bloco border border-dashed border-borda p-3">{conteudo}</div>
      ) : (
        <Link
          href={href}
          className="block rounded-bloco border border-borda p-3 transition hover:border-primaria/40 hover:bg-fundo"
        >
          {conteudo}
        </Link>
      )}
    </li>
  );
}
