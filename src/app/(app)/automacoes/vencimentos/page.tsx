import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { listarVencimentos, VencimentosIndisponivel } from "@/lib/vencimentos";
import { MonitorVencimentos } from "@/components/vencimentos/monitor-vencimentos";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Monitor de vencimentos" };

export default function PaginaVencimentos({ searchParams }: PageProps<"/automacoes/vencimentos">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-8">
        <Link href="/automacoes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto">
          <ArrowLeft className="size-4" /> Automações
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">AUTOMAÇÃO</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Monitor de vencimentos</h1>
        <p className="mt-3 max-w-2xl text-sm text-texto-suave">
          Certificados digitais, alvarás, licenças e procurações dos clientes (e do escritório) com a data de vencimento. A
          plataforma avisa por e-mail antes de vencer; renovou, é só atualizar a data.
        </p>
        <Suspense
          fallback={
            <Esqueleto>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="brilho h-24 rounded-card bg-superficie" />
                ))}
              </div>
              <div className="brilho mt-6 h-64 rounded-card bg-superficie" />
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

async function Conteudo({ searchParams }: { searchParams: PageProps<"/automacoes/vencimentos">["searchParams"] }) {
  await connection();
  const usuario = await getUsuario();
  if (!usuario.ativo) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
        <Lock className="size-4 shrink-0 text-destaque" /> Seu acesso ainda não foi ativado.
      </div>
    );
  }
  const arquivados = (await searchParams).arquivados === "1";
  let itens;
  try {
    itens = await listarVencimentos(arquivados);
  } catch (e) {
    if (!(e instanceof VencimentosIndisponivel)) throw e;
    return (
      <div className="mt-8 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
        Aplique a migration <code className="rounded bg-suave px-1.5 py-0.5 text-texto">20261112000200_vencimentos.sql</code>.
      </div>
    );
  }
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return (
    <div className="entrada mt-8">
      <MonitorVencimentos itens={itens} hoje={hoje} arquivados={arquivados} gestor={usuario.papel !== "colaborador"} />
    </div>
  );
}
