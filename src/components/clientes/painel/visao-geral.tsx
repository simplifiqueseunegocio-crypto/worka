import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CircleCheck,
  FileCheck2,
  Landmark,
  ListChecks,
  ScanLine,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { visaoGeral } from "@/lib/cliente-painel";
import { hojeISO } from "@/lib/tarefas";
import { Prazo, corDepartamento } from "@/components/tarefas/prazo";
import { StatusTarefaChip } from "@/components/ui/status-tarefa";
import { Cartao, Indicador, Vazio, dataBR, real } from "./ui";

const SITUACAO_CND = {
  regular: { valor: "Regular", tom: "ok" },
  pendente: { valor: "Com pendência", tom: "erro" },
  erro: { valor: "Erro na consulta", tom: "aviso" },
  sem_consulta: { valor: "Não consultada", tom: "neutro" },
} as const;

export async function VisaoGeral({ clienteId, busca }: { clienteId: string; busca: string }) {
  const v = await visaoGeral(clienteId);
  const hoje = hojeISO();
  const cnd = SITUACAO_CND[(v.cnd?.situacao as keyof typeof SITUACAO_CND) ?? "sem_consulta"] ?? SITUACAO_CND.sem_consulta;
  const tarefasHref = `/tarefas?busca=${encodeURIComponent(busca)}&competencia=todas&status=abertas`;

  return (
    <div className="flex flex-col gap-4">
      {/* Números */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Indicador
          icone={ListChecks}
          rotulo="Tarefas em aberto"
          valor={String(v.tarefas.abertas)}
          detalhe={v.tarefas.atrasadas ? `${v.tarefas.atrasadas} atrasada${v.tarefas.atrasadas === 1 ? "" : "s"}` : `${v.tarefas.concluidasMes} concluída${v.tarefas.concluidasMes === 1 ? "" : "s"} no mês`}
          tom={v.tarefas.atrasadas ? "erro" : v.tarefas.abertas ? "neutro" : "ok"}
          href="?aba=tarefas"
        />
        <Indicador
          icone={CalendarClock}
          rotulo="Vencem em 7 dias"
          valor={String(v.tarefas.semana)}
          detalhe={v.tarefas.semana ? "obrigações com prazo próximo" : "nada nos próximos dias"}
          tom={v.tarefas.semana ? "aviso" : "ok"}
          href="?aba=tarefas"
        />
        <Indicador
          icone={ShieldCheck}
          rotulo="CND"
          valor={cnd.valor}
          detalhe={v.cnd?.consultado_em ? `consultada em ${dataBR(v.cnd.consultado_em.slice(0, 10))}` : undefined}
          tom={cnd.tom}
          href="?aba=certidoes"
        />
        <Indicador
          icone={Wallet}
          rotulo="Guias em aberto"
          valor={v.guias ? String(v.guias.abertas) : "—"}
          detalhe={v.guias ? (v.guias.vencidas ? `${v.guias.vencidas} vencida${v.guias.vencidas === 1 ? "" : "s"} · ${real(v.guias.total)}` : v.guias.abertas ? real(v.guias.total) : "nenhuma pendente") : "leitor de guias"}
          tom={v.guias?.vencidas ? "erro" : v.guias?.abertas ? "aviso" : "neutro"}
          href="?aba=fiscal"
        />
        <Indicador
          icone={Users}
          rotulo="Funcionários"
          valor={v.funcionarios === null ? "—" : String(v.funcionarios)}
          detalhe={v.funcionarios === null ? "visível para o DP" : "cadastrados pelas leituras"}
          href="?aba=pessoal"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          {/* O que pede atenção */}
          <Cartao titulo="Precisa de atenção" subtitulo="Juntado de tarefas, CND, Receita, guias, vencimentos e DET" icone={AlertTriangle}>
            {v.atencao.length === 0 ? (
              <p className="flex items-center gap-2 rounded-bloco bg-sucesso-suave px-4 py-3 text-sm font-semibold text-sucesso">
                <CircleCheck className="size-4" /> Tudo em dia com este cliente.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {v.atencao.map((a, i) => (
                  <li key={i}>
                    <Link
                      href={a.href ?? "?"}
                      scroll={false}
                      className={`flex items-start gap-2.5 rounded-bloco px-3 py-2 text-sm hover:brightness-[0.98] ${
                        a.nivel === "erro" ? "bg-perigo-suave/70 text-perigo" : "bg-alerta-suave/60 text-alerta"
                      }`}
                    >
                      <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${a.nivel === "erro" ? "text-perigo" : "text-alerta"}`} />
                      <span className="min-w-0 flex-1">{a.texto}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          {/* Próximos prazos */}
          <Cartao titulo="Próximos prazos" subtitulo="Tarefas abertas, do prazo mais próximo" icone={CalendarClock} acao={{ href: tarefasHref, rotulo: "Abrir em Tarefas" }}>
            {v.tarefas.proximas.length === 0 ? (
              <Vazio>Nenhuma tarefa em aberto.</Vazio>
            ) : (
              <ul className="divide-y divide-borda">
                {v.tarefas.proximas.map((t) => {
                  const atrasada = t.prazo_legal < hoje;
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2.5">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: corDepartamento(t.departamento?.nome) }} title={t.departamento?.nome} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-texto">{t.obrigacao?.nome ?? "Tarefa"}</span>
                        <span className="block truncate text-xs text-texto-suave">
                          {t.departamento?.nome} · competência {t.competencia.slice(5, 7)}/{t.competencia.slice(0, 4)}
                          {t.responsavel ? ` · ${t.responsavel.nome}` : " · sem responsável"}
                        </span>
                      </span>
                      <span className="hidden w-28 text-right text-sm sm:block">
                        <Prazo tarefa={t} hoje={hoje} />
                      </span>
                      <StatusTarefaChip status={atrasada ? "atrasada" : t.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {/* Equipe */}
          <Cartao titulo="Equipe responsável" subtitulo="Por departamento" icone={UserRound}>
            {v.responsaveis.length === 0 ? (
              <Vazio>Sem responsáveis definidos.</Vazio>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {v.responsaveis.map((r) => (
                  <li key={r.departamento} className="flex items-center gap-3">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-texto"
                      style={{ background: `${corDepartamento(r.departamento)}55` }}
                    >
                      {r.nome
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-texto">{r.nome}</span>
                      <span className="block text-xs text-texto-suave">{r.departamento}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          {/* Receita */}
          <Cartao titulo="Receita Federal" subtitulo="Conferência automática do CNPJ" icone={Landmark} acao={{ href: "?aba=cadastro", rotulo: "Detalhes" }}>
            {!v.receita ? (
              <Vazio>Ainda não conferido na Receita.</Vazio>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[11px] font-semibold tracking-[0.12em] text-texto-suave uppercase">Situação</dt>
                  <dd className={`font-semibold ${v.receita.situacao && !/ATIVA/i.test(v.receita.situacao) ? "text-perigo" : "text-sucesso"}`}>
                    {v.receita.situacao ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold tracking-[0.12em] text-texto-suave uppercase">Enquadramento</dt>
                  <dd className="font-semibold text-texto">{v.receita.mei ? "MEI" : v.receita.simples ? "Simples Nacional" : v.receita.simples === false ? "Fora do Simples" : "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] font-semibold tracking-[0.12em] text-texto-suave uppercase">Atividade principal</dt>
                  <dd className="text-texto">{v.receita.cnae_descricao ?? "—"}</dd>
                </div>
                <p className="col-span-2 text-xs text-texto-suave">Conferido em {dataBR(v.receita.verificado_em.slice(0, 10))}</p>
              </dl>
            )}
          </Cartao>

          {/* Atalhos */}
          <Cartao titulo="Atalhos" icone={BadgeCheck}>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/automacoes/documentos/guia", rotulo: "Ler guias", icone: FileCheck2 },
                { href: "/automacoes/documentos/nfse", rotulo: "Ler NFS-e", icone: Landmark },
                { href: "/automacoes/ponto", rotulo: "Ficha ponto", icone: ScanLine },
                { href: "/automacoes/documentos/atestado", rotulo: "Atestados", icone: Stethoscope },
              ].map(({ href, rotulo, icone: Icone }) => (
                <Link key={href} href={href} className="flex items-center gap-2 rounded-bloco border border-borda px-3 py-2.5 text-sm font-semibold text-texto hover:border-primaria/40 hover:bg-fundo">
                  <Icone className="size-4 text-destaque" /> {rotulo}
                </Link>
              ))}
            </div>
          </Cartao>
        </div>
      </div>
    </div>
  );
}
