import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { listarFeriados } from "@/lib/feriados";
import { hojeISO } from "@/lib/tarefas";
import { GestaoFeriados } from "@/components/feriados/gestao-feriados";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Feriados" };

export default function PaginaFeriados({ searchParams }: PageProps<"/configuracoes/feriados">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto"
        >
          <ArrowLeft className="size-4" /> Configurações
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">CALENDÁRIO</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Feriados</h1>
        <p className="mt-3 max-w-2xl text-sm text-texto-suave">
          Os feriados nacionais deslocam os vencimentos que caem fora de dia útil e entram nas automações. Uma alteração
          vale para as próximas tarefas geradas; as que já existem mantêm o prazo.
        </p>

        <Suspense
          fallback={
            <Esqueleto>
              <div className="brilho mt-8 h-12 w-80 rounded-full bg-superficie" />
              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="brilho h-36 rounded-card bg-superficie" />
                ))}
              </div>
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

async function Conteudo({ searchParams }: { searchParams: PageProps<"/configuracoes/feriados">["searchParams"] }) {
  const usuario = await getUsuario();
  if (!usuario.ativo) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
        <Lock className="size-4 shrink-0 text-destaque" /> Seu acesso ainda não foi ativado.
      </div>
    );
  }

  const hoje = hojeISO();
  const atual = Number(hoje.slice(0, 4));
  const pedido = Number.parseInt(String((await searchParams).ano ?? ""), 10);
  const ano = pedido >= 2000 && pedido <= 2100 ? pedido : atual;
  const feriados = await listarFeriados(ano);

  return (
    <>
      <nav aria-label="Ano" className="entrada mt-8 flex items-center gap-2">
        <LinkAno ano={ano - 1} rotulo="Ano anterior">
          <ChevronLeft className="size-4" />
        </LinkAno>
        <span className="min-w-20 text-center font-display text-3xl text-texto tabular-nums">{ano}</span>
        <LinkAno ano={ano + 1} rotulo="Próximo ano">
          <ChevronRight className="size-4" />
        </LinkAno>
        {ano !== atual && (
          <Link href="/configuracoes/feriados" className="ml-2 text-sm font-semibold text-destaque hover:text-texto">
            Voltar para {atual}
          </Link>
        )}
      </nav>

      <GestaoFeriados key={ano} feriados={feriados} ano={ano} admin={usuario.papel === "admin"} hoje={hoje} />
    </>
  );
}

function LinkAno({ ano, rotulo, children }: { ano: number; rotulo: string; children: React.ReactNode }) {
  return (
    <Link
      href={`/configuracoes/feriados?ano=${ano}`}
      aria-label={rotulo}
      className="grid size-10 place-items-center rounded-full border border-borda bg-superficie text-texto hover:bg-suave"
    >
      {children}
    </Link>
  );
}
