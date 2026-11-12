import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarChart3, Download, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import {
  atrasos,
  departamentosDoRelatorio,
  gerarRelatorio,
  lerFiltrosRelatorio,
  pct,
  pontualidade,
  somarMeses,
  type FiltrosRelatorio,
  type Indicadores,
  type LinhaMes,
} from "@/lib/relatorios";
import { competenciaPadrao, listarDepartamentos } from "@/lib/tarefas";
import { Contador } from "@/components/ui/contador";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Relatórios" };

export default function Pagina({ searchParams }: PageProps<"/relatorios">) {
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

const competenciaCurta = (c: string) => c.split("-").reverse().join("/");
const mesCurto = (c: string) =>
  new Date(`${c}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
const numero = (n: number) => n.toLocaleString("pt-BR");
const MAX_CLIENTES = 15;

function hrefExportar(tipo: string, f: FiltrosRelatorio) {
  const p = new URLSearchParams({ tipo, de: f.de, ate: f.ate });
  if (f.departamento) p.set("departamento", f.departamento);
  return `/relatorios/exportar?${p}`;
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/relatorios">["searchParams"] }) {
  // O período padrão e os atrasos dependem da data de hoje: calcula na requisição.
  await connection();
  const filtros = lerFiltrosRelatorio(await searchParams);
  // Departamentos já em paralelo com o usuário (cache: a leitura é reaproveitada).
  const [usuario] = await Promise.all([getUsuario(), listarDepartamentos()]);
  const departamentos = await departamentosDoRelatorio(usuario);
  if (!departamentos.length) return <SemAcesso />;

  const r = await gerarRelatorio(filtros, departamentos);
  const g = r.geral;
  const pont = pontualidade(g);
  const opcoes = Array.from({ length: 24 }, (_, i) => somarMeses(competenciaPadrao(), 1 - i));

  const cartoes = [
    {
      rotulo: "Tarefas no período",
      valor: g.total,
      sufixo: "",
      detalhe: `${numero(g.concluidas)} concluídas`,
      cor: "",
    },
    {
      rotulo: "Entregues com atraso",
      valor: g.entreguesComAtraso,
      sufixo: "",
      detalhe: "Concluídas depois do prazo legal",
      cor: g.entreguesComAtraso ? "text-alerta" : "",
    },
    {
      rotulo: "Abertas atrasadas",
      valor: g.abertasAtrasadas,
      sufixo: "",
      detalhe: "Ainda abertas, prazo vencido",
      cor: g.abertasAtrasadas ? "text-perigo" : "",
    },
    {
      rotulo: "Na meta interna",
      valor: pct(g.naMeta, g.concluidas) ?? 0,
      sufixo: "%",
      detalhe: "Das concluídas, até a meta",
      cor: "",
    },
  ];

  const campo =
    "h-11 cursor-pointer rounded-full border border-borda bg-superficie px-4 text-sm font-medium text-texto outline-none focus:border-primaria focus:ring-4 focus:ring-primaria/15";

  return (
    <>
      <div className="entrada flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave uppercase">
            Competências {competenciaCurta(filtros.de)} a {competenciaCurta(filtros.ate)}
          </p>
          <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">
            Relatórios{r.departamento && <span className="text-destaque"> · {r.departamento.nome}</span>}
          </h1>
        </div>
        <form action="/relatorios" className="flex flex-wrap items-center gap-2" aria-label="Filtros">
          <label className="flex items-center gap-2 text-sm text-texto-suave">
            De
            <select name="de" defaultValue={filtros.de} className={campo}>
              {opcoes.map((c) => (
                <option key={c} value={c}>
                  {competenciaCurta(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-texto-suave">
            até
            <select name="ate" defaultValue={filtros.ate} className={campo}>
              {opcoes.map((c) => (
                <option key={c} value={c}>
                  {competenciaCurta(c)}
                </option>
              ))}
            </select>
          </label>
          <select name="departamento" defaultValue={filtros.departamento} aria-label="Departamento" className={campo}>
            {departamentos.length > 1 && <option value="">Todos os departamentos</option>}
            {departamentos.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.nome}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-11 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
          >
            Aplicar
          </button>
        </form>
      </div>

      {g.total === 0 ? (
        <section className="mt-8 flex flex-col items-start gap-3 rounded-card bg-superficie ring-1 ring-borda p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-xl bg-suave text-destaque">
            <BarChart3 className="size-6" strokeWidth={1.8} />
          </span>
          <h2 className="text-lg font-bold text-texto">Nenhuma tarefa no período</h2>
          <p className="max-w-2xl text-sm text-texto-suave">
            Escolha outras competências ou gere as tarefas do mês na página Tarefas.
          </p>
        </section>
      ) : (
        <>
          <section aria-label="Resumo" className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-5">
            <div className="relative col-span-2 animate-surgir overflow-hidden rounded-card bg-escuro p-5 text-white xl:col-span-1">
              <span className="block text-sm font-semibold text-texto-inverso-suave">Pontualidade</span>
              <span className="mt-2 flex items-baseline gap-1 text-3xl font-display">
                {pont === null ? "—" : <Contador valor={pont} />}
                <span className="text-xl text-realce">%</span>
              </span>
              <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full origin-left animate-crescer rounded-full bg-realce"
                  style={{ width: `${pont ?? 0}%` }}
                />
              </span>
              <span className="mt-2 block text-xs text-texto-inverso-suave tabular-nums">
                {numero(g.noPrazo)} de {numero(g.concluidas + g.abertasAtrasadas)} no prazo legal
              </span>
            </div>
            {cartoes.map((c, i) => (
              <div
                key={c.rotulo}
                className="animate-surgir rounded-card bg-superficie ring-1 ring-borda p-5"
                style={{ animationDelay: `${(i + 1) * 50}ms` }}
              >
                <span className="block text-sm font-semibold text-texto-suave">{c.rotulo}</span>
                <span
                  className={`mt-2 flex items-baseline gap-0.5 text-3xl font-display tabular-nums ${c.cor || "text-texto"}`}
                >
                  <Contador valor={c.valor} />
                  {c.sufixo && <span className="text-xl text-texto-suave">{c.sufixo}</span>}
                </span>
                <span className="mt-1 block text-xs text-texto-suave">{c.detalhe}</span>
              </div>
            ))}
          </section>

          <section
            className="mt-4 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-5 sm:p-6"
            style={{ animationDelay: "250ms" }}
            aria-labelledby="por-mes"
          >
            <Cabecalho
              id="por-mes"
              titulo="Pontualidade por competência"
              descricao="Concluídas no prazo legal, sobre as concluídas e as abertas já vencidas"
              href={hrefExportar("meses", filtros)}
            />
            <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <GraficoMeses meses={r.meses} />
              <TabelaMeses meses={r.meses} />
            </div>
          </section>

          <section className="mt-4 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6" aria-labelledby="colaboradores">
            <Cabecalho
              id="colaboradores"
              titulo="Produtividade por colaborador"
              descricao="Tarefas de cada responsável no período (o responsável atual de cada tarefa)"
              href={hrefExportar("colaboradores", filtros)}
            />
            <div className="-mx-4 mt-3 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave">
                    <th className="px-4 py-3 font-semibold sm:px-6">RESPONSÁVEL</th>
                    <th className="px-3 py-3 text-right font-semibold">TAREFAS</th>
                    <th className="px-3 py-3 text-right font-semibold">CONCLUÍDAS</th>
                    <th className="w-[220px] px-3 py-3 font-semibold">PONTUALIDADE</th>
                    <th className="px-3 py-3 text-right font-semibold">NA META</th>
                    <th className="px-3 py-3 text-right font-semibold">ATRASOS</th>
                    <th className="px-4 py-3 text-right font-semibold sm:px-6">ABERTAS</th>
                  </tr>
                </thead>
                <tbody>
                  {r.colaboradores.map((c) => (
                    <tr key={c.id ?? "sem"} className="border-t border-borda transition-colors hover:bg-fundo">
                      <td className="px-4 py-3 sm:px-6">
                        <span className="flex items-center gap-2.5">
                          <span
                            className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold uppercase ${
                              c.id ? "bg-suave text-destaque" : "border border-dashed border-alerta-borda text-alerta"
                            }`}
                            aria-hidden="true"
                          >
                            {c.id ? c.nome.slice(0, 1) : "?"}
                          </span>
                          <span className={`font-semibold ${c.id ? "text-texto" : "text-alerta"}`}>
                            {c.id === usuario.id ? `${c.nome} (você)` : c.nome}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{numero(c.total)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{numero(c.concluidas)}</td>
                      <td className="px-3 py-3">
                        <Barra valor={pontualidade(c)} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {pct(c.naMeta, c.concluidas) === null ? "—" : `${pct(c.naMeta, c.concluidas)}%`}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <Atrasos i={c} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums sm:px-6">{numero(c.abertas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-4 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6" aria-labelledby="clientes">
            <Cabecalho
              id="clientes"
              titulo="Clientes com mais atrasos"
              descricao={
                r.clientes.length
                  ? `${numero(r.clientes.length)} de ${numero(r.totalClientes)} clientes tiveram atraso no período${
                      r.clientes.length > MAX_CLIENTES
                        ? ` · os ${MAX_CLIENTES} primeiros abaixo, todos na exportação`
                        : ""
                    }`
                  : `Nenhum dos ${numero(r.totalClientes)} clientes teve atraso no período`
              }
              href={r.clientes.length ? hrefExportar("clientes", filtros) : undefined}
            />
            {r.clientes.length > 0 && (
              <div className="-mx-4 mt-3 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave">
                      <th className="px-4 py-3 font-semibold sm:px-6">CLIENTE</th>
                      <th className="px-3 py-3 text-right font-semibold">TAREFAS</th>
                      <th className="px-3 py-3 text-right font-semibold">ENTREGUES COM ATRASO</th>
                      <th className="px-3 py-3 text-right font-semibold">ABERTAS ATRASADAS</th>
                      <th className="w-[220px] px-4 py-3 font-semibold sm:px-6">PONTUALIDADE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.clientes.slice(0, MAX_CLIENTES).map((c) => (
                      <tr key={c.id} className="border-t border-borda transition-colors hover:bg-fundo">
                        <td className="max-w-[380px] px-4 py-3 sm:px-6">
                          <Link
                            href={`/clientes/${c.id}`}
                            className="block truncate font-semibold text-texto hover:text-destaque hover:underline"
                            title={c.razao_social}
                          >
                            {c.codigo_dominio !== null && (
                              <span className="font-medium text-texto-suave tabular-nums">{c.codigo_dominio} · </span>
                            )}
                            {c.nome}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{numero(c.total)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{numero(c.entreguesComAtraso)}</td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums ${c.abertasAtrasadas ? "font-semibold text-perigo" : ""}`}
                        >
                          {numero(c.abertasAtrasadas)}
                        </td>
                        <td className="px-4 py-3 sm:px-6">
                          <Barra valor={pontualidade(c)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="mt-4 text-xs text-texto-suave">
            Pontualidade = concluídas até o prazo legal ÷ (concluídas + abertas com o prazo vencido). Dispensadas não
            entram na conta. As exportações abrem direto no Excel (CSV com “;”).
          </p>
        </>
      )}
    </>
  );
}

function Cabecalho({ id, titulo, descricao, href }: { id: string; titulo: string; descricao: string; href?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id={id} className="text-lg font-bold text-texto">
          {titulo}
        </h2>
        <p className="text-sm text-texto-suave">{descricao}</p>
      </div>
      {href && (
        <a
          href={href}
          download
          className="flex h-10 items-center gap-2 rounded-full border border-borda px-4 text-sm font-semibold text-texto transition-colors hover:bg-suave"
        >
          <Download className="size-4" /> Exportar para Excel
        </a>
      )}
    </div>
  );
}

// Barra de pontualidade com o número ao lado (o número carrega o dado; a barra, a leitura rápida).
function Barra({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-texto-suave">—</span>;
  return (
    <span className="flex items-center gap-3">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-suave">
        <span
          className="block h-full origin-left animate-crescer rounded-full bg-primaria"
          style={{ width: `${valor}%` }}
        />
      </span>
      <span className="w-10 text-right font-semibold text-texto tabular-nums">{valor}%</span>
    </span>
  );
}

function Atrasos({ i }: { i: Indicadores }) {
  const n = atrasos(i);
  if (!n) return <span className="text-texto-suave">0</span>;
  return (
    <span title={`${i.entreguesComAtraso} entregues com atraso · ${i.abertasAtrasadas} abertas atrasadas`}>
      <span className="font-semibold text-texto">{numero(n)}</span>
      {i.abertasAtrasadas > 0 && <span className="ml-1 text-xs text-perigo">({i.abertasAtrasadas} abertas)</span>}
    </span>
  );
}

// Uma série (pontualidade %), barras finas ancoradas na base, escala fixa 0–100.
function GraficoMeses({ meses }: { meses: LinhaMes[] }) {
  return (
    <figure className="flex flex-col">
      <div className="relative h-56 pl-9">
        {[100, 50, 0].map((v) => (
          <span
            key={v}
            className="absolute right-0 left-9 border-t border-borda/70"
            style={{ bottom: `${v}%` }}
            aria-hidden="true"
          >
            <span className="absolute -top-2 -left-9 w-7 text-right text-[11px] text-texto-suave tabular-nums">{v}%</span>
          </span>
        ))}
        <div className="relative flex h-full items-end gap-[2px]">
          {meses.map((m) => {
            const p = pontualidade(m);
            return (
              <div
                key={m.competencia}
                tabIndex={0}
                className="group relative flex h-full flex-1 items-end justify-center outline-none"
                aria-label={`${competenciaCurta(m.competencia)}: ${p === null ? "sem dados" : `${p}% no prazo`}`}
              >
                {p === null ? (
                  <span className="mb-0.5 h-[2px] w-full max-w-7 rounded-full bg-borda" />
                ) : (
                  <span
                    className="w-full max-w-7 origin-bottom animate-[crescerY_700ms_cubic-bezier(0.22,1,0.36,1)_both] rounded-t-[4px] bg-primaria transition-colors group-hover:bg-primaria-hover group-focus-visible:bg-primaria-hover"
                    style={{ height: `${Math.max(p, 1)}%` }}
                  />
                )}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2 rounded-lg bg-escuro px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <strong className="block">{competenciaCurta(m.competencia)}</strong>
                  {p === null ? (
                    "Sem tarefas"
                  ) : (
                    <>
                      {p}% no prazo · {numero(m.noPrazo)}/{numero(m.concluidas + m.abertasAtrasadas)}
                      <br />
                      {numero(atrasos(m))} atrasos · {numero(m.abertas)} abertas
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-[2px] pl-9" aria-hidden="true">
        {meses.map((m) => (
          <span key={m.competencia} className="flex-1 text-center text-[11px] text-texto-suave capitalize">
            {mesCurto(m.competencia)}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">Pontualidade por competência; os valores estão na tabela ao lado.</figcaption>
    </figure>
  );
}

function TabelaMeses({ meses }: { meses: LinhaMes[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave">
            <th className="py-2 pr-3 font-semibold">COMPETÊNCIA</th>
            <th className="px-3 py-2 text-right font-semibold">TAREFAS</th>
            <th className="px-3 py-2 text-right font-semibold">CONCLUSÃO</th>
            <th className="px-3 py-2 text-right font-semibold">NO PRAZO</th>
            <th className="py-2 pl-3 text-right font-semibold">ATRASOS</th>
          </tr>
        </thead>
        <tbody>
          {[...meses].reverse().map((m) => {
            const p = pontualidade(m);
            const conclusao = pct(m.concluidas + m.dispensadas, m.total);
            return (
              <tr key={m.competencia} className="border-t border-borda">
                <td className="py-2 pr-3 font-medium text-texto tabular-nums">{competenciaCurta(m.competencia)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.total ? numero(m.total) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{conclusao === null ? "—" : `${conclusao}%`}</td>
                <td className="px-3 py-2 text-right font-semibold text-texto tabular-nums">
                  {p === null ? "—" : `${p}%`}
                </td>
                <td className="py-2 pl-3 text-right tabular-nums">{m.total ? numero(atrasos(m)) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SemAcesso() {
  return (
    <section className="mt-4 flex flex-col items-start gap-3 rounded-card bg-superficie ring-1 ring-borda p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-xl bg-suave text-destaque">
        <Lock className="size-6" strokeWidth={1.8} />
      </span>
      <h1 className="font-display text-3xl text-texto">Relatórios</h1>
      <p className="max-w-2xl text-sm text-texto-suave">
        Os relatórios de produtividade e atrasos são para gestores e administradores. Suas tarefas estão em Minhas
        tarefas.
      </p>
    </section>
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
      <div className="brilho mt-4 h-[340px] rounded-card bg-superficie" />
      <div className="brilho mt-4 h-[320px] rounded-card bg-superficie" />
    </>
  );
}
