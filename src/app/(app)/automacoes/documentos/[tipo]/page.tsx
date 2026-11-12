import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { tipoDocumento } from "@/lib/documentos/tipos";
import { DocumentosIndisponivel, listarLeiturasDocumento, podeUsarDocumento } from "@/lib/documentos/dados";
import { fornecedorIa } from "@/lib/ia-extracao";
import { FUSO } from "@/lib/log-sincronizacao";
import { EnvioDocumentos } from "@/components/documentos/envio-documentos";
import { GuiasEmAberto } from "@/components/documentos/guias-em-aberto";
import { StatusLeitura } from "@/components/ponto/status-leitura";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export async function generateMetadata({ params }: PageProps<"/automacoes/documentos/[tipo]">): Promise<Metadata> {
  const { tipo } = await params;
  return { title: tipoDocumento(tipo)?.titulo ?? "Leitura de documentos" };
}
// A leitura continua depois da resposta (after) e pode levar alguns minutos.
export const maxDuration = 300;

export default function PaginaDocumentos({ params }: PageProps<"/automacoes/documentos/[tipo]">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-8">
        <Link href="/automacoes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto">
          <ArrowLeft className="size-4" /> Automações
        </Link>
        <Suspense
          fallback={
            <Esqueleto>
              <div className="brilho mt-6 h-28 rounded-card bg-superficie" />
              <div className="brilho mt-6 h-56 rounded-card bg-superficie" />
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

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function Conteudo({ params }: { params: PageProps<"/automacoes/documentos/[tipo]">["params"] }) {
  await connection();
  const { tipo: chave } = await params;
  const tipo = tipoDocumento(chave);
  if (!tipo) notFound();
  const usuario = await getUsuario();

  const cabecalho = (
    <>
      <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">AUTOMAÇÃO · {tipo.departamento.toUpperCase()}</p>
      <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">{tipo.titulo}</h1>
      <p className="mt-3 max-w-2xl text-sm text-texto-suave">{tipo.descricao}</p>
    </>
  );
  if (!(await podeUsarDocumento(usuario, chave))) {
    return (
      <>
        {cabecalho}
        <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
          <Lock className="size-4 shrink-0 text-destaque" /> Esta leitura é de {tipo.departamentos.length > 1 ? "quem está nos departamentos" : "quem está no departamento"} {tipo.departamentos.join(", ")}, gestores e administradores.
        </div>
      </>
    );
  }

  let leituras;
  try {
    leituras = await listarLeiturasDocumento(chave);
  } catch (e) {
    if (!(e instanceof DocumentosIndisponivel)) throw e;
    return (
      <>
        {cabecalho}
        <div className="mt-8 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
          Aplique a migration <code className="rounded bg-suave px-1.5 py-0.5 text-texto">20261112000100_documentos.sql</code>.
        </div>
      </>
    );
  }

  return (
    <>
      {cabecalho}
      <div className="entrada mt-8 flex flex-col gap-8">
        {fornecedorIa() ? (
          <EnvioDocumentos tipo={chave} aceita={tipo.aceita} plural={tipo.item.plural} />
        ) : (
          <div className="rounded-card bg-alerta-suave p-5 text-sm text-alerta">
            A leitura precisa de IA: configure a <strong>GROQ_API_KEY</strong> (ou ANTHROPIC_API_KEY) no servidor.
          </div>
        )}

        <section>
          <h2 className="text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">Leituras recentes</h2>
          {leituras.length === 0 ? (
            <p className="mt-3 rounded-card bg-superficie ring-1 ring-borda px-5 py-6 text-sm text-texto-suave">Nenhuma leitura ainda.</p>
          ) : (
            <ul className="mt-3 divide-y divide-borda overflow-hidden rounded-card bg-superficie ring-1 ring-borda">
              {leituras.map((l) => {
                const n = l.itens[0]?.count ?? 0;
                return (
                  <li key={l.id}>
                    <Link href={`/automacoes/documentos/${chave}/${l.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-fundo">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-texto">{l.cliente?.razao_social ?? l.arquivos[0]?.nome ?? "Leitura"}</p>
                        <p className="truncate text-xs text-texto-suave">
                          {n ? `${n} ${n === 1 ? tipo.item.singular : tipo.item.plural} · ` : ""}
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

        {chave === "guia" && <GuiasEmAberto />}
      </div>
    </>
  );
}
