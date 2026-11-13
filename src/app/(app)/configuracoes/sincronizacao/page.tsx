import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Clock, Database, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";
import {
  FUSO,
  LogIndisponivel,
  POR_PAGINA_LOG,
  diaBrasilia,
  listarExecucoes,
  nomesPorCodigo,
  resumoDias,
  type DiaLog,
  type ExecucaoLog,
  type ItemLog,
  type StatusExecucao,
} from "@/lib/log-sincronizacao";

export const metadata: Metadata = { title: "Log de sincronização" };

export default function LogSincronizacao({ searchParams }: PageProps<"/configuracoes/sincronizacao">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto"
        >
          <ArrowLeft className="size-4" /> Configurações
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">INTEGRAÇÃO CONTA AZUL</p>
            <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Log de sincronização</h1>
          </div>
          <p className="flex items-center gap-2 rounded-full bg-superficie px-4 py-2 text-xs font-medium text-texto-suave ring-1 ring-borda">
            <Clock className="size-3.5" /> Rotina diária às 23:00 (Brasília)
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

const estilos: Record<StatusExecucao, { rotulo: string; chip: string; quadro: string }> = {
  sucesso: { rotulo: "Sucesso", chip: "bg-sucesso-suave text-sucesso", quadro: "bg-sucesso-ponto text-white" },
  recusado: { rotulo: "Recusado", chip: "bg-alerta-suave text-alerta", quadro: "bg-alerta-ponto text-texto" },
  erro: { rotulo: "Erro", chip: "bg-perigo-suave text-perigo", quadro: "bg-perigo-forte text-white" },
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" });

function duracao(ms: number | null) {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

function horasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

const STATUS = ["sucesso", "recusado", "erro"] as const;

async function Conteudo({ searchParams }: { searchParams: PageProps<"/configuracoes/sincronizacao">["searchParams"] }) {
  const usuario = await getUsuario();
  if (!usuario.ativo || usuario.papel === "colaborador") {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-6 text-sm text-texto-suave">
        <Lock className="size-5 shrink-0 text-destaque" />
        O log de sincronização é visível só para administradores e gestores.
      </div>
    );
  }

  const params = await searchParams;
  const status = STATUS.find((s) => s === params.status);
  const pagina = Math.max(1, Number.parseInt(String(params.pagina ?? "1"), 10) || 1);

  let dados;
  try {
    dados = await Promise.all([
      resumoDias(14),
      listarExecucoes(pagina, status),
      listarExecucoes(1).then((r) => r.execucoes[0] ?? null),
    ]);
  } catch (e) {
    if (e instanceof LogIndisponivel) return <MigracaoPendente />;
    throw e;
  }
  const [dias, { execucoes, total }, ultima] = dados;

  const codigos = execucoes
    .flatMap((e) => [
      ...(e.detalhes?.inseridos ?? []),
      ...(e.detalhes?.reativados ?? []),
      ...(e.detalhes?.suspensos ?? []),
      ...(e.detalhes?.regimes ?? []).map((r) => r.codigo),
    ])
    .filter((c): c is number => typeof c === "number");
  const nomes = await nomesPorCodigo(codigos);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_LOG));

  return (
    <>
      <div className="entrada mt-8 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <UltimosDias dias={dias} />
        <UltimaExecucao execucao={ultima} />
      </div>

      <section className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-texto">Histórico</h2>
          <nav aria-label="Filtrar por resultado" className="flex flex-wrap gap-2">
            {[undefined, ...STATUS].map((s) => {
              const ativo = s === status;
              return (
                <Link
                  key={s ?? "todas"}
                  href={s ? `/configuracoes/sincronizacao?status=${s}` : "/configuracoes/sincronizacao"}
                  aria-current={ativo ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    ativo ? "bg-primaria text-sobre-primaria" : "bg-suave text-texto hover:bg-borda"
                  }`}
                >
                  {s ? estilos[s].rotulo : "Todas"}
                </Link>
              );
            })}
          </nav>
        </div>

        {execucoes.length === 0 ? (
          <p className="mt-6 rounded-bloco bg-fundo px-6 py-12 text-center text-sm text-texto-suave">
            {status
              ? "Nenhuma execução com esse resultado."
              : "Nenhuma sincronização registrada ainda. A primeira aparece depois da rotina das 23:00 ou de um “Sincronizar agora” em Configurações → Conta Azul."}
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-2">
            {execucoes.map((e) => (
              <ItemExecucao key={e.id} execucao={e} nomes={nomes} />
            ))}
          </ul>
        )}

        {paginas > 1 && (
          <nav aria-label="Paginação" className="mt-5 flex items-center justify-between border-t border-borda pt-5">
            <LinkPagina pagina={pagina - 1} status={status} desativado={pagina <= 1}>
              <ChevronLeft className="size-4" /> Mais recentes
            </LinkPagina>
            <span className="text-sm text-texto-suave">
              Página <strong className="text-texto">{pagina}</strong> de {paginas}
            </span>
            <LinkPagina pagina={pagina + 1} status={status} desativado={pagina >= paginas}>
              Mais antigas <ChevronRight className="size-4" />
            </LinkPagina>
          </nav>
        )}
      </section>
    </>
  );
}

function MigracaoPendente() {
  return (
    <div className="mt-8 flex items-start gap-4 rounded-card bg-superficie ring-1 ring-borda p-6">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-alerta-suave text-alerta">
        <Database className="size-5" />
      </span>
      <div className="text-sm text-texto-suave">
        <p className="text-base font-bold text-texto">O banco ainda não tem a tabela do log.</p>
        <p className="mt-1">
          Aplique no Supabase (SQL Editor) a migration{" "}
          <code className="rounded bg-suave px-1.5 py-0.5 text-texto">supabase/migrations/20261016000000_log_sincronizacao.sql</code>.
          Depois disso, cada sincronização com a Conta Azul passa a aparecer aqui.
        </p>
      </div>
    </div>
  );
}

function UltimosDias({ dias }: { dias: DiaLog[] }) {
  const hoje = diaBrasilia(new Date());
  return (
    <section className="rounded-card bg-superficie ring-1 ring-borda p-6">
      <h2 className="text-lg font-bold text-texto">Últimos 14 dias</h2>
      <p className="text-sm text-texto-suave">Pior resultado de cada dia</p>
      <ol className="mt-5 grid grid-cols-7 gap-2 sm:grid-cols-14">
        {dias.map((d) => {
          const [, mes, dia] = d.dia.split("-");
          const rotulo = d.status ? `${estilos[d.status].rotulo}, ${d.execucoes} execução(ões)` : "Sem execução";
          return (
            <li key={d.dia} className="flex flex-col items-center gap-1.5" title={`${dia}/${mes}: ${rotulo}`}>
              <span
                className={`grid h-10 w-full place-items-center rounded-lg text-xs font-bold ${
                  d.status ? estilos[d.status].quadro : "border-2 border-dashed border-borda text-texto-suave"
                } ${d.dia === hoje ? "ring-2 ring-texto ring-offset-2" : ""}`}
              >
                {dia}
                <span className="sr-only">
                  /{mes}: {rotulo}
                </span>
              </span>
              <span className="text-[10px] font-semibold text-texto-suave uppercase">
                {diaSemana.format(new Date(`${d.dia}T12:00:00Z`)).replace(".", "")}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-suave">
        {STATUS.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${estilos[s].quadro}`} /> {estilos[s].rotulo}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-dashed border-texto-suave" /> Sem execução
        </span>
      </p>
    </section>
  );
}

function UltimaExecucao({ execucao }: { execucao: ExecucaoLog | null }) {
  if (!execucao) {
    return (
      <section className="rounded-card bg-escuro p-6 text-white">
        <h2 className="text-[11px] font-semibold tracking-[0.2em] text-texto-inverso-suave">ÚLTIMA EXECUÇÃO</h2>
        <p className="mt-4 font-display text-3xl">Ainda não houve.</p>
        <p className="mt-2 text-sm text-texto-inverso-suave">Conecte a Conta Azul em Configurações → Conta Azul e rode a primeira sincronização.</p>
      </section>
    );
  }
  const horas = horasDesde(execucao.iniciado_em);
  return (
    <section className="rounded-card bg-escuro p-6 text-white">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.2em] text-texto-inverso-suave">ÚLTIMA EXECUÇÃO</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${estilos[execucao.status].chip}`}>
          {estilos[execucao.status].rotulo}
        </span>
      </div>
      <p className="mt-4 font-display text-3xl leading-tight">{dataHora.format(new Date(execucao.iniciado_em))}</p>
      <p className="mt-1 text-sm text-texto-inverso-suave">
        {execucao.origem ?? "—"} · {duracao(execucao.duracao_ms)}
      </p>
      {execucao.status === "sucesso" ? (
        <p className="mt-4 text-sm">
          <strong>{execucao.recebidas}</strong> recebidas · <strong>{execucao.inseridas}</strong> novas ·{" "}
          <strong>{execucao.suspensas}</strong> suspensas
        </p>
      ) : (
        <p className="mt-4 line-clamp-3 text-sm text-perigo-inverso">{execucao.mensagem}</p>
      )}
      {horas >= 26 && (
        <p className="mt-4 flex items-center gap-2 rounded-bloco bg-white/10 px-3 py-2 text-sm text-realce">
          <AlertTriangle className="size-4 shrink-0" />
          Nenhuma execução há {horas} horas. Verifique a conexão em Configurações → Conta Azul.
        </p>
      )}
    </section>
  );
}

function ItemExecucao({ execucao: e, nomes }: { execucao: ExecucaoLog; nomes: Map<number, string> }) {
  const d = e.detalhes ?? {};
  const temDetalhes =
    !!e.mensagem ||
    !!d.inseridos?.length ||
    !!d.reativados?.length ||
    !!d.suspensos?.length ||
    !!d.regimes?.length ||
    !!d.vinculados?.length ||
    !!d.ignorados?.length ||
    !!d.erros?.length;

  const numero = (rotulo: string, valor: number | null, destaque?: string) => (
    <span className="flex flex-col">
      <span className="text-[10px] font-semibold tracking-wider text-texto-suave">{rotulo}</span>
      <span className={`text-sm font-bold tabular-nums ${valor ? (destaque ?? "text-texto") : "text-texto-suave/60"}`}>
        {valor ?? "—"}
      </span>
    </span>
  );

  const cabecalho = (
    <span className="grid w-full grid-cols-2 items-center gap-3 sm:grid-cols-[180px_100px_1fr_repeat(5,64px)_60px_20px]">
      <span className="col-span-2 flex flex-col sm:col-span-1">
        <span className="text-sm font-semibold text-texto tabular-nums">{dataHora.format(new Date(e.iniciado_em))}</span>
        <span className="truncate text-xs text-texto-suave sm:hidden">{e.origem}</span>
      </span>
      <span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${estilos[e.status].chip}`}>
          {estilos[e.status].rotulo}
        </span>
      </span>
      <span className="hidden truncate text-sm text-texto-suave sm:block" title={e.origem ?? undefined}>
        {e.origem}
        {e.forcar && <span className="ml-2 text-xs font-semibold text-alerta">forçado</span>}
      </span>
      {numero("RECEB.", e.recebidas)}
      {numero("NOVAS", e.inseridas, "text-sucesso")}
      {numero("REATIV.", e.reativadas, "text-info")}
      {numero("SUSP.", e.suspensas, "text-alerta")}
      {numero("REGIME", e.regimes_alterados, "text-info")}
      <span className="text-right text-xs text-texto-suave tabular-nums">{duracao(e.duracao_ms)}</span>
      <span className="hidden justify-end sm:flex">
        {temDetalhes && <ChevronDown className="size-4 text-texto-suave transition-transform group-open:rotate-180" />}
      </span>
    </span>
  );

  if (!temDetalhes) {
    return <li className="rounded-bloco border border-borda px-4 py-3">{cabecalho}</li>;
  }

  return (
    <li>
      <details className="group rounded-bloco border border-borda open:bg-fundo">
        <summary className="cursor-pointer list-none rounded-bloco px-4 py-3 hover:bg-fundo [&::-webkit-details-marker]:hidden">
          {cabecalho}
        </summary>
        <div className="flex flex-col gap-4 border-t border-borda px-4 py-4 text-sm">
          {e.mensagem && (
            <p className={e.status === "sucesso" ? "text-texto-suave" : "font-medium text-perigo"}>{e.mensagem}</p>
          )}
          {d.erros?.length ? <ListaTexto titulo="Erros nos dados" itens={d.erros} /> : null}
          {d.inseridos?.length ? <ListaCodigos titulo="Clientes novos" codigos={d.inseridos} nomes={nomes} /> : null}
          {d.reativados?.length ? <ListaCodigos titulo="Reativados" codigos={d.reativados} nomes={nomes} /> : null}
          {d.vinculados?.length ? (
            <ListaTexto titulo={`Vinculados pelo CNPJ (${d.vinculados.length})`} itens={d.vinculados} />
          ) : null}
          {d.suspensos?.length ? (
            <ListaCodigos titulo="Suspensos (saíram da integração)" codigos={d.suspensos} nomes={nomes} />
          ) : null}
          {d.ignorados?.length ? (
            <ListaTexto titulo={`Ignorados: sem CPF/CNPJ válido (${d.ignorados.length})`} itens={d.ignorados} />
          ) : null}
          {d.regimes?.length ? (
            <ListaTexto
              titulo="Regime alterado"
              itens={d.regimes.map(
                (r) => `Cód. ${r.codigo}${nomes.get(r.codigo) ? ` · ${nomes.get(r.codigo)}` : ""}: ${r.de ?? "sem regime"} → ${r.para ?? "sem regime"}`,
              )}
            />
          ) : null}
        </div>
      </details>
    </li>
  );
}

const LIMITE_LISTA = 50;

// Códigos numéricos (Domínio, histórico) viram "Cód. 123 · Nome"; textos (Conta Azul) já vêm prontos.
function ListaCodigos({ titulo, codigos, nomes }: { titulo: string; codigos: ItemLog[]; nomes: Map<number, string> }) {
  return (
    <ListaTexto
      titulo={`${titulo} (${codigos.length})`}
      itens={codigos.map((c) => (typeof c === "string" ? c : `Cód. ${c}${nomes.get(c) ? ` · ${nomes.get(c)}` : ""}`))}
    />
  );
}

function ListaTexto({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave uppercase">{titulo}</p>
      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {itens.slice(0, LIMITE_LISTA).map((t) => (
          <li key={t} className="truncate text-texto" title={t}>
            {t}
          </li>
        ))}
      </ul>
      {itens.length > LIMITE_LISTA && (
        <p className="mt-1 text-xs text-texto-suave">e mais {itens.length - LIMITE_LISTA}…</p>
      )}
    </div>
  );
}

function LinkPagina({
  pagina,
  status,
  desativado,
  children,
}: {
  pagina: number;
  status?: StatusExecucao;
  desativado: boolean;
  children: React.ReactNode;
}) {
  if (desativado) {
    return <span className="flex h-10 items-center gap-1 px-4 text-sm font-semibold text-texto-suave/50">{children}</span>;
  }
  const p = new URLSearchParams();
  if (status) p.set("status", status);
  if (pagina > 1) p.set("pagina", String(pagina));
  const qs = p.toString();
  return (
    <Link
      href={`/configuracoes/sincronizacao${qs ? `?${qs}` : ""}`}
      className="flex h-10 items-center gap-1 rounded-full border border-borda px-4 text-sm font-semibold text-texto hover:bg-suave"
    >
      {children}
    </Link>
  );
}

function Carregando() {
  return (
    <div>
      <div className="mt-8 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="brilho h-48 rounded-card bg-superficie" />
        <div className="brilho h-48 rounded-card bg-escuro/80" />
      </div>
      <div className="brilho mt-4 h-96 rounded-card bg-superficie" />
    </div>
  );
}
