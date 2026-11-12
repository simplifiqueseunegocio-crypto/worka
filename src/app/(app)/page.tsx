import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlertTriangle, ArrowUpRight, CalendarClock, Hourglass, Search } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { feriadosNacionais } from "@/lib/obrigacoes";
import { cargaEquipe, proximosVencimentos, semanaAtual, vencemHoje } from "@/lib/painel";
import {
  competenciaPadrao,
  competenciasRecentes,
  hojeISO,
  listarDepartamentos,
  listarResponsaveis,
  meusDepartamentos,
  obrigacoesParaTarefa,
  resumoTarefas,
} from "@/lib/tarefas";
import { GerarTarefas } from "@/components/tarefas/gestao-tarefas";
import { NovaTarefa } from "@/components/tarefas/nova-tarefa";
import { Contador } from "@/components/ui/contador";
import { SeletorCompetencia } from "@/components/ui/seletor-competencia";
import { StatusTarefaChip } from "@/components/ui/status-tarefa";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Início" };

const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

export default function Inicio({ searchParams }: PageProps<"/">) {
  return (
    <TransicaoPagina>
      <div className="flex min-h-screen flex-col">
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
      </div>
    </TransicaoPagina>
  );
}

const dataLonga = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diaSemanaLongo = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long" });

async function Conteudo({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  // "Hoje", a semana e a competência padrão dependem da data: calcula na requisição.
  await connection();
  const hoje = hojeISO();
  const params = await searchParams;
  const pedida = Array.isArray(params.competencia) ? params.competencia[0] : params.competencia;
  const competencia = pedida && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedida) ? pedida : competenciaPadrao();

  const [usuario, departamentos] = await Promise.all([getUsuario(), listarDepartamentos()]);
  const gestor = usuario.papel === "admin" || usuario.papel === "gestor";
  const [r, hojeN, semana, proximos, carga, meus, equipe, obrigacoes, feriados] = await Promise.all([
    resumoTarefas(competencia, departamentos, null),
    vencemHoje(competencia),
    semanaAtual(),
    proximosVencimentos(),
    cargaEquipe(),
    gestor ? meusDepartamentos(usuario.id) : ([] as number[]),
    gestor ? listarResponsaveis() : [],
    gestor ? obrigacoesParaTarefa() : [],
    gestor ? feriadosNacionais() : [],
  ]);
  const gere = (dep: number) => usuario.papel === "admin" || (usuario.papel === "gestor" && meus.includes(dep));

  const competencias = competenciasRecentes();
  if (!competencias.some((c) => c.valor === competencia)) {
    competencias.unshift({ valor: competencia, rotulo: competencia.split("-").reverse().join("/") });
  }
  const rotuloCompetencia = competencias.find((c) => c.valor === competencia)!.rotulo;
  const conclusao = pct(r.concluidas, r.total);
  const maiorCarga = Math.max(1, ...carga.map((p) => p.abertas));
  const maiorDia = Math.max(0, ...semana.map((d) => d.vencimentos));
  const feriadosDaSemana = semana.filter((d) => d.feriado);
  const naCompetencia = (extra: Record<string, string>) => `/tarefas?${new URLSearchParams({ competencia, ...extra })}`;
  const titulo = dataLonga.format(new Date(`${hoje}T12:00:00Z`)).toUpperCase();

  return (
    <>
      {/* Barra superior */}
      <div className="sticky top-16 z-20 border-b border-borda bg-fundo/85 backdrop-blur lg:top-0">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-8">
          <form action="/clientes" role="search" className="relative flex-1 sm:max-w-md">
            <label>
              <span className="sr-only">Buscar cliente</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-texto-suave" />
              <input
                type="search"
                name="busca"
                placeholder="Buscar cliente, CNPJ ou código"
                className="h-11 w-full rounded-full border border-borda bg-superficie pr-4 pl-11 text-sm outline-none placeholder:text-texto-suave/80 focus:border-primaria focus:ring-4 focus:ring-primaria/15"
              />
            </label>
          </form>
          {gestor && (
            <div className="ml-auto">
              <NovaTarefa
                obrigacoes={obrigacoes.filter((o) => gere(o.departamento_id))}
                departamentos={departamentos.filter((d) => gere(d.id)).map(({ id, nome, cor }) => ({ id, nome, cor }))}
                equipe={equipe}
                feriados={feriados}
                competencia={competencia}
              />
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-8">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="animate-surgir">
            <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">{titulo}</p>
            <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">
              Painel da <span className="text-destaque">competência</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SeletorCompetencia caminho="/" competencia={competencia} opcoes={competencias} comRotulo />
            {gestor && <GerarTarefas competencia={competencia} rotulo={ddmmAaaa(competencia)} />}
          </div>
        </div>

        {/* Indicadores */}
        <section aria-label="Indicadores" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href={naCompetencia({})}
            className="relative animate-surgir overflow-hidden rounded-card bg-escuro p-6 text-white transition hover:-translate-y-0.5"
            style={{ animationDelay: "60ms" }}
          >
            <svg
              viewBox="0 0 32 32"
              className="pointer-events-none absolute -right-8 -bottom-10 w-52 text-primaria opacity-20"
              aria-hidden="true"
            >
              <path
                d="M7.5 11.5 11.75 21.5 16 14 20.25 21.5 25 8.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-texto-inverso-suave">CONCLUSÃO DA COMPETÊNCIA</p>
            <p className="mt-4 flex items-baseline gap-1 font-display text-6xl leading-none">
              <Contador valor={conclusao} />
              <span className="text-3xl text-realce">%</span>
            </p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full origin-left animate-crescer rounded-full bg-realce"
                style={{ width: `${conclusao}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-texto-inverso-suave">
              <strong className="font-semibold text-white">
                <Contador valor={r.concluidas} />
              </strong>{" "}
              de {r.total.toLocaleString("pt-BR")} tarefas · {rotuloCompetencia.toLowerCase()}
            </p>
          </Link>

          <Indicador
            atraso={120}
            icone={<AlertTriangle className="size-5" />}
            corIcone="bg-perigo-suave text-perigo"
            rotulo="Atrasadas"
            valor={r.atrasadas}
            detalhe="Passaram do prazo legal"
            href={naCompetencia({ status: "atrasada" })}
          />
          <Indicador
            atraso={180}
            icone={<CalendarClock className="size-5" />}
            corIcone="bg-info-suave text-info"
            rotulo="Vencem em 7 dias"
            valor={r.semana}
            detalhe={
              hojeN
                ? `${hojeN.toLocaleString("pt-BR")} ${hojeN === 1 ? "vence" : "delas vencem"} hoje`
                : "Nenhuma vence hoje"
            }
            href={naCompetencia({ prazo: "7d" })}
          />
          <Indicador
            atraso={240}
            icone={<Hourglass className="size-5" />}
            corIcone="bg-alerta-suave text-alerta"
            rotulo="Aguardando cliente"
            valor={r.aguardando}
            detalhe="Documentos ou informações pendentes"
            href={naCompetencia({ status: "aguardando_cliente" })}
          />
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {/* Progresso por departamento */}
          <section
            className="min-w-0 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-6 xl:col-span-2"
            style={{ animationDelay: "300ms" }}
          >
            <CabecalhoCard titulo="Progresso por departamento" subtitulo="Tarefas concluídas na competência" />
            {r.total === 0 ? (
              <Vazio>
                Nenhuma tarefa em {rotuloCompetencia.toLowerCase()}.{gestor ? " Use “Gerar tarefas” acima." : ""}
              </Vazio>
            ) : (
              <ul className="mt-6 flex flex-col gap-5">
                {r.departamentos.map((d, i) => {
                  const p = pct(d.concluidas, d.total);
                  return (
                    <li key={d.slug}>
                      <Link
                        href={naCompetencia({ departamento: d.slug })}
                        className="grid grid-cols-[110px_1fr_auto] items-center gap-4 rounded-lg sm:grid-cols-[140px_1fr_auto]"
                      >
                        <span className="flex items-center gap-2.5 text-sm font-semibold">
                          <span className="size-2.5 rounded-full" style={{ background: d.cor }} />
                          {d.nome}
                        </span>
                        <span className="h-3 overflow-hidden rounded-full bg-suave">
                          <span
                            className="block h-full origin-left animate-crescer rounded-full"
                            style={{ width: `${p}%`, background: d.cor, animationDelay: `${350 + i * 80}ms` }}
                          />
                        </span>
                        <span className="text-right text-sm whitespace-nowrap tabular-nums sm:w-28">
                          <strong className="font-bold">{d.total ? `${p}%` : "—"}</strong>
                          <span className="text-texto-suave">
                            {" "}
                            · {d.concluidas}/{d.total}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Semana */}
          <section className="min-w-0 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-6" style={{ animationDelay: "360ms" }}>
            <CabecalhoCard
              titulo="Esta semana"
              subtitulo="Tarefas com prazo legal em cada dia"
              href="/calendario"
              rotuloLink="Calendário"
            />
            <ol className="mt-6 grid grid-cols-7 gap-1.5">
              {semana.map((d) => {
                const altura = maiorDia ? Math.max(6, (d.vencimentos / maiorDia) * 100) : 6;
                return (
                  <li key={d.iso} className="flex flex-col items-center gap-2" title={d.feriado ?? undefined}>
                    <span className="text-xs font-bold tabular-nums">{d.vencimentos || "–"}</span>
                    <span className="flex h-28 w-full items-end justify-center">
                      <span
                        className={`w-full max-w-8 rounded-lg ${
                          d.hoje ? "bg-primaria" : d.feriado ? "bg-realce" : d.vencimentos ? "bg-primaria/35" : "bg-suave"
                        }`}
                        style={{ height: `${altura}%` }}
                      />
                    </span>
                    <span
                      className={`flex w-full flex-col items-center rounded-xl py-1.5 ${
                        d.hoje ? "bg-escuro text-white" : "text-texto-suave"
                      }`}
                    >
                      <span className="text-[10px] font-semibold uppercase">{d.dia}</span>
                      <span className="text-sm font-bold">{Number(d.iso.slice(8))}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 flex items-center gap-2 rounded-bloco bg-suave px-3 py-2.5 text-xs text-texto-suave">
              <span className="size-2 shrink-0 rounded-full bg-realce" aria-hidden="true" />
              {feriadosDaSemana.length
                ? feriadosDaSemana
                    .map((d) => {
                      const dia = diaSemanaLongo.format(new Date(`${d.iso}T12:00:00Z`));
                      return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} (${ddmm(d.iso)}) ${d.iso < hoje ? "foi" : "é"} feriado: ${d.feriado}`;
                    })
                    .join(" · ") + ". Prazos ajustados."
                : "Nenhum feriado nacional nesta semana."}
            </p>
          </section>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {/* Próximos vencimentos */}
          <section
            className="min-w-0 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-6 xl:col-span-2"
            style={{ animationDelay: "420ms" }}
          >
            <CabecalhoCard
              titulo="Próximos vencimentos"
              subtitulo="Tarefas abertas por prazo legal, as atrasadas primeiro"
              href="/tarefas?competencia=todas&status=abertas"
            />
            {proximos.length === 0 ? (
              <Vazio>Nenhuma tarefa em aberto.</Vazio>
            ) : (
              <div className="-mx-6 mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave">
                      <th className="px-6 py-3 font-semibold">OBRIGAÇÃO</th>
                      <th className="px-3 py-3 font-semibold">PRAZO</th>
                      <th className="px-3 py-3 font-semibold">RESPONSÁVEL</th>
                      <th className="px-6 py-3 text-right font-semibold">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proximos.map((t) => {
                      const cliente = t.cliente.fantasia || t.cliente.razao_social;
                      const atrasada = t.prazo_legal < hoje;
                      return (
                        <tr key={t.id} className="border-t border-borda transition-colors hover:bg-fundo">
                          <td className="max-w-[340px] px-6 py-3.5">
                            <span className="block font-semibold text-texto">{t.obrigacao?.nome ?? "Obrigação"}</span>
                            <Link
                              href={`/clientes/${t.cliente.id}`}
                              className="block truncate text-xs text-texto-suave hover:text-destaque hover:underline"
                              title={t.cliente.razao_social}
                            >
                              {cliente} · {t.departamento?.nome}
                            </Link>
                          </td>
                          <td className={`px-3 py-3.5 font-semibold tabular-nums ${atrasada ? "text-perigo" : ""}`}>
                            {ddmm(t.prazo_legal)}
                          </td>
                          <td className="px-3 py-3.5">
                            {t.responsavel ? (
                              <span className="flex items-center gap-2">
                                <Avatar nome={t.responsavel.nome} />
                                {t.responsavel.nome}
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-alerta">Sem responsável</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <StatusTarefaChip status={atrasada ? "atrasada" : t.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Equipe */}
          <section className="min-w-0 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-6" style={{ animationDelay: "480ms" }}>
            <CabecalhoCard titulo="Carga da equipe" subtitulo="Tarefas abertas por pessoa (todas as competências)" />
            {carga.length === 0 ? (
              <Vazio>Ninguém com tarefas em aberto.</Vazio>
            ) : (
              <>
                <ul className="mt-6 flex flex-col gap-4">
                  {carga.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/tarefas?${new URLSearchParams({ competencia: "todas", responsavel: p.id, status: "abertas" })}`}
                        className="flex items-center gap-3"
                      >
                        <Avatar nome={p.nome} grande />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-semibold">
                              {p.id === usuario.id ? "Você" : p.nome}
                              {p.departamento && <span className="font-normal text-texto-suave"> · {p.departamento}</span>}
                            </span>
                            <span className="text-sm font-bold tabular-nums">{p.abertas}</span>
                          </span>
                          <span className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-suave">
                            <span
                              className="h-full bg-primaria"
                              style={{ width: `${((p.abertas - p.atrasadas) / maiorCarga) * 100}%` }}
                            />
                            <span
                              className="h-full bg-perigo-forte"
                              style={{ width: `${(p.atrasadas / maiorCarga) * 100}%` }}
                            />
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 flex items-center gap-4 text-xs text-texto-suave">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-primaria" /> No prazo
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-perigo-forte" /> Atrasadas
                  </span>
                </p>
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

const ddmmAaaa = (competencia: string) => competencia.split("-").reverse().join("/");

function Indicador({
  icone,
  corIcone,
  rotulo,
  valor,
  detalhe,
  href,
  atraso,
}: {
  icone: React.ReactNode;
  corIcone: string;
  rotulo: string;
  valor: number;
  detalhe: string;
  href: string;
  atraso: number;
}) {
  return (
    <Link
      href={href}
      className="group flex animate-surgir flex-col rounded-card bg-superficie p-6 ring-1 ring-borda transition hover:-translate-y-0.5 hover:shadow-elevado hover:ring-areia"
      style={{ animationDelay: `${atraso}ms` }}
    >
      <span className="flex items-center justify-between">
        <span className={`grid size-10 place-items-center rounded-xl ${corIcone}`}>{icone}</span>
        <ArrowUpRight className="size-5 text-texto-suave opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className="mt-5 text-sm font-semibold text-texto-suave">{rotulo}</span>
      <span className="mt-1 text-4xl font-display text-texto">
        <Contador valor={valor} />
      </span>
      <span className="mt-2 text-xs text-texto-suave">{detalhe}</span>
    </Link>
  );
}

function CabecalhoCard({
  titulo,
  subtitulo,
  href,
  rotuloLink = "Ver todas",
}: {
  titulo: string;
  subtitulo: string;
  href?: string;
  rotuloLink?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-texto">{titulo}</h2>
        <p className="text-sm text-texto-suave">{subtitulo}</p>
      </div>
      {href && (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-destaque hover:bg-suave"
        >
          {rotuloLink} <ArrowUpRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 rounded-bloco bg-fundo px-4 py-8 text-center text-sm text-texto-suave">{children}</p>;
}

function Avatar({ nome, grande = false }: { nome: string; grande?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-suave font-bold text-destaque uppercase ${
        grande ? "size-10 text-sm" : "size-7 text-xs"
      }`}
      aria-hidden="true"
    >
      {nome.slice(0, 1)}
    </span>
  );
}

function Carregando() {
  return (
    <>
      <div className="h-16 border-b border-borda" />
      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <div className="h-[86px]" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="brilho h-[188px] rounded-card bg-superficie" />
          ))}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="brilho h-[272px] rounded-card bg-superficie xl:col-span-2" />
          <div className="brilho h-[272px] rounded-card bg-superficie" />
        </div>
      </div>
    </>
  );
}
