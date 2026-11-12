import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, SearchX } from "lucide-react";
import {
  POR_PAGINA,
  lerFiltros,
  listarClientes,
  resumoClientes,
  type FiltrosClientes,
  type Regime,
  type StatusCliente,
} from "@/lib/clientes";
import { formatarCnae, formatarDocumento, formatarMunicipio, rotuloDocumento } from "@/lib/formatar";
import { BarraSelecaoCnd, FORM_SELECAO_CND, MarcarTodosCnd } from "@/components/cnd/selecao-cnd";
import { Contador } from "@/components/ui/contador";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";
import { Filtros } from "./filtros";

export const metadata: Metadata = { title: "Clientes" };

export default function Clientes({ searchParams }: PageProps<"/clientes">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <div className="entrada flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">CARTEIRA</p>
            <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Clientes</h1>
          </div>
          <p className="flex items-center gap-2 rounded-full bg-superficie px-4 py-2 text-xs font-medium text-texto-suave ring-1 ring-borda">
            <RefreshCw className="size-3.5" />
            Sincronizado com o ERP Domínio
          </p>
        </div>

        <Suspense
          fallback={
            <Esqueleto>
              <ResumoCarregando />
            </Esqueleto>
          }
        >
          <Revelar>
            <Resumo />
          </Revelar>
        </Suspense>

        <Suspense
          fallback={
            <Esqueleto>
              <ListaCarregando />
            </Esqueleto>
          }
        >
          <Revelar>
            <Lista searchParams={searchParams} />
          </Revelar>
        </Suspense>
      </main>
    </TransicaoPagina>
  );
}

// ---------------------------------------------------------------------------
// Resumo por regime

async function Resumo() {
  const r = await resumoClientes();
  const cartoes = [
    { rotulo: "Clientes ativos", valor: r.ativos, href: "/clientes", destaque: true },
    { rotulo: "Simples Nacional", valor: r.simples, href: "/clientes?regime=simples" },
    { rotulo: "Lucro Presumido", valor: r.presumido, href: "/clientes?regime=presumido" },
    { rotulo: "Lucro Real", valor: r.real, href: "/clientes?regime=real" },
    { rotulo: "Sem regime", valor: r.semRegime, href: "/clientes?regime=sem", alerta: r.semRegime > 0 },
  ];

  return (
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
              c.destaque ? "text-white" : c.alerta ? "text-alerta" : "text-texto"
            }`}
          >
            <Contador valor={c.valor} />
          </span>
          {c.alerta && <span className="mt-1 block text-xs text-texto-suave">Defina para gerar as obrigações</span>}
        </Link>
      ))}
    </section>
  );
}

function ResumoCarregando() {
  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="brilho h-[104px] rounded-card bg-superficie" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lista

const regimes: Record<Regime, { rotulo: string; classe: string }> = {
  simples: { rotulo: "Simples", classe: "bg-info-suave text-info" },
  presumido: { rotulo: "Presumido", classe: "bg-alerta-suave text-alerta" },
  real: { rotulo: "Real", classe: "bg-info-suave text-info" },
  mei: { rotulo: "MEI", classe: "bg-sucesso-suave text-sucesso" },
};

const situacoes: Record<StatusCliente, { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: "text-sucesso" },
  suspenso: { rotulo: "Suspenso", classe: "text-alerta" },
  encerrado: { rotulo: "Encerrado", classe: "text-texto-suave" },
};

async function Lista({ searchParams }: { searchParams: PageProps<"/clientes">["searchParams"] }) {
  const filtros = lerFiltros(await searchParams);
  const { clientes, total } = await listarClientes(filtros);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const de = total ? (filtros.pagina - 1) * POR_PAGINA + 1 : 0;
  const ate = Math.min(filtros.pagina * POR_PAGINA, total);

  return (
    <section className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6">
      <Filtros key={JSON.stringify(filtros)} filtros={filtros} />

      <p className="mt-5 text-sm text-texto-suave" aria-live="polite">
        {total ? (
          <>
            Mostrando <strong className="text-texto">{de}–{ate}</strong> de{" "}
            <strong className="text-texto">{total.toLocaleString("pt-BR")}</strong> clientes
          </>
        ) : (
          "Nenhum cliente encontrado"
        )}
      </p>

      {clientes.length > 0 && <BarraSelecaoCnd />}

      {clientes.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-bloco bg-fundo px-6 py-14 text-center">
          <SearchX className="size-8 text-texto-suave" strokeWidth={1.6} />
          <p className="font-semibold text-texto">Nenhum cliente com esses filtros.</p>
          <Link href="/clientes" className="text-sm font-semibold text-destaque hover:underline">
            Ver todos os clientes ativos
          </Link>
        </div>
      ) : (
        <div className="-mx-4 mt-3 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave">
                <th className="w-10 py-3 pl-4 sm:pl-6">
                  <MarcarTodosCnd />
                </th>
                <th className="px-3 py-3 font-semibold">CLIENTE</th>
                <th className="px-3 py-3 font-semibold">DOCUMENTO</th>
                <th className="px-3 py-3 font-semibold">REGIME</th>
                <th className="px-3 py-3 font-semibold">ATIVIDADE</th>
                <th className="px-3 py-3 font-semibold">MUNICÍPIO</th>
                <th className="px-4 py-3 text-right font-semibold sm:px-6">SITUAÇÃO</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c, i) => (
                <tr
                  key={c.id}
                  className="animate-surgir border-t border-borda transition-colors hover:bg-fundo"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <td className="w-10 py-3.5 pl-4 sm:pl-6">
                    <input
                      type="checkbox"
                      name="cliente"
                      value={c.id}
                      form={FORM_SELECAO_CND}
                      disabled={c.status !== "ativo"}
                      aria-label={`Selecionar ${c.razao_social}`}
                      className="size-4 cursor-pointer accent-primaria disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </td>
                  <td className="max-w-[340px] px-3 py-3.5">
                    <Link
                      href={`/clientes/${c.id}`}
                      className="block truncate font-semibold text-texto hover:text-destaque hover:underline"
                      title={c.razao_social}
                    >
                      {c.razao_social}
                    </Link>
                    <span className="block truncate text-xs text-texto-suave">
                      {c.codigo_dominio !== null && <>Cód. {c.codigo_dominio}</>}
                      {c.fantasia && c.fantasia !== c.razao_social && <> · {c.fantasia}</>}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap">
                    <span className="block text-[11px] font-semibold tracking-wider text-texto-suave">
                      {rotuloDocumento(c.documento, c.tipo_inscricao)}
                    </span>
                    <span className="font-medium tabular-nums">{formatarDocumento(c.documento, c.tipo_inscricao)}</span>
                  </td>
                  <td className="px-3 py-3.5">
                    {c.regime ? (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${regimes[c.regime].classe}`}>
                        {regimes[c.regime].rotulo}
                      </span>
                    ) : (
                      <span className="rounded-full border border-dashed border-alerta-borda px-2.5 py-1 text-xs font-semibold text-alerta">
                        Definir
                      </span>
                    )}
                  </td>
                  <td className="max-w-[260px] px-3 py-3.5">
                    <span className="block truncate" title={c.ramo_atividade ?? undefined}>
                      {c.ramo_atividade ?? "—"}
                    </span>
                    {c.cnae && <span className="block text-xs text-texto-suave tabular-nums">CNAE {formatarCnae(c.cnae)}</span>}
                  </td>
                  <td className="px-3 py-3.5 font-medium">{formatarMunicipio(c.municipio, c.uf) ?? "—"}</td>
                  <td className="px-4 py-3.5 text-right sm:px-6">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${situacoes[c.status].classe}`}>
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {situacoes[c.status].rotulo}
                    </span>
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

function hrefPagina(f: FiltrosClientes, pagina: number) {
  const p = new URLSearchParams();
  if (f.busca) p.set("busca", f.busca);
  if (f.regime) p.set("regime", f.regime);
  if (f.status !== "ativo") p.set("status", f.status);
  if (pagina > 1) p.set("pagina", String(pagina));
  const qs = p.toString();
  return qs ? `/clientes?${qs}` : "/clientes";
}

function Paginacao({ filtros, paginas }: { filtros: FiltrosClientes; paginas: number }) {
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

function ListaCarregando() {
  return (
    <div className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-6">
      <div className="brilho h-11 rounded-full bg-suave" />
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="brilho h-12 rounded-bloco bg-fundo" />
        ))}
      </div>
    </div>
  );
}
