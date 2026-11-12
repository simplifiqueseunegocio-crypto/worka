import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Download, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { listarCertificados, ultimosDownloads, type Certificado } from "@/lib/certificados";
import { FUSO } from "@/lib/log-sincronizacao";
import { hojeISO } from "@/lib/tarefas";
import { EnvioCertificado, ExcluirCertificado } from "@/components/certificados/gestao-certificado";
import { CertificadoAtual, diasAte } from "@/components/certificados/certificado-atual";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Certificado digital" };

export default function PaginaCertificado() {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-8">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto"
        >
          <ArrowLeft className="size-4" /> Configurações
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">ACESSO</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Certificado digital</h1>
        <p className="mt-3 max-w-2xl text-sm text-texto-suave">
          O certificado A1 da empresa, para instalar no computador ou usar no robô do DET. Ele dá acesso ao gov.br, ao
          e-CAC e ao DET como procuradora de todos os clientes: baixe só quando precisar e não repasse.
        </p>

        <Suspense
          fallback={
            <Esqueleto>
              <div className="brilho mt-8 h-48 rounded-card bg-superficie" />
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
const data = (iso: string) => iso.split("-").reverse().join("/");

async function Conteudo() {
  const usuario = await getUsuario();
  if (!usuario.ativo) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
        <Lock className="size-4 shrink-0 text-destaque" /> Seu acesso ainda não foi ativado.
      </div>
    );
  }
  const admin = usuario.papel === "admin";
  const hoje = hojeISO();

  let certificados: Certificado[];
  try {
    certificados = await listarCertificados();
  } catch {
    return (
      <div className="mt-8 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
        O banco ainda não tem a tabela de certificados. Aplique a migration{" "}
        <code className="rounded bg-suave px-1.5 py-0.5 text-texto">20261110000600_certificados.sql</code>.
      </div>
    );
  }
  const [atual, ...anteriores] = certificados;
  const downloads = await ultimosDownloads();

  return (
    <div className="entrada mt-8 flex flex-col gap-6">
      {atual ? <CertificadoAtual cert={atual} hoje={hoje} /> : (
        <div className="rounded-card bg-superficie ring-1 ring-borda px-6 py-10 text-center text-sm text-texto-suave">
          Nenhum certificado enviado ainda.{admin ? "" : " Peça a um administrador para enviar."}
        </div>
      )}

      {admin && <EnvioCertificado temAtual={Boolean(atual)} />}

      {anteriores.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">Anteriores</h2>
          <ul className="mt-3 divide-y divide-borda rounded-card bg-superficie ring-1 ring-borda px-5">
            {anteriores.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-texto">{c.nome}</span>
                  <span className="text-xs text-texto-suave">
                    {diasAte(c.valido_ate, hoje) < 0 ? "Venceu" : "Válido até"} {data(c.valido_ate)} · enviado em{" "}
                    {dataHora.format(new Date(c.enviado_em))}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <a
                    href={`/configuracoes/certificado/${c.id}/arquivo`}
                    className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-destaque hover:bg-suave"
                  >
                    <Download className="size-3.5" /> Baixar
                  </a>
                  {admin && <ExcluirCertificado id={c.id} nome={c.nome} />}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">
          {admin ? "Downloads recentes" : "Seus downloads"}
        </h2>
        {downloads.length === 0 ? (
          <p className="mt-3 text-sm text-texto-suave">Nenhum download registrado.</p>
        ) : (
          <ul className="mt-3 divide-y divide-borda rounded-card bg-superficie ring-1 ring-borda px-5">
            {downloads.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 py-2.5 text-sm">
                <span className="text-texto">
                  {d.pessoa?.nome ?? "—"}
                  {d.certificado && <span className="text-texto-suave"> · {d.certificado.nome}</span>}
                </span>
                <span className="text-texto-suave tabular-nums">{dataHora.format(new Date(d.baixado_em))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
