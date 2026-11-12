import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { tipoDocumento } from "@/lib/documentos/tipos";
import { DocumentosIndisponivel, leituraDocumento, podeUsarDocumento } from "@/lib/documentos/dados";
import { excluirLeituraDocumento, iniciarLeituraDocumento } from "@/lib/documentos/actions";
import { AndamentoLeitura } from "@/components/ponto/andamento-leitura";
import { ConferenciaDocumentos } from "@/components/documentos/conferencia-documentos";
import { StatusLeitura } from "@/components/ponto/status-leitura";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Conferência de documentos" };
export const maxDuration = 300; // "Ler de novo" também lê depois da resposta

type Props = PageProps<"/automacoes/documentos/[tipo]/[id]">;

export default function PaginaLeituraDocumento({ params }: Props) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-8">
        <Suspense
          fallback={
            <Esqueleto>
              <div className="brilho h-24 rounded-card bg-superficie" />
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

async function Conteudo({ params }: { params: Props["params"] }) {
  await connection();
  const { tipo: chave, id } = await params;
  const tipo = tipoDocumento(chave);
  if (!tipo || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const usuario = await getUsuario();
  const voltar = (
    <Link href={`/automacoes/documentos/${chave}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto">
      <ArrowLeft className="size-4" /> {tipo.titulo}
    </Link>
  );
  if (!(await podeUsarDocumento(usuario, chave))) {
    return (
      <>
        {voltar}
        <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
          <Lock className="size-4 shrink-0 text-destaque" /> Esta leitura é de {tipo.departamentos.length > 1 ? "quem está nos departamentos" : "quem está no departamento"} {tipo.departamentos.join(", ")}, gestores e administradores.
        </div>
      </>
    );
  }
  let leitura;
  try {
    leitura = await leituraDocumento(id);
  } catch (e) {
    if (e instanceof DocumentosIndisponivel) notFound();
    throw e;
  }
  if (!leitura || leitura.tipo !== chave) notFound();

  return (
    <div className="entrada">
      {voltar}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">{tipo.item.plural.toUpperCase()}</p>
          <h1 className="mt-2 font-display text-3xl leading-tight text-texto sm:text-4xl">
            {leitura.cliente?.razao_social ?? leitura.arquivos[0]?.nome ?? "Leitura"}
          </h1>
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
          acoes={{ ler: iniciarLeituraDocumento, excluir: excluirLeituraDocumento }}
        />
      ) : (
        <ConferenciaDocumentos leitura={leitura} />
      )}
    </div>
  );
}
