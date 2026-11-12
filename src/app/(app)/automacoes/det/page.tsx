import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowUpRight, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { avisosRecentes, DetIndisponivel, planilhaDet, resumoDet, rotuloMes, type AvisoDet, type EmpresaDet } from "@/lib/det";
import { formatarDocumento } from "@/lib/formatar";
import { EmpresasDet, type LinhaEmpresaDet } from "@/components/det/empresas-det";
import { AcoesDet } from "@/components/det/acoes-det";
import { FUSO } from "@/lib/log-sincronizacao";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Robô do DET" };

export default function PaginaRoboDet() {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-8">
        <Link href="/automacoes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto">
          <ArrowLeft className="size-4" /> Automações
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">AUTOMAÇÃO</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Robô do DET</h1>
        <p className="mt-3 max-w-2xl text-sm text-texto-suave">
          Todo dia 26 as empresas da planilha entram na fila (ou use “Iniciar”). O robô do computador do escritório entra no
          DET com o certificado da empresa, lê a lista da Caixa Postal de cada empresa e cada aviso de consignado vira tarefa
          para o DP.
        </p>

        <Suspense
          fallback={
            <Esqueleto>
              <div className="mt-8 grid gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="brilho h-24 rounded-card bg-superficie" />
                ))}
              </div>
              <div className="brilho mt-6 h-44 rounded-card bg-superficie" />
            </Esqueleto>
          }
        >
          <Revelar>
            <Conteudo />
          </Revelar>
        </Suspense>
      </main>
    </TransicaoPagina>
  );
}

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" });
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const mesAno = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const nome = (c: { razao_social: string; fantasia: string | null }) => c.fantasia || c.razao_social;

async function Conteudo() {
  const usuario = await getUsuario();
  if (!usuario.ativo) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie p-5 text-sm text-texto-suave">
        <Lock className="size-4 shrink-0 text-destaque" /> Seu acesso ainda não foi ativado.
      </div>
    );
  }
  const opera = usuario.papel === "admin" || usuario.papel === "gestor";

  // Visão por empresa: null se a migration 20261111000100_det_painel.sql faltar.
  const planilha = planilhaDet().catch((e) => {
    if (e instanceof DetIndisponivel) return null;
    throw e;
  });
  let dados;
  try {
    dados = await Promise.all([resumoDet(), avisosRecentes()]);
  } catch (e) {
    if (!(e instanceof DetIndisponivel)) throw e;
    dados = null;
  }
  const p = await planilha;

  const linha = (e: EmpresaDet): LinhaEmpresaDet => ({
    chave: e.cliente_id,
    aba_origem: e.aba_origem,
    codigo: e.codigo_dominio === null ? null : String(e.codigo_dominio),
    empresa: e.razao_social,
    documento: formatarDocumento(e.documento, e.tipo_inscricao),
    ultimo_aviso: e.ultimo_aviso,
    tem_consignado: e.tem_consignado,
    no_ciclo: e.no_ciclo,
    avisos_consignado: e.avisos_consignado,
    nao_lidas: e.nao_lidas,
  });

  return (
    <div className="entrada mt-6 flex flex-col gap-8">
      {opera && (
        <AcoesDet naFila={dados?.[0].naFila ?? 0} />
      )}

      {dados ? (
        <Painel resumo={dados[0]} />
      ) : (
        <div className="rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
          O banco ainda não tem a fila do DET. Aplique as migrations{" "}
          <code className="rounded bg-suave px-1.5 py-0.5 text-texto">20261110000400_det.sql</code> e{" "}
          <code className="rounded bg-suave px-1.5 py-0.5 text-texto">20261110000500_cron_det.sql</code>.
        </div>
      )}

      {dados &&
        (p ? (
          <EmpresasDet
            empresas={p.empresas.map(linha)}
            comConsignado={p.comConsignado.map(linha)}
            pendencias={p.pendencias.map((e) => ({
              chave: e.chave,
              aba_origem: e.aba_origem,
              codigo: e.codigo,
              empresa: e.razao_social,
              documento: e.documento ? formatarDocumento(e.documento, e.tipo_inscricao) : "",
              motivo: e.motivo,
            }))}
            rotuloCiclo={rotuloMes(p.ciclo ?? dados[0].competencia)}
          />
        ) : (
          <div className="rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
            Para ver as empresas e baixar a planilha, aplique a migration{" "}
            <code className="rounded bg-suave px-1.5 py-0.5 text-texto">20261111000100_det_painel.sql</code>.
          </div>
        ))}

      {dados && <Avisos avisos={dados[1]} />}
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">{children}</h2>;
}

function Painel({ resumo: r }: { resumo: Awaited<ReturnType<typeof resumoDet>> }) {
  const itens = [
    { rotulo: "Na fila agora", valor: r.naFila, detalhe: r.ultima ? `última leitura ${dataHora.format(new Date(r.ultima))}` : "nenhuma leitura ainda" },
    { rotulo: `Lidas em ${mesAno(r.competencia)}`, valor: r.concluidas, detalhe: "empresas consultadas" },
    { rotulo: "Avisos de consignado", valor: r.avisosNoMes, detalhe: "novos neste mês" },
    {
      rotulo: "Pendências",
      valor: r.semProcuracao + r.falhas,
      detalhe: `${r.semProcuracao} sem procuração · ${r.falhas} ${r.falhas === 1 ? "falha" : "falhas"}`,
      destaque: r.semProcuracao + r.falhas > 0,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {itens.map((i) => (
        <section key={i.rotulo} className="rounded-card bg-superficie ring-1 ring-borda px-5 py-4">
          <h2 className="text-xs text-texto-suave">{i.rotulo}</h2>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${i.destaque ? "text-alerta" : "text-texto"}`}>{i.valor}</p>
          <p className="truncate text-xs text-texto-suave">{i.detalhe}</p>
        </section>
      ))}
    </div>
  );
}

function Avisos({ avisos }: { avisos: AvisoDet[] }) {
  return (
    <section>
      <Titulo>Avisos de consignado</Titulo>
      {avisos.length === 0 ? (
        <p className="mt-3 rounded-card bg-superficie ring-1 ring-borda px-5 py-6 text-sm text-texto-suave">Nenhum aviso de consignado encontrado ainda.</p>
      ) : (
        <ul className="mt-3 divide-y divide-borda rounded-card bg-superficie ring-1 ring-borda px-5">
          {avisos.map((a) => (
            <li key={a.id} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <Link href={`/clientes/${a.cliente.id}`} className="text-sm font-semibold text-texto hover:underline">
                  {nome(a.cliente)}
                </Link>
                <p className="truncate text-sm text-texto-suave" title={a.assunto}>
                  {a.assunto}
                </p>
                <p className="text-xs text-texto-suave/80">
                  Recebido em {dataBR(a.enviada_em)}
                  {a.periodo_averbacao && ` · averbação ${a.periodo_averbacao}`}
                  {a.competencia_desconto && ` · desconto em ${mesAno(a.competencia_desconto)}`}
                  {a.lida === false && " · não lida no DET"}
                </p>
              </div>
              {a.tarefa_id && (
                <Link
                  href={`/tarefas?status=abertas&competencia=todas&departamento=pessoal&busca=${encodeURIComponent(nome(a.cliente))}`}
                  className="flex items-center gap-1 self-center text-xs font-semibold text-destaque hover:text-texto"
                >
                  Ver tarefa <ArrowUpRight className="size-3.5" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
