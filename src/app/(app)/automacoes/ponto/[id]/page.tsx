import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { leituraPonto, podeUsarPonto, PontoIndisponivel } from "@/lib/ponto";
import { AndamentoLeitura } from "@/components/ponto/andamento-leitura";
import { ConferenciaPonto } from "@/components/ponto/conferencia-ponto";
import { StatusLeitura } from "@/components/ponto/status-leitura";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Conferência da ficha ponto" };
export const maxDuration = 300; // "Ler de novo" também lê depois da resposta

export default function PaginaLeitura({ params }: PageProps<"/automacoes/ponto/[id]">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1920px] px-4 py-8 sm:px-8">
        <Link href="/automacoes/ponto" className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto">
          <ArrowLeft className="size-4" /> Leitura de ficha ponto
        </Link>
        <Suspense
          fallback={
            <Esqueleto>
              <div className="brilho mt-6 h-24 rounded-card bg-superficie" />
              <div className="brilho mt-6 h-96 rounded-card bg-superficie" />
            </Esqueleto>
          }
        >
          <Revelar>
            <Conteudo params={params} />
          </Revelar>
        </Suspense>
      </main>
    </TransicaoPagina>
  );
}

const mesAno = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

async function Conteudo({ params }: { params: PageProps<"/automacoes/ponto/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const usuario = await getUsuario();
  if (!(await podeUsarPonto(usuario))) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
        <Lock className="size-4 shrink-0 text-destaque" /> A leitura de ponto é do Departamento Pessoal, gestores e administradores.
      </div>
    );
  }
  let leitura;
  try {
    leitura = await leituraPonto(id);
  } catch (e) {
    if (e instanceof PontoIndisponivel) notFound();
    throw e;
  }
  if (!leitura) notFound();

  const titulo = leitura.cliente?.razao_social ?? leitura.empresa_lida ?? leitura.arquivos[0]?.nome ?? "Leitura";
  return (
    <div className="entrada">
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">
            FICHA PONTO{leitura.competencia ? ` · ${mesAno(leitura.competencia)}` : ""}
          </p>
          <h1 className="mt-2 font-display text-3xl leading-tight text-texto sm:text-4xl">{titulo}</h1>
        </div>
        <StatusLeitura status={leitura.status} />
      </div>

      {leitura.status === "enviando" || leitura.status === "lendo" || leitura.status === "erro" ? (
        <AndamentoLeitura
          id={leitura.id}
          status={leitura.status}
          total={leitura.paginas_total}
          lidas={leitura.paginas_lidas}
          mensagem={leitura.mensagem}
          enviadaEm={leitura.enviada_em}
        />
      ) : (
        <ConferenciaPonto leitura={leitura} />
      )}
    </div>
  );
}
