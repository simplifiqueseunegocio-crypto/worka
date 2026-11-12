import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ArrowUpRight, Building2, CalendarClock, Flag, Repeat } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { clientesSemRegime, feriadosNacionais, listarObrigacoes, type Obrigacao } from "@/lib/obrigacoes";
import {
  descreverMeta,
  descreverVencimento,
  proximosVencimentos,
  rotulosAjuste,
  rotulosPeriodicidade,
  rotulosRegime,
} from "@/lib/prazos";
import { hojeISO, listarDepartamentos } from "@/lib/tarefas";
import { NovaObrigacao, ObrigacaoEditavel } from "@/components/obrigacoes/editor-obrigacao";
import { competenciaCurta, dataCurta, diferencaDias } from "@/components/tarefas/prazo";
import { Contador } from "@/components/ui/contador";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Obrigações" };

export default function Obrigacoes({ searchParams }: PageProps<"/obrigacoes">) {
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

// ---------------------------------------------------------------------------

const classesRegime: Record<string, string> = {
  simples: "bg-info-suave text-info",
  presumido: "bg-alerta-suave text-alerta",
  real: "bg-info-suave text-info",
  mei: "bg-sucesso-suave text-sucesso",
};

async function Conteudo({ searchParams }: { searchParams: PageProps<"/obrigacoes">["searchParams"] }) {
  const params = await searchParams;
  const filtro = typeof params.departamento === "string" ? params.departamento : "";
  const [usuario, obrigacoes, departamentos, feriados, semRegime] = await Promise.all([
    getUsuario(),
    listarObrigacoes(),
    listarDepartamentos(),
    feriadosNacionais(),
    clientesSemRegime(),
  ]);
  const admin = usuario.ativo && usuario.papel === "admin";
  const hoje = hojeISO();
  const setFeriados = new Set(feriados);
  const contexto = { departamentos: departamentos.map(({ id, nome, cor }) => ({ id, nome, cor })), feriados, hoje };

  const ativas = obrigacoes.filter((o) => o.ativo);
  const ultimoFeriado = feriados.at(-1);
  const cartoes = [
    { rotulo: "Obrigações ativas", valor: ativas.length, icone: Flag, destaque: true },
    { rotulo: "Mensais", valor: ativas.filter((o) => o.periodicidade === "mensal").length, icone: Repeat },
    {
      rotulo: "Trimestrais e anuais",
      valor: ativas.filter((o) => o.periodicidade !== "mensal").length,
      icone: CalendarClock,
    },
    { rotulo: "Vínculos com clientes", valor: ativas.reduce((s, o) => s + o.clientes, 0), icone: Building2 },
  ];

  const grupos = departamentos
    .filter((d) => !filtro || d.slug === filtro)
    .map((d) => ({
      ...d,
      obrigacoes: obrigacoes
        .filter((o) => o.departamento_id === d.id)
        .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR")),
    }))
    .filter((g) => g.obrigacoes.length || filtro);

  return (
    <>
      <div className="entrada flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">CATÁLOGO</p>
          <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">
            Obrigações
          </h1>
          <p className="mt-3 max-w-2xl text-texto-suave">
            As regras de onde saem as tarefas: prazo legal, meta interna e a quais regimes cada obrigação se aplica.
          </p>
        </div>
        {admin && <NovaObrigacao contexto={contexto} />}
      </div>

      <section aria-label="Resumo" className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-5">
        {cartoes.map((c, i) => (
          <div
            key={c.rotulo}
            className={`animate-surgir rounded-card p-5 ${c.destaque ? "col-span-2 bg-escuro text-white sm:col-span-1" : "bg-superficie"}`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className={`flex items-center gap-2 text-sm font-semibold ${c.destaque ? "text-texto-inverso-suave" : "text-texto-suave"}`}>
              <c.icone className="size-4" strokeWidth={2} />
              {c.rotulo}
            </span>
            <span
              className={`mt-2 block text-3xl font-display tabular-nums ${c.destaque ? "text-white" : "text-texto"}`}
            >
              <Contador valor={c.valor} />
            </span>
          </div>
        ))}
        <Link
          href="/clientes?regime=sem"
          className="group col-span-2 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-5 transition hover:-translate-y-0.5 hover:shadow-elevado sm:col-span-1"
          style={{ animationDelay: "200ms" }}
        >
          <span className="flex items-center justify-between gap-2 text-sm font-semibold text-texto-suave">
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4" strokeWidth={2} /> Clientes sem regime
            </span>
            <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
          <span
            className={`mt-2 block text-3xl font-display tabular-nums ${semRegime ? "text-alerta" : "text-texto"}`}
          >
            <Contador valor={semRegime} />
          </span>
          <span className="mt-1 block text-xs text-texto-suave">
            {semRegime ? "Sem nenhuma obrigação até definir o regime" : "Todos com regime definido"}
          </span>
        </Link>
      </section>

      <nav aria-label="Departamentos" className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/obrigacoes"
          aria-current={!filtro ? "page" : undefined}
          className={`flex h-10 items-center rounded-full px-4 text-sm font-semibold transition ${
            !filtro ? "bg-escuro text-white" : "bg-superficie text-texto-suave hover:text-texto"
          }`}
        >
          Todos
        </Link>
        {departamentos.map((d) => {
          const atual = d.slug === filtro;
          const qtd = ativas.filter((o) => o.departamento_id === d.id).length;
          return (
            <Link
              key={d.slug}
              href={atual ? "/obrigacoes" : `/obrigacoes?departamento=${d.slug}`}
              aria-current={atual ? "page" : undefined}
              className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                atual ? "bg-escuro text-white" : "bg-superficie text-texto-suave hover:text-texto"
              }`}
            >
              <span className="size-2.5 rounded-full" style={{ background: d.cor }} aria-hidden="true" />
              {d.nome}
              <span className={`tabular-nums ${atual ? "text-texto-inverso-suave" : "text-texto-suave/70"}`}>{qtd}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-4">
        {grupos.map((g, gi) => (
          <section
            key={g.slug}
            className="animate-surgir overflow-hidden rounded-card bg-superficie ring-1 ring-borda"
            style={{ animationDelay: `${250 + gi * 60}ms` }}
          >
            <h2 className="flex items-center gap-2.5 border-b border-borda px-4 py-4 text-lg font-bold text-texto sm:px-6">
              <span className="size-3 rounded-full" style={{ background: g.cor }} aria-hidden="true" />
              {g.nome}
              <span className="rounded-full bg-suave px-2 py-0.5 text-xs font-semibold text-texto-suave tabular-nums">
                {g.obrigacoes.length}
              </span>
            </h2>
            {g.obrigacoes.length === 0 ? (
              <p className="px-4 py-8 text-sm text-texto-suave sm:px-6">Nenhuma obrigação neste departamento.</p>
            ) : (
              <ul className="divide-y divide-borda">
                {g.obrigacoes.map((o) => {
                  const leitura = <Leitura obrigacao={o} hoje={hoje} feriados={setFeriados} />;
                  return (
                    <li key={o.id} className="transition-colors hover:bg-fundo/60">
                      {admin ? (
                        <ObrigacaoEditavel obrigacao={o} ativo={o.ativo} contexto={contexto}>
                          {leitura}
                        </ObrigacaoEditavel>
                      ) : (
                        <div className={`px-4 py-4 sm:px-6 ${o.ativo ? "" : "opacity-55"}`}>{leitura}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className="mt-6 text-xs text-texto-suave">
        Os prazos consideram fins de semana e os feriados nacionais cadastrados
        {ultimoFeriado && <> (até {ultimoFeriado.split("-").reverse().join("/")})</>}. Alterar uma regra não muda as
        tarefas já geradas.
      </p>
    </>
  );
}

function Leitura({ obrigacao: o, hoje, feriados }: { obrigacao: Obrigacao; hoje: string; feriados: Set<string> }) {
  const [proximo] = proximosVencimentos(o, hoje, feriados);
  const dias = proximo ? diferencaDias(hoje, proximo.legal) : null;

  return (
    <div className="grid gap-x-6 gap-y-3 lg:grid-cols-[minmax(220px,1.2fr)_1.4fr_1fr_0.6fr]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-texto">{o.nome}</span>
          {!o.ativo && (
            <span className="rounded-full bg-suave px-2 py-0.5 text-[11px] font-semibold text-texto-suave">Desativada</span>
          )}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-borda px-2.5 py-0.5 text-xs font-semibold text-texto">
            {rotulosPeriodicidade[o.periodicidade]}
          </span>
          {o.regimes.map((r) => (
            <span key={r} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${classesRegime[r]}`}>
              {rotulosRegime[r]}
            </span>
          ))}
        </p>
      </div>

      <div className="text-sm">
        <span className="block text-[11px] font-semibold tracking-[0.15em] text-texto-suave">VENCIMENTO</span>
        <span className="block font-semibold text-texto">{descreverVencimento(o)}</span>
        <span className="block text-xs text-texto-suave">
          {rotulosAjuste[o.ajuste]} · Meta: {descreverMeta(o.meta_dias_antes).toLowerCase()}
        </span>
      </div>

      <div className="text-sm">
        <span className="block text-[11px] font-semibold tracking-[0.15em] text-texto-suave">PRÓXIMO</span>
        {proximo ? (
          <>
            <span className="block font-semibold text-texto tabular-nums">
              {dataCurta(proximo.legal)}
              <span className="ml-1.5 text-xs font-semibold text-texto-suave">
                {dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`}
              </span>
            </span>
            <span className="block text-xs text-texto-suave tabular-nums">
              Comp. {competenciaCurta(proximo.competencia)}
              {proximo.meta !== proximo.legal && <> · meta {dataCurta(proximo.meta)}</>}
            </span>
          </>
        ) : (
          <span className="block text-texto-suave">—</span>
        )}
      </div>

      <div className="text-sm">
        <span className="block text-[11px] font-semibold tracking-[0.15em] text-texto-suave">CLIENTES</span>
        <span className="block text-lg font-extrabold text-texto tabular-nums">{o.clientes.toLocaleString("pt-BR")}</span>
      </div>
    </div>
  );
}

function Carregando() {
  return (
    <>
      <div className="h-[120px]" />
      <div className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="brilho h-[104px] rounded-card bg-superficie" />
        ))}
      </div>
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="brilho h-10 w-28 rounded-full bg-superficie" />
        ))}
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-6">
          <div className="brilho h-6 w-40 rounded-full bg-suave" />
          <div className="mt-6 flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="brilho h-16 rounded-bloco bg-fundo" />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
