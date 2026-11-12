import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Database, Power, SearchX } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import {
  CndIndisponivel,
  ORDENACOES_CND,
  POR_PAGINA_CND,
  TIPOS_CND,
  lerFiltrosCnd,
  listarCnd,
  proximaRodada,
  resumoCnd,
  type FiltrosCnd as Filtros,
} from "@/lib/cnd";
import { formatarDocumento, formatarMunicipio } from "@/lib/formatar";
import { LigarCarteira } from "@/components/cnd/acoes-cnd";
import { BarraSelecaoCnd, FORM_SELECAO_CND, MarcarTodosCnd } from "@/components/cnd/selecao-cnd";
import { SituacaoClienteChip, StatusCndIcone } from "@/components/cnd/situacao-cnd";
import { Contador } from "@/components/ui/contador";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";
import { FiltrosCnd } from "./filtros";

export const metadata: Metadata = { title: "Certidões" };

export default function Certidoes({ searchParams }: PageProps<"/cnd">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <div className="entrada flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">REGULARIDADE FISCAL</p>
            <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Certidões (CND)</h1>
          </div>
          <p className="flex items-center gap-2 rounded-full bg-superficie px-4 py-2 text-xs font-medium text-texto-suave ring-1 ring-borda">
            <CalendarClock className="size-3.5" />
            Consulta automática todo dia 23
          </p>
        </div>

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

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

async function Conteudo({ searchParams }: { searchParams: PageProps<"/cnd">["searchParams"] }) {
  const filtros = lerFiltrosCnd(await searchParams);
  let dados;
  try {
    dados = await Promise.all([resumoCnd(), listarCnd(filtros), getUsuario()]);
  } catch (e) {
    if (e instanceof CndIndisponivel) return <MigracaoPendente />;
    throw e;
  }
  const [r, { linhas, total }, usuario] = dados;
  const gestor = usuario.papel === "admin" || usuario.papel === "gestor";

  const cartoes = [
    { rotulo: "Clientes monitorados", valor: r.monitorados, href: "/cnd", destaque: true },
    { rotulo: "Com pendência", valor: r.pendente, href: "/cnd?situacao=pendente", cor: "text-perigo" },
    { rotulo: "Regulares", valor: r.regular, href: "/cnd?situacao=regular", cor: "text-sucesso" },
    { rotulo: "Erro na consulta", valor: r.erro, href: "/cnd?situacao=erro", cor: r.erro ? "text-alerta" : "" },
    { rotulo: "Não consultados", valor: r.semConsulta, href: "/cnd?situacao=sem_consulta" },
  ];

  return (
    <>
      <section aria-label="Resumo" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {cartoes.map((c, i) => (
          <Link
            key={c.rotulo}
            href={c.href}
            className={`animate-surgir rounded-card p-5 transition hover:-translate-y-0.5 hover:shadow-elevado ${
              c.destaque ? "col-span-2 bg-escuro text-white sm:col-span-1" : "bg-superficie"
            }`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className={`block text-sm font-semibold ${c.destaque ? "text-texto-inverso-suave" : "text-texto-suave"}`}>
              {c.rotulo}
            </span>
            <span
              className={`mt-2 block text-3xl font-display tabular-nums ${
                c.destaque ? "text-white" : c.cor || "text-texto"
              }`}
            >
              <Contador valor={c.valor} />
            </span>
          </Link>
        ))}
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-superficie px-4 py-3 sm:px-6">
        <p className="text-sm text-texto-suave">
          {r.naFila > 0 ? (
            <>
              <strong className="text-texto">{r.naFila.toLocaleString("pt-BR")}</strong> consultas na fila · estadual e municipal em até 10 minutos; federal e FGTS nos dias úteis às 9h, 13h e 16h
            </>
          ) : r.ultimaConsulta ? (
            <>Última consulta em {dataHora.format(new Date(r.ultimaConsulta))}</>
          ) : (
            "Nenhuma consulta feita ainda"
          )}
          <span className="text-texto-suave/80"> · próxima rodada automática em {proximaRodada()}</span>
        </p>
      </div>

      {r.monitorados === 0 && !filtros.busca && !filtros.situacao ? (
        <section className="mt-4 flex flex-col items-start gap-3 rounded-card bg-superficie ring-1 ring-borda p-6 sm:p-8">
          <h2 className="text-lg font-bold text-texto">Nenhum cliente com busca de CND ligada</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-texto-suave">
            A busca é ligada cliente a cliente, na página de cada cliente. Para começar, você pode ligar para toda a
            carteira ativa e depois desligar as exceções.
          </p>
          {gestor ? (
            <LigarCarteira icone={<Power className="size-4" />} />
          ) : (
            <p className="text-sm font-semibold text-texto-suave">Peça a um gestor ou administrador para ligar a busca.</p>
          )}
        </section>
      ) : (
        <Lista filtros={filtros} linhas={linhas} total={total} />
      )}
    </>
  );
}

function Lista({
  filtros,
  linhas,
  total,
}: {
  filtros: Filtros;
  linhas: Awaited<ReturnType<typeof listarCnd>>["linhas"];
  total: number;
}) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_CND));
  const de = total ? (filtros.pagina - 1) * POR_PAGINA_CND + 1 : 0;
  const ate = Math.min(filtros.pagina * POR_PAGINA_CND, total);

  return (
    <section className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6">
      <FiltrosCnd key={JSON.stringify(filtros)} filtros={filtros} ordenacoes={ORDENACOES_CND} />

      {linhas.length > 0 && <BarraSelecaoCnd />}

      <p className="mt-5 text-sm text-texto-suave" aria-live="polite">
        {total ? (
          <>
            Mostrando <strong className="text-texto">{de}–{ate}</strong> de{" "}
            <strong className="text-texto">{total.toLocaleString("pt-BR")}</strong> clientes ·{" "}
            {ORDENACOES_CND.find((o) => o.ordem === filtros.ordem)!.rotulo.toLowerCase()}
          </>
        ) : (
          "Nenhum cliente encontrado"
        )}
      </p>

      {linhas.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-bloco bg-fundo px-6 py-14 text-center">
          <SearchX className="size-8 text-texto-suave" strokeWidth={1.6} />
          <p className="font-semibold text-texto">Nenhum cliente com esses filtros.</p>
          <Link href="/cnd" className="text-sm font-semibold text-destaque hover:underline">
            Ver todos os monitorados
          </Link>
        </div>
      ) : (
        <div className="-mx-4 mt-3 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave">
                <th className="w-10 py-3 pl-4 sm:pl-6">
                  <MarcarTodosCnd />
                </th>
                <th className="px-3 py-3 font-semibold">CLIENTE</th>
                {TIPOS_CND.map((t) => (
                  <th key={t.tipo} className="px-2 py-3 text-center font-semibold" title={t.descricao}>
                    {t.rotulo.toUpperCase()}
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold">CONSULTA</th>
                <th className="px-4 py-3 text-right font-semibold sm:px-6">SITUAÇÃO</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c, i) => (
                <tr
                  key={c.cliente_id}
                  className="animate-surgir border-t border-borda transition-colors hover:bg-fundo"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <td className="w-10 py-3.5 pl-4 sm:pl-6">
                    <input
                      type="checkbox"
                      name="cliente"
                      value={c.cliente_id}
                      form={FORM_SELECAO_CND}
                      aria-label={`Selecionar ${c.razao_social}`}
                      className="size-4 cursor-pointer accent-primaria"
                    />
                  </td>
                  <td className="max-w-[340px] px-3 py-3.5">
                    <Link
                      href={`/clientes/${c.cliente_id}`}
                      className="block truncate font-semibold text-texto hover:text-destaque hover:underline"
                      title={c.razao_social}
                    >
                      {c.razao_social}
                    </Link>
                    <span className="block truncate text-xs text-texto-suave tabular-nums">
                      {formatarDocumento(c.documento, c.tipo_inscricao)}
                      {(c.municipio || c.uf) && <> · {formatarMunicipio(c.municipio, c.uf)}</>}
                      {c.codigo_dominio !== null && <> · Cód. {c.codigo_dominio}</>}
                    </span>
                  </td>
                  {TIPOS_CND.map((t) => (
                    <td key={t.tipo} className="px-2 py-3.5 text-center">
                      <StatusCndIcone status={c[t.tipo]} mensagem={c.mensagens?.[t.tipo]} />
                    </td>
                  ))}
                  <td className="px-3 py-3.5 text-xs whitespace-nowrap text-texto-suave tabular-nums">
                    {c.na_fila ? (
                      <span className="font-semibold text-destaque">Na fila</span>
                    ) : c.consultado_em ? (
                      dataHora.format(new Date(c.consultado_em))
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right sm:px-6">
                    <SituacaoClienteChip situacao={c.situacao} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && <Paginacao filtros={filtros} paginas={paginas} />}
    </section>
  );
}

function hrefPagina(f: Filtros, pagina: number) {
  const p = new URLSearchParams();
  if (f.busca) p.set("busca", f.busca);
  if (f.situacao) p.set("situacao", f.situacao);
  if (f.ordem) p.set("ordem", f.ordem);
  if (pagina > 1) p.set("pagina", String(pagina));
  const qs = p.toString();
  return qs ? `/cnd?${qs}` : "/cnd";
}

function Paginacao({ filtros, paginas }: { filtros: Filtros; paginas: number }) {
  const atual = Math.min(filtros.pagina, paginas);
  const botao =
    "flex h-10 items-center gap-1 rounded-full border border-borda px-4 text-sm font-semibold text-texto hover:bg-suave";
  const inativo = "flex h-10 items-center gap-1 rounded-full px-4 text-sm font-semibold text-texto-suave/50";

  return (
    <nav aria-label="Paginação" className="mt-5 flex items-center justify-between gap-3 border-t border-borda pt-5">
      {atual > 1 ? (
        <Link href={hrefPagina(filtros, atual - 1)} className={botao}>
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
        <Link href={hrefPagina(filtros, atual + 1)} className={botao}>
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

function MigracaoPendente() {
  return (
    <section className="mt-8 flex flex-col items-start gap-3 rounded-card bg-superficie ring-1 ring-borda p-6 sm:p-8">
      <span className="grid size-11 place-items-center rounded-xl bg-alerta-suave text-alerta">
        <Database className="size-5" />
      </span>
      <h2 className="text-lg font-bold text-texto">Banco ainda sem o módulo de CND</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-texto-suave">
        Aplique as migrations <code className="rounded bg-suave px-1.5 py-0.5">20261019000000_cnd.sql</code> e{" "}
        <code className="rounded bg-suave px-1.5 py-0.5">20261019000100_cron_cnd.sql</code> no Supabase (SQL Editor ou{" "}
        <code className="rounded bg-suave px-1.5 py-0.5">supabase db push</code>) e recarregue a página.
      </p>
    </section>
  );
}

function Carregando() {
  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="brilho h-[104px] rounded-card bg-superficie" />
        ))}
      </div>
      <div className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-6">
        <div className="brilho h-11 rounded-full bg-suave" />
        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="brilho h-12 rounded-bloco bg-fundo" />
          ))}
        </div>
      </div>
    </>
  );
}
