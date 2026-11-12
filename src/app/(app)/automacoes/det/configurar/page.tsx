import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowUpRight, CalendarClock, FileSpreadsheet, Lock, ShieldCheck } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { abasDaPlanilha, planilhaAtual } from "@/lib/det";
import { FUSO } from "@/lib/log-sincronizacao";
import { EnvioPlanilhaDet } from "@/components/det/acoes-det";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Configurar robô do DET" };

export default function ConfigurarRoboDet() {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-8">
        <Link href="/automacoes/det" className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto">
          <ArrowLeft className="size-4" /> Robô do DET
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">ROBÔ DO DET</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Configurar</h1>
        <p className="mt-3 max-w-2xl text-sm text-texto-suave">
          De onde vêm as empresas que o robô consulta, quando ele roda e o certificado que ele usa para entrar no DET.
        </p>

        <Suspense
          fallback={
            <Esqueleto>
              <div className="brilho mt-8 h-64 rounded-card bg-superficie" />
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

async function Conteudo() {
  const usuario = await getUsuario();
  if (!usuario.ativo || (usuario.papel !== "admin" && usuario.papel !== "gestor")) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
        <Lock className="size-4 shrink-0 text-destaque" /> A configuração do robô é feita por gestores e administradores.
      </div>
    );
  }

  const [planilha, abas] = await Promise.all([planilhaAtual(), abasDaPlanilha().catch(() => [])]);

  return (
    <div className="entrada mt-8 flex flex-col gap-6">
      <section className="rounded-card bg-superficie ring-1 ring-borda p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-texto">
          <FileSpreadsheet className="size-5 text-sucesso" /> Planilha de empresas
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-texto-suave">
          A fonte do robô: as empresas desta planilha entram na fila. Pode ser a do Fechamento Mensal. Em cada aba, a
          plataforma procura as colunas <strong>CNPJ/CPF</strong>, <strong>Empresa</strong> e <strong>AP</strong>, e o nome da aba
          vira a “Aba origem”. Abas sem coluna de CNPJ são ignoradas. Uma planilha nova substitui a anterior.
        </p>

        {planilha === undefined ? (
          <p className="mt-4 rounded-bloco bg-alerta-suave px-3 py-2 text-sm text-alerta">
            Aplique a migration 20261111000200_det_planilha.sql para enviar a planilha.
          </p>
        ) : planilha ? (
          <div className="mt-4 rounded-bloco border border-borda">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borda px-4 py-3">
              <p className="font-semibold text-texto">{planilha.arquivo_nome}</p>
              <p className="text-xs text-texto-suave">
                Enviada{planilha.enviada_por ? ` por ${planilha.enviada_por.nome}` : ""} em {dataHora.format(new Date(planilha.enviada_em))}
              </p>
            </div>
            <ul className="divide-y divide-borda text-sm">
              {abas.map((a) => (
                <li key={a.aba} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                  <span className="text-texto">{a.aba}</span>
                  <span className="text-texto-suave tabular-nums">
                    {a.total} empresas · <span className="text-sucesso">{a.validas} na fila</span>
                    {a.total - a.validas > 0 && <span className="text-alerta"> · {a.total - a.validas} com pendência</span>}
                  </span>
                </li>
              ))}
              <li className="flex flex-wrap justify-between gap-2 bg-fundo px-4 py-2.5 font-semibold">
                <span className="text-texto">Total</span>
                <span className="text-texto tabular-nums">
                  {planilha.linhas} empresas · {planilha.validas} na fila
                </span>
              </li>
            </ul>
          </div>
        ) : (
          <p className="mt-4 rounded-bloco bg-fundo px-3 py-2 text-sm text-texto-suave">
            Nenhuma planilha enviada: o robô usa todos os clientes ativos da plataforma.
          </p>
        )}

        {planilha !== undefined && (
          <div className="mt-5">
            <EnvioPlanilhaDet temPlanilha={Boolean(planilha)} />
          </div>
        )}
        {planilha && planilha.linhas > planilha.validas && (
          <p className="mt-3 text-sm text-texto-suave">
            As empresas com pendência aparecem na aba{" "}
            <Link href="/automacoes/det" className="font-semibold text-destaque hover:text-texto">
              Pendências do Robô do DET
            </Link>
            , com o motivo.
          </p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-card bg-superficie ring-1 ring-borda p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-texto">
            <CalendarClock className="size-5 text-destaque" /> Quando roda
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-texto-suave">
            <li>
              <strong className="text-texto">Todo dia 26 às 07:00</strong> a fila é montada sozinha com as empresas da planilha.
            </li>
            <li>
              <strong className="text-texto">“Iniciar”</strong>, na tela do robô, monta a fila na hora.
            </li>
            <li>
              O <strong className="text-texto">robô do computador do escritório</strong> confere a fila de tempos em tempos e
              começa a ler quando há empresas esperando.
            </li>
          </ul>
        </section>

        <section className="rounded-card bg-superficie ring-1 ring-borda p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-texto">
            <ShieldCheck className="size-5 text-destaque" /> Certificado digital
          </h2>
          <p className="mt-3 text-sm text-texto-suave">
            O robô entra no DET com o certificado A1 da empresa. O arquivo fica em Configurações; a senha não fica na plataforma.
          </p>
          <Link
            href="/configuracoes/certificado"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-destaque hover:text-texto"
          >
            Abrir Certificado digital <ArrowUpRight className="size-3.5" />
          </Link>
        </section>
      </div>
    </div>
  );
}
