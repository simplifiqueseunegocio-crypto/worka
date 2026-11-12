import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, ListChecks, SearchX } from "lucide-react";
import { getUsuario, type Usuario } from "@/lib/auth";
import {
  POR_PAGINA_TAREFAS,
  competenciaPadrao,
  competenciasRecentes,
  hojeISO,
  lerFiltrosTarefas,
  listarDepartamentos,
  listarResponsaveis,
  listarTarefas,
  meusDepartamentos,
  obrigacoesParaTarefa,
  resumoTarefas,
  type FiltrosTarefas,
  type Tarefa,
} from "@/lib/tarefas";
import { AcoesTarefa } from "@/components/tarefas/acoes-tarefa";
import { GerarTarefas, ResponsavelTarefa } from "@/components/tarefas/gestao-tarefas";
import { NovaTarefa } from "@/components/tarefas/nova-tarefa";
import { BarraAssumir, CaixaAssumir, MarcarTodasAssumir, PegarTarefa } from "@/components/tarefas/assumir-tarefas";
import { feriadosNacionais } from "@/lib/obrigacoes";
import { Prazo, competenciaCurta, corDepartamento } from "@/components/tarefas/prazo";
import { Contador } from "@/components/ui/contador";
import { StatusTarefaChip } from "@/components/ui/status-tarefa";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";
import { Filtros } from "./filtros";

export const metadata: Metadata = { title: "Tarefas" };

export default function Tarefas({ searchParams }: PageProps<"/tarefas">) {
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

function hrefTarefas(f: FiltrosTarefas, mudar: Partial<FiltrosTarefas> = {}) {
  const n = { ...f, pagina: 1, ...mudar };
  const p = new URLSearchParams();
  if (n.busca) p.set("busca", n.busca);
  if (n.competencia !== competenciaPadrao()) p.set("competencia", n.competencia);
  if (n.departamento) p.set("departamento", n.departamento);
  if (n.responsavel) p.set("responsavel", n.responsavel);
  if (n.status) p.set("status", n.status);
  if (n.prazo) p.set("prazo", n.prazo);
  if (n.pagina > 1) p.set("pagina", String(n.pagina));
  const qs = p.toString();
  return qs ? `/tarefas?${qs}` : "/tarefas";
}

const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

async function Conteudo({ searchParams }: { searchParams: PageProps<"/tarefas">["searchParams"] }) {
  // A competência padrão depende da data de hoje: calcula na requisição, não no prerender.
  await connection();
  const lidos = lerFiltrosTarefas(await searchParams);
  const [usuario, departamentos, equipe] = await Promise.all([
    getUsuario(),
    listarDepartamentos(),
    listarResponsaveis(),
  ]);
  const departamento = departamentos.find((d) => d.slug === lidos.departamento) ?? null;
  const gera = usuario.papel === "admin" || usuario.papel === "gestor";
  const [r, { tarefas, total, pagina }, meus, obrigacoes, feriados] = await Promise.all([
    resumoTarefas(lidos.competencia, departamentos, departamento?.id ?? null),
    listarTarefas(lidos, departamento?.id ?? null),
    meusDepartamentos(usuario.id),
    gera ? obrigacoesParaTarefa() : [],
    gera ? feriadosNacionais() : [],
  ]);
  const filtros = { ...lidos, pagina };

  const competencias = competenciasRecentes();
  const rotuloCompetencia =
    filtros.competencia === "todas"
      ? "Todas as competências"
      : (competencias.find((c) => c.valor === filtros.competencia)?.rotulo ??
        competenciaCurta(`${filtros.competencia}-01`));
  const gere = (dep: number) => usuario.papel === "admin" || (usuario.papel === "gestor" && meus.includes(dep));
  // "Pegar para mim": aberta, sem responsável e de um departamento seu (mesma regra de assumir_tarefas).
  const pega = (t: Tarefa) =>
    !t.responsavel &&
    ["pendente", "em_andamento", "aguardando_cliente"].includes(t.status) &&
    (gere(t.departamento_id) || meus.includes(t.departamento_id));
  const conclusao = pct(r.concluidas, r.total);
  const semFiltro =
    !filtros.busca && !filtros.departamento && !filtros.responsavel && !filtros.status && !filtros.prazo;

  const cartoes = [
    {
      rotulo: "Atrasadas",
      valor: r.atrasadas,
      detalhe: "Passaram do prazo legal",
      href: hrefTarefas(filtros, { status: "atrasada", prazo: "" }),
      atual: filtros.status === "atrasada",
      cor: r.atrasadas ? "text-perigo" : "",
    },
    {
      rotulo: "Vencem em 7 dias",
      valor: r.semana,
      detalhe: "Abertas com prazo próximo",
      href: hrefTarefas(filtros, { prazo: "7d", status: "" }),
      atual: filtros.prazo === "7d",
      cor: "",
    },
    {
      rotulo: "Aguardando cliente",
      valor: r.aguardando,
      detalhe: "Documentos ou informações",
      href: hrefTarefas(filtros, { status: "aguardando_cliente", prazo: "" }),
      atual: filtros.status === "aguardando_cliente",
      cor: r.aguardando ? "text-alerta" : "",
    },
    {
      rotulo: "Sem responsável",
      valor: r.semResponsavel,
      detalhe: r.semResponsavel ? "Abertas, precisam de alguém" : "Todas distribuídas",
      href: hrefTarefas(filtros, { responsavel: "sem", status: "abertas", prazo: "" }),
      atual: filtros.responsavel === "sem",
      cor: r.semResponsavel ? "text-alerta" : "",
    },
  ];

  return (
    <>
      <div className="entrada flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave uppercase">
            {filtros.competencia === "todas" ? "Todas as competências" : `Competência · ${rotuloCompetencia}`}
          </p>
          <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">
            Tarefas{departamento && <span className="text-destaque"> · {departamento.nome}</span>}
          </h1>
        </div>
        {gera && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <GerarTarefas
              competencia={filtros.competencia}
              rotulo={filtros.competencia === "todas" ? "" : competenciaCurta(`${filtros.competencia}-01`)}
            />
            <NovaTarefa
              obrigacoes={obrigacoes.filter((o) => gere(o.departamento_id))}
              departamentos={departamentos.filter((d) => gere(d.id)).map(({ id, nome, cor }) => ({ id, nome, cor }))}
              equipe={equipe}
              feriados={feriados}
              competencia={filtros.competencia === "todas" ? competenciaPadrao() : filtros.competencia}
            />
          </div>
        )}
      </div>

      {r.total === 0 && semFiltro && filtros.competencia !== "todas" ? (
        <CompetenciaVazia rotulo={rotuloCompetencia} gestor={gera} />
      ) : (
        <>
          <section aria-label="Resumo" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Link
              href={hrefTarefas(filtros, { status: "", prazo: "", responsavel: "" })}
              className="relative col-span-2 animate-surgir overflow-hidden rounded-card bg-escuro p-5 text-white transition hover:-translate-y-0.5 hover:shadow-elevado sm:col-span-1"
            >
              <span className="block text-sm font-semibold text-texto-inverso-suave">Conclusão</span>
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
                {r.concluidas.toLocaleString("pt-BR")} de {r.total.toLocaleString("pt-BR")} tarefas
              </span>
            </Link>
            {cartoes.map((c, i) => (
              <Link
                key={c.rotulo}
                href={c.href}
                aria-current={c.atual ? "page" : undefined}
                className={`animate-surgir rounded-card bg-superficie ring-1 ring-borda p-5 ring-offset-2 ring-offset-fundo transition hover:-translate-y-0.5 hover:shadow-elevado ${
                  c.atual ? "ring-2 ring-primaria" : ""
                }`}
                style={{ animationDelay: `${(i + 1) * 50}ms` }}
              >
                <span className="block text-sm font-semibold text-texto-suave">{c.rotulo}</span>
                <span
                  className={`mt-2 block text-3xl font-display tabular-nums ${c.cor || "text-texto"}`}
                >
                  <Contador valor={c.valor} />
                </span>
                <span className="mt-1 block text-xs text-texto-suave">{c.detalhe}</span>
              </Link>
            ))}
          </section>

          <section
            aria-label="Progresso por departamento"
            className="mt-4 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-2"
            style={{ animationDelay: "250ms" }}
          >
            <ul className="grid gap-1 sm:grid-cols-3 xl:grid-cols-5">
              {r.departamentos.map((d) => {
                const p = pct(d.concluidas, d.total);
                const atual = d.slug === filtros.departamento;
                return (
                  <li key={d.slug}>
                    <Link
                      href={hrefTarefas(filtros, { departamento: atual ? "" : d.slug })}
                      aria-current={atual ? "page" : undefined}
                      className={`flex flex-col gap-2 rounded-bloco px-4 py-3 transition-colors ${
                        atual ? "bg-suave" : "hover:bg-fundo"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 font-semibold text-texto">
                          <span className="size-2.5 rounded-full" style={{ background: d.cor }} aria-hidden="true" />
                          {d.nome}
                        </span>
                        <span className="text-texto-suave tabular-nums">
                          <strong className="font-bold text-texto">{p}%</strong> · {d.concluidas}/{d.total}
                        </span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-suave">
                        <span
                          className="block h-full origin-left animate-crescer rounded-full"
                          style={{ width: `${p}%`, background: d.cor }}
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <Lista
            filtros={filtros}
            tarefas={tarefas}
            total={total}
            usuario={usuario}
            gere={gere}
            pega={pega}
            equipe={equipe}
            filtrosProps={{
              padrao: competenciaPadrao(),
              competencias,
              departamentos: departamentos.map(({ slug, nome }) => ({ slug, nome })),
              equipe,
            }}
          />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Lista

function Lista({
  filtros,
  tarefas,
  total,
  usuario,
  gere,
  pega,
  equipe,
  filtrosProps,
}: {
  filtros: FiltrosTarefas;
  tarefas: Tarefa[];
  total: number;
  usuario: Usuario;
  gere: (dep: number) => boolean;
  pega: (t: Tarefa) => boolean;
  equipe: { id: string; nome: string }[];
  filtrosProps: Omit<React.ComponentProps<typeof Filtros>, "filtros">;
}) {
  const hoje = hojeISO();
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_TAREFAS));
  const de = total ? (filtros.pagina - 1) * POR_PAGINA_TAREFAS + 1 : 0;
  const ate = Math.min(filtros.pagina * POR_PAGINA_TAREFAS, total);
  const todas = filtros.competencia === "todas";
  const algumaParaPegar = tarefas.some(pega);

  return (
    <section className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6">
      <Filtros key={JSON.stringify(filtros)} filtros={filtros} {...filtrosProps} />

      <p className="mt-5 flex flex-wrap items-center gap-2 text-sm text-texto-suave" aria-live="polite">
        {total ? (
          <span>
            Mostrando{" "}
            <strong className="text-texto">
              {de}–{ate}
            </strong>{" "}
            de <strong className="text-texto">{total.toLocaleString("pt-BR")}</strong> tarefas · por prazo legal
          </span>
        ) : (
          "Nenhuma tarefa encontrada"
        )}
        {filtros.prazo === "7d" && (
          <Link
            href={hrefTarefas(filtros, { prazo: "" })}
            className="rounded-full bg-suave px-3 py-1 text-xs font-semibold text-texto hover:bg-borda"
          >
            Vencem em 7 dias ×
          </Link>
        )}
      </p>

      {tarefas.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-bloco bg-fundo px-6 py-14 text-center">
          <SearchX className="size-8 text-texto-suave" strokeWidth={1.6} />
          <p className="font-semibold text-texto">Nenhuma tarefa com esses filtros.</p>
          <Link
            href={hrefTarefas(filtros, { busca: "", departamento: "", responsavel: "", status: "", prazo: "" })}
            className="text-sm font-semibold text-destaque hover:underline"
          >
            Ver todas as tarefas da competência
          </Link>
        </div>
      ) : (
        <>
          {algumaParaPegar && <BarraAssumir />}
          <div className="-mx-4 mt-3 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave">
                  {algumaParaPegar && (
                    <th className="w-10 py-3 pr-0 pl-4 sm:pl-6">
                      <MarcarTodasAssumir />
                    </th>
                  )}
                  <th className={`py-3 font-semibold ${algumaParaPegar ? "px-3" : "px-4 sm:px-6"}`}>OBRIGAÇÃO</th>
                  {todas && <th className="px-3 py-3 font-semibold">COMPETÊNCIA</th>}
                  <th className="px-3 py-3 font-semibold">PRAZO</th>
                  <th className="px-3 py-3 font-semibold">RESPONSÁVEL</th>
                  <th className="px-3 py-3 font-semibold">STATUS</th>
                  <th className="px-4 py-3 text-right font-semibold sm:px-6">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tarefas.map((t, i) => {
                  const nome = t.obrigacao?.nome ?? "Obrigação";
                  const cliente = t.cliente.fantasia || t.cliente.razao_social;
                  const gestor = gere(t.departamento_id);
                  const minha = t.responsavel?.id === usuario.id;
                  return (
                    <tr
                      key={t.id}
                      className="animate-surgir border-t border-borda align-top transition-colors hover:bg-fundo"
                      style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    >
                      {algumaParaPegar && (
                        <td className="py-3.5 pr-0 pl-4 sm:pl-6">
                          {pega(t) && <CaixaAssumir tarefaId={t.id} rotulo={`${nome}, ${cliente}`} />}
                        </td>
                      )}
                      <td className={`max-w-[380px] py-3.5 ${algumaParaPegar ? "px-3" : "px-4 sm:px-6"}`}>
                        <span className="flex items-start gap-2.5">
                          <span
                            className="mt-1.5 size-2.5 shrink-0 rounded-full"
                            style={{ background: corDepartamento(t.departamento?.nome) }}
                            title={t.departamento?.nome}
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-texto">{nome}</span>
                            <Link
                              href={`/clientes/${t.cliente.id}`}
                              className="block truncate text-xs text-texto-suave hover:text-destaque hover:underline"
                              title={t.cliente.razao_social}
                            >
                              {t.cliente.codigo_dominio !== null && <>{t.cliente.codigo_dominio} · </>}
                              {cliente}
                            </Link>
                            <span className="block text-xs text-texto-suave/80">{t.departamento?.nome}</span>
                          </span>
                        </span>
                      </td>
                      {todas && (
                        <td className="px-3 py-3.5 font-medium whitespace-nowrap tabular-nums">
                          {competenciaCurta(t.competencia)}
                        </td>
                      )}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <Prazo tarefa={t} hoje={hoje} />
                      </td>
                      <td className="px-3 py-3">
                        {gestor ? (
                          <ResponsavelTarefa
                            tarefaId={t.id}
                            atual={t.responsavel?.id ?? null}
                            equipe={equipe}
                            rotulo={`${nome}, ${cliente}`}
                          />
                        ) : t.responsavel ? (
                          <span className="flex items-center gap-2 pt-1">
                            <Avatar nome={t.responsavel.nome} />
                            <span className={minha ? "font-semibold text-texto" : ""}>
                              {minha ? "Você" : t.responsavel.nome}
                            </span>
                          </span>
                        ) : pega(t) ? (
                          <PegarTarefa tarefaId={t.id} />
                        ) : (
                          <span className="block pt-1.5 text-xs font-semibold text-alerta">Sem responsável</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <StatusTarefaChip status={t.status} />
                        {t.status === "dispensada" && t.observacao && (
                          <span className="mt-1.5 block max-w-[220px] text-xs text-texto-suave" title={t.observacao}>
                            {t.observacao}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right sm:px-6">
                        {gestor || minha ? (
                          <AcoesTarefa tarefaId={t.id} status={t.status} rotulo={`${nome}, ${cliente}`} />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {paginas > 1 && <Paginacao filtros={filtros} paginas={paginas} />}
    </section>
  );
}

function Avatar({ nome }: { nome: string }) {
  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-full bg-suave text-xs font-bold text-destaque uppercase"
      aria-hidden="true"
    >
      {nome.slice(0, 1)}
    </span>
  );
}

function Paginacao({ filtros, paginas }: { filtros: FiltrosTarefas; paginas: number }) {
  const atual = Math.min(filtros.pagina, paginas);
  const botao =
    "flex h-10 items-center gap-1 rounded-full border border-borda px-4 text-sm font-semibold text-texto hover:bg-suave";
  const inativo = "flex h-10 items-center gap-1 rounded-full px-4 text-sm font-semibold text-texto-suave/50";

  return (
    <nav aria-label="Paginação" className="mt-5 flex items-center justify-between gap-3 border-t border-borda pt-5">
      {atual > 1 ? (
        <Link href={hrefTarefas(filtros, { pagina: atual - 1 })} className={botao}>
          <ChevronLeft className="size-4" /> Anterior
        </Link>
      ) : (
        <span className={inativo} aria-hidden="true">
          <ChevronLeft className="size-4" /> Anterior
        </span>
      )}
      <span className="text-sm text-texto-suave">
        Página <strong className="text-texto">{atual}</strong> de {paginas}
      </span>
      {atual < paginas ? (
        <Link href={hrefTarefas(filtros, { pagina: atual + 1 })} className={botao}>
          Próxima <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={inativo} aria-hidden="true">
          Próxima <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Estados vazio e carregando

function CompetenciaVazia({ rotulo, gestor }: { rotulo: string; gestor: boolean }) {
  return (
    <section className="mt-8 flex flex-col items-start gap-3 rounded-card bg-superficie ring-1 ring-borda p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-xl bg-suave text-destaque">
        <ListChecks className="size-6" strokeWidth={1.8} />
      </span>
      <h2 className="text-lg font-bold text-texto">Nenhuma tarefa em {rotulo.toLowerCase()}</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-texto-suave">
        As tarefas são geradas automaticamente todo dia 1º para a competência anterior, cruzando os clientes ativos com
        as obrigações do regime de cada um. Cada tarefa fica com o responsável do cliente no departamento; clientes sem
        responsável definido geram tarefas “sem responsável”, que o gestor distribui aqui.
      </p>
      <p className="text-sm font-semibold text-texto-suave">
        {gestor
          ? "Para não esperar o dia 1º, use “Gerar tarefas” acima."
          : "Peça a um gestor ou administrador para gerar a competência."}
      </p>
    </section>
  );
}

function Carregando() {
  return (
    <>
      <div className="h-[86px]" />
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="brilho h-[124px] rounded-card bg-superficie" />
        ))}
      </div>
      <div className="brilho mt-4 h-[72px] rounded-card bg-superficie" />
      <div className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-6">
        <div className="brilho h-11 rounded-full bg-suave" />
        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="brilho h-16 rounded-bloco bg-fundo" />
          ))}
        </div>
      </div>
    </>
  );
}
