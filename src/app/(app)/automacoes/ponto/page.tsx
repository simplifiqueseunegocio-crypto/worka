import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { listarLeituras, podeUsarPonto, PontoIndisponivel, type LeituraResumo } from "@/lib/ponto";
import { fornecedorIa } from "@/lib/ponto-ia";
import { FUSO } from "@/lib/log-sincronizacao";
import { EnvioPonto } from "@/components/ponto/envio-ponto";
import { StatusLeitura } from "@/components/ponto/status-leitura";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Leitura de ficha ponto" };
// A leitura continua depois da resposta (after) e pode levar alguns minutos.
export const maxDuration = 300;

export default function PaginaPonto() {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-8">
        <Link href="/automacoes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto">
          <ArrowLeft className="size-4" /> Automações
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">AUTOMAÇÃO</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Leitura de ficha ponto</h1>
        <p className="mt-3 max-w-2xl text-sm text-texto-suave">
          Envie a ficha ponto do cliente em PDF, foto ou imagem. A IA lê cada funcionário, os dias e as marcações; o DP confere
          na tela, corrige o que precisar e confirma.
        </p>

        <Suspense
          fallback={
            <Esqueleto>
              <div className="brilho mt-8 h-56 rounded-card bg-superficie" />
              <div className="brilho mt-6 h-64 rounded-card bg-superficie" />
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

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const mesAno = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function competencias() {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
  let [a, m] = hoje.split("-").map(Number);
  const lista: { valor: string; rotulo: string }[] = [];
  for (let i = 0; i < 12; i++) {
    lista.push({ valor: `${a}-${String(m).padStart(2, "0")}`, rotulo: `${String(m).padStart(2, "0")}/${a}` });
    m--;
    if (!m) {
      m = 12;
      a--;
    }
  }
  return lista;
}

async function Conteudo() {
  await connection();
  const usuario = await getUsuario();
  if (!(await podeUsarPonto(usuario))) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie p-5 text-sm text-texto-suave">
        <Lock className="size-4 shrink-0 text-destaque" /> A leitura de ponto é do Departamento Pessoal, gestores e administradores.
      </div>
    );
  }

  let leituras: LeituraResumo[];
  try {
    leituras = await listarLeituras();
  } catch (e) {
    if (!(e instanceof PontoIndisponivel)) throw e;
    return (
      <div className="mt-8 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
        Aplique a migration <code className="rounded bg-suave px-1.5 py-0.5 text-texto">20261112000000_ponto.sql</code> para usar a
        leitura de ponto.
      </div>
    );
  }
  const lista = competencias();

  return (
    <div className="entrada mt-8 flex flex-col gap-8">
      {/* A competência padrão é o mês anterior: o ponto chega depois do fechamento. */}
      <EnvioPonto competencias={lista} padrao={lista[1].valor} />
      {!fornecedorIa() && (
        <p className="-mt-5 rounded-bloco bg-alerta-suave px-4 py-2.5 text-sm text-alerta">
          Nenhuma IA configurada: PDFs gerados por sistema ou digitados são lidos normalmente; fotos e fichas escaneadas
          precisam da <strong>GROQ_API_KEY</strong> (ou ANTHROPIC_API_KEY) no servidor.
        </p>
      )}

      <section>
        <h2 className="text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">Leituras recentes</h2>
        {leituras.length === 0 ? (
          <p className="mt-3 rounded-card bg-superficie ring-1 ring-borda px-5 py-6 text-sm text-texto-suave">Nenhuma ficha lida ainda.</p>
        ) : (
          <ul className="mt-3 divide-y divide-borda overflow-hidden rounded-card bg-superficie ring-1 ring-borda">
            {leituras.map((l) => {
              const fichas = l.fichas[0]?.count ?? 0;
              return (
                <li key={l.id}>
                  <Link href={`/automacoes/ponto/${l.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-fundo">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-texto">
                        {l.cliente?.razao_social ?? l.empresa_lida ?? l.arquivos[0]?.nome ?? "Leitura"}
                      </p>
                      <p className="truncate text-xs text-texto-suave">
                        {l.competencia ? `Competência ${mesAno(l.competencia)} · ` : ""}
                        {fichas ? `${fichas} ${fichas === 1 ? "ficha" : "fichas"} · ` : ""}
                        {l.arquivos.length} {l.arquivos.length === 1 ? "arquivo" : "arquivos"} · enviada{" "}
                        {l.enviada_por ? `por ${l.enviada_por.nome} ` : ""}em {dataHora.format(new Date(l.enviada_em))}
                      </p>
                    </div>
                    <StatusLeitura status={l.status} />
                    <ChevronRight className="size-4 shrink-0 text-texto-suave" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
