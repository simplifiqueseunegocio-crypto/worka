import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { listarTiposCertidao } from "@/lib/certidoes";
import { TiposCertidao } from "@/components/certidoes/tipos-certidao";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Tipos de certidão" };

export default function PaginaTiposCertidao() {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto"
        >
          <ArrowLeft className="size-4" /> Configurações
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">CATÁLOGO</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Certidões</h1>
        <p className="mt-3 max-w-2xl text-texto-suave">
          Os tipos de certidão que a equipe acompanha e lança nos clientes. Os tipos com consulta automática não são
          excluídos, mas podem ser desativados.
        </p>

        <Suspense
          fallback={
            <Esqueleto>
              <div className="brilho mt-8 h-96 rounded-card bg-superficie" />
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

async function Conteudo() {
  const [usuario, tipos] = await Promise.all([getUsuario(), listarTiposCertidao()]);
  if (!tipos) {
    return (
      <p className="mt-8 rounded-card bg-superficie ring-1 ring-borda p-6 text-sm text-texto-suave">
        Aplique a migration <code className="rounded bg-suave px-1.5 py-0.5 text-xs">20261109000100_certidoes.sql</code>{" "}
        no Supabase para usar o catálogo.
      </p>
    );
  }
  const admin = usuario.papel === "admin";
  return (
    <>
      {!admin && (
        <p className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
          <Lock className="size-5 shrink-0 text-destaque" /> Só o administrador altera o catálogo.
        </p>
      )}
      <TiposCertidao tipos={tipos} admin={admin} />
    </>
  );
}
