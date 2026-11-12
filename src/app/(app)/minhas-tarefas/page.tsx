import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardCheck, Hand, PartyPopper, SearchX } from "lucide-react";
import { getUsuario, sessaoUsuario } from "@/lib/auth";
import {
  LIMITE_MINHAS_TAREFAS,
  hojeISO,
  lerFiltrosMinhasTarefas,
  listarMinhasTarefas,
  resumoMinhasTarefas,
  somarDias,
  type FiltrosMinhasTarefas,
  type MinhaTarefa,
  type VisaoMinhasTarefas,
} from "@/lib/tarefas";
import { listarTarefasPessoais } from "@/lib/tarefas-pessoais";
import { AcoesTarefa } from "@/components/tarefas/acoes-tarefa";
import { TarefasPessoais } from "@/components/tarefas/tarefas-pessoais";
import { Prazo, competenciaCurta, corDepartamento, dataCurta } from "@/components/tarefas/prazo";
import { Contador } from "@/components/ui/contador";
import { StatusTarefaChip } from "@/components/ui/status-tarefa";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";
import { Busca } from "./busca";

export const metadata: Metadata = { title: "Minhas tarefas" };

export default function MinhasTarefas({ searchParams }: PageProps<"/minhas-tarefas">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <div className="entrada flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">MEU TRABALHO</p>
            <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">
              Minhas <span className="text-destaque">tarefas</span>
            </h1>
          </div>
          <Link
            href="/tarefas?competencia=todas&responsavel=sem&status=abertas"
            className="flex h-11 items-center gap-2 rounded-full border-2 border-primaria px-5 text-sm font-bold text-destaque transition-colors hover:bg-primaria hover:text-sobre-primaria"
          >
            <Hand className="size-4" /> Pegar tarefas sem responsável
          </Link>
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

function hrefVisao(visao: VisaoMinhasTarefas, busca: string) {
  const p = new URLSearchParams();
  if (visao !== "abertas") p.set("visao", visao);
  if (busca) p.set("busca", busca);
  const qs = p.toString();
  return qs ? `/minhas-tarefas?${qs}` : "/minhas-tarefas";
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/minhas-tarefas">["searchParams"] }) {
  const filtros = lerFiltrosMinhasTarefas(await searchParams);
  // O id vem do token: as tarefas começam a carregar junto com o perfil.
  const { id } = await sessaoUsuario();
  const [usuario, r, { tarefas, total }, pessoais] = await Promise.all([
    getUsuario(),
    resumoMinhasTarefas(id),
    listarMinhasTarefas(id, filtros),
    listarTarefasPessoais(),
  ]);
  const hoje = hojeISO();

  const cartoes: { visao: VisaoMinhasTarefas; rotulo: string; valor: number; detalhe: string; cor?: string }[] = [
    { visao: "abertas", rotulo: "Abertas", valor: r.abertas, detalhe: "Sob sua responsabilidade" },
    {
      visao: "atrasadas",
      rotulo: "Atrasadas",
      valor: r.atrasadas,
      detalhe: "Passaram do prazo legal",
      cor: r.atrasadas ? "text-perigo" : "",
    },
    { visao: "semana", rotulo: "Vencem em 7 dias", valor: r.semana, detalhe: "Até " + dataCurta(somarDias(hoje, 7)) },
    {
      visao: "aguardando",
      rotulo: "Aguardando cliente",
      valor: r.aguardando,
      detalhe: "Documentos ou informações",
      cor: r.aguardando ? "text-alerta" : "",
    },
    {
      visao: "concluidas",
      rotulo: "Concluídas no mês",
      valor: r.concluidasNoMes,
      detalhe: "Ver concluídas e dispensadas",
      cor: r.concluidasNoMes ? "text-sucesso" : "",
    },
  ];

  const semNenhuma = r.abertas === 0 && r.concluidasNoMes === 0 && filtros.visao === "abertas" && !filtros.busca;

  return (
    <>
      <nav aria-label="Visões" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {cartoes.map((c, i) => {
          const atual = c.visao === filtros.visao;
          const destaque = c.visao === "abertas";
          return (
            <Link
              key={c.visao}
              href={hrefVisao(c.visao, filtros.busca)}
              aria-current={atual ? "page" : undefined}
              className={`animate-surgir rounded-card p-5 ring-offset-2 ring-offset-fundo transition hover:-translate-y-0.5 hover:shadow-elevado ${
                destaque ? "col-span-2 bg-escuro text-white sm:col-span-1" : "bg-superficie"
              } ${atual ? (destaque ? "ring-2 ring-realce" : "ring-2 ring-primaria") : ""}`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className={`block text-sm font-semibold ${destaque ? "text-texto-inverso-suave" : "text-texto-suave"}`}>
                {c.rotulo}
              </span>
              <span
                className={`mt-2 block text-3xl font-display tabular-nums ${
                  destaque ? "text-white" : c.cor || "text-texto"
                }`}
              >
                <Contador valor={c.valor} />
              </span>
              <span className={`mt-1 block text-xs ${destaque ? "text-texto-inverso-suave" : "text-texto-suave"}`}>{c.detalhe}</span>
            </Link>
          );
        })}
      </nav>

      {pessoais && <TarefasPessoais abertas={pessoais.abertas} concluidas={pessoais.concluidas} hoje={hoje} />}

      {semNenhuma ? (
        <SemTarefas gestor={usuario.papel !== "colaborador"} />
      ) : (
        <section className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6">
          <Busca key={filtros.busca} filtros={filtros} />

          <p className="mt-5 text-sm text-texto-suave" aria-live="polite">
            {total ? (
              <>
                <strong className="text-texto">{total.toLocaleString("pt-BR")}</strong>{" "}
                {total === 1 ? "tarefa" : "tarefas"} · {descricaoVisao[filtros.visao]}
                {total > tarefas.length && <> · mostrando as {tarefas.length} primeiras</>}
              </>
            ) : (
              "Nenhuma tarefa encontrada"
            )}
          </p>

          {tarefas.length === 0 ? (
            <Vazio filtros={filtros} />
          ) : (
            <Tabela tarefas={tarefas} hoje={hoje} concluidas={filtros.visao === "concluidas"} />
          )}

          {total > LIMITE_MINHAS_TAREFAS && (
            <p className="mt-4 border-t border-borda pt-4 text-xs text-texto-suave">
              Use a busca ou os cartões acima para encontrar as demais.
            </p>
          )}
        </section>
      )}
    </>
  );
}

const descricaoVisao: Record<VisaoMinhasTarefas, string> = {
  abertas: "abertas, por prazo legal",
  atrasadas: "atrasadas, da mais antiga",
  semana: "vencem nos próximos 7 dias",
  aguardando: "aguardando o cliente",
  concluidas: "concluídas e dispensadas, das mais recentes",
};

// ---------------------------------------------------------------------------
// Tabela agrupada por prazo

type Grupo = { chave: string; titulo: string; cor: string; tarefas: MinhaTarefa[] };

function agrupar(tarefas: MinhaTarefa[], hoje: string, concluidas: boolean): Grupo[] {
  if (concluidas) return [{ chave: "concluidas", titulo: "", cor: "", tarefas }];
  const limite = somarDias(hoje, 7);
  const grupos: Grupo[] = [
    { chave: "atrasadas", titulo: "Atrasadas", cor: "bg-perigo-forte", tarefas: [] },
    { chave: "hoje", titulo: "Vencem hoje", cor: "bg-realce", tarefas: [] },
    { chave: "semana", titulo: "Próximos 7 dias", cor: "bg-primaria", tarefas: [] },
    { chave: "depois", titulo: "Mais adiante", cor: "bg-borda", tarefas: [] },
  ];
  for (const t of tarefas) {
    const i = t.prazo_legal < hoje ? 0 : t.prazo_legal === hoje ? 1 : t.prazo_legal <= limite ? 2 : 3;
    grupos[i].tarefas.push(t);
  }
  return grupos.filter((g) => g.tarefas.length);
}

function Tabela({ tarefas, hoje, concluidas }: { tarefas: MinhaTarefa[]; hoje: string; concluidas: boolean }) {
  const grupos = agrupar(tarefas, hoje, concluidas);
  let n = 0;

  return (
    <div className="-mx-4 mt-3 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave">
            <th className="px-4 py-3 font-semibold sm:px-6">OBRIGAÇÃO</th>
            <th className="px-3 py-3 font-semibold">COMPETÊNCIA</th>
            <th className="px-3 py-3 font-semibold">{concluidas ? "CONCLUSÃO" : "PRAZO"}</th>
            <th className="px-3 py-3 font-semibold">STATUS</th>
            <th className="px-4 py-3 text-right font-semibold sm:px-6">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={g.chave}>
            {g.titulo && (
              <tr>
                <th colSpan={5} scope="colgroup" className="px-4 pt-6 pb-2 text-left sm:px-6">
                  <span className="flex items-center gap-2.5 text-xs font-bold tracking-[0.12em] text-texto uppercase">
                    <span className={`size-2 rounded-full ${g.cor}`} aria-hidden="true" />
                    {g.titulo}
                    <span className="rounded-full bg-suave px-2 py-0.5 text-[11px] tracking-normal text-texto-suave tabular-nums">
                      {g.tarefas.length}
                    </span>
                  </span>
                </th>
              </tr>
            )}
            {g.tarefas.map((t) => {
              const atraso = Math.min(n++, 12) * 25;
              const nome = t.obrigacao?.nome ?? "Obrigação";
              const cliente = t.cliente.fantasia || t.cliente.razao_social;
              return (
                <tr
                  key={t.id}
                  className="animate-surgir border-t border-borda align-top transition-colors hover:bg-fundo"
                  style={{ animationDelay: `${atraso}ms` }}
                >
                  <td className="max-w-[380px] px-4 py-3.5 sm:px-6">
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
                  <td className="px-3 py-3.5 font-medium whitespace-nowrap tabular-nums">{competenciaCurta(t.competencia)}</td>
                  <td className="px-3 py-3.5 whitespace-nowrap">
                    {concluidas ? <Conclusao tarefa={t} /> : <Prazo tarefa={t} hoje={hoje} />}
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
                    <AcoesTarefa tarefaId={t.id} status={t.status} rotulo={`${nome}, ${cliente}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Conclusao({ tarefa }: { tarefa: MinhaTarefa }) {
  return (
    <>
      <span className="block font-semibold text-texto tabular-nums">
        {tarefa.concluida_em ? dataHora.format(new Date(tarefa.concluida_em)) : "—"}
      </span>
      <span className="block text-xs text-texto-suave tabular-nums">Prazo {dataCurta(tarefa.prazo_legal)}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Estados vazios

function Vazio({ filtros }: { filtros: FiltrosMinhasTarefas }) {
  if (filtros.busca) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-bloco bg-fundo px-6 py-14 text-center">
        <SearchX className="size-8 text-texto-suave" strokeWidth={1.6} />
        <p className="font-semibold text-texto">Nenhuma tarefa sua para “{filtros.busca}”.</p>
        <Link href={hrefVisao(filtros.visao, "")} className="text-sm font-semibold text-destaque hover:underline">
          Limpar a busca
        </Link>
      </div>
    );
  }
  const mensagens: Record<VisaoMinhasTarefas, string> = {
    abertas: "Você não tem tarefas abertas.",
    atrasadas: "Nada atrasado. Tudo dentro do prazo legal.",
    semana: "Nenhuma tarefa sua vence nos próximos 7 dias.",
    aguardando: "Nenhuma tarefa esperando o cliente.",
    concluidas: "Você ainda não concluiu nenhuma tarefa.",
  };
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-bloco bg-fundo px-6 py-14 text-center">
      <PartyPopper className="size-8 text-destaque" strokeWidth={1.6} />
      <p className="font-semibold text-texto">{mensagens[filtros.visao]}</p>
      {filtros.visao !== "abertas" && (
        <Link href="/minhas-tarefas" className="text-sm font-semibold text-destaque hover:underline">
          Ver todas as abertas
        </Link>
      )}
    </div>
  );
}

function SemTarefas({ gestor }: { gestor: boolean }) {
  return (
    <section className="mt-4 flex flex-col items-start gap-3 rounded-card bg-superficie ring-1 ring-borda p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-xl bg-suave text-destaque">
        <ClipboardCheck className="size-6" strokeWidth={1.8} />
      </span>
      <h2 className="text-lg font-bold text-texto">Nenhuma tarefa sob sua responsabilidade</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-texto-suave">
        As tarefas são geradas todo dia 1º para a competência anterior e ficam com o responsável do cliente em cada
        departamento. Quando você for definido como responsável por algum cliente, as obrigações dele aparecem aqui.
      </p>
      {gestor ? (
        <Link
          href="/tarefas"
          className="mt-1 flex h-11 items-center rounded-full bg-primaria px-6 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover"
        >
          Ver todas as tarefas
        </Link>
      ) : (
        <p className="text-sm font-semibold text-texto-suave">Fale com o gestor do seu departamento.</p>
      )}
    </section>
  );
}

function Carregando() {
  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="brilho h-[124px] rounded-card bg-superficie" />
        ))}
      </div>
      <div className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-6">
        <div className="brilho h-11 rounded-full bg-suave" />
        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="brilho h-16 rounded-bloco bg-fundo" />
          ))}
        </div>
      </div>
    </>
  );
}
