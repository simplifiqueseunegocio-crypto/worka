import { ChevronDown, History, ListChecks } from "lucide-react";
import { tarefasAbertas, tarefasRecentes, type TarefaCliente } from "@/lib/cliente-painel";
import { hojeISO } from "@/lib/tarefas";
import { Prazo, corDepartamento } from "@/components/tarefas/prazo";
import { StatusTarefaChip } from "@/components/ui/status-tarefa";
import { Cartao, Vazio, dataBR } from "./ui";

function Linha({ t, hoje }: { t: TarefaCliente; hoje: string }) {
  const aberta = ["pendente", "em_andamento", "aguardando_cliente"].includes(t.status);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: corDepartamento(t.departamento?.nome) }} title={t.departamento?.nome} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-texto">{t.obrigacao?.nome ?? "Tarefa"}</span>
        <span className="block truncate text-xs text-texto-suave">
          {t.departamento?.nome}
          {t.responsavel ? ` · ${t.responsavel.nome}` : " · sem responsável"}
          {!aberta && t.concluida_em ? ` · concluída em ${dataBR(t.concluida_em.slice(0, 10))}` : ""}
        </span>
      </span>
      <span className="hidden w-28 text-right text-sm sm:block">
        <Prazo tarefa={t} hoje={hoje} />
      </span>
      <StatusTarefaChip status={aberta && t.prazo_legal < hoje ? "atrasada" : t.status} />
    </li>
  );
}

const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

export async function AbaTarefas({ clienteId, busca }: { clienteId: string; busca: string }) {
  const [abertas, recentes] = await Promise.all([tarefasAbertas(clienteId), tarefasRecentes(clienteId)]);
  const hoje = hojeISO();
  const porCompetencia = new Map<string, TarefaCliente[]>();
  for (const t of recentes) porCompetencia.set(t.competencia, [...(porCompetencia.get(t.competencia) ?? []), t]);

  return (
    <div className="flex flex-col gap-4">
      <Cartao
        titulo="Em aberto"
        subtitulo={`${abertas.length} ${abertas.length === 1 ? "tarefa" : "tarefas"} de todas as competências`}
        icone={ListChecks}
        acao={{ href: `/tarefas?busca=${encodeURIComponent(busca)}&competencia=todas&status=abertas`, rotulo: "Trabalhar em Tarefas" }}
      >
        {abertas.length === 0 ? <Vazio>Nenhuma tarefa em aberto.</Vazio> : <ul className="divide-y divide-borda">{abertas.map((t) => <Linha key={t.id} t={t} hoje={hoje} />)}</ul>}
      </Cartao>

      <Cartao titulo="Histórico por competência" subtitulo="Últimos 6 meses" icone={History}>
        {porCompetencia.size === 0 ? (
          <Vazio>Sem tarefas nos últimos meses.</Vazio>
        ) : (
          <div className="flex flex-col gap-2">
            {[...porCompetencia.entries()].map(([comp, lista], i) => {
              const feitas = lista.filter((t) => t.status === "concluida" || t.status === "dispensada").length;
              const atrasadas = lista.filter((t) => ["pendente", "em_andamento", "aguardando_cliente"].includes(t.status) && t.prazo_legal < hoje).length;
              const pct = Math.round((feitas / lista.length) * 100);
              const rotulo = nomeMes.format(new Date(`${comp}T12:00:00Z`));
              return (
                <details key={comp} open={i === 0} className="group rounded-bloco border border-borda">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3">
                    <span className="w-40 shrink-0 text-sm font-semibold text-texto capitalize">{rotulo}</span>
                    <span className="hidden h-2 flex-1 overflow-hidden rounded-full bg-suave sm:block">
                      <span className={`block h-full rounded-full ${pct === 100 ? "bg-sucesso-forte" : "bg-primaria"}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="ml-auto text-xs text-texto-suave tabular-nums sm:ml-0">
                      {feitas}/{lista.length} feitas
                      {atrasadas ? <strong className="text-perigo"> · {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}</strong> : null}
                    </span>
                    <ChevronDown className="size-4 text-texto-suave transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="divide-y divide-borda border-t border-borda px-4">
                    {lista.map((t) => (
                      <Linha key={t.id} t={t} hoje={hoje} />
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        )}
      </Cartao>
    </div>
  );
}
