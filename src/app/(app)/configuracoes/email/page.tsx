import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, Lock, XCircle } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { configuracaoEmail } from "@/lib/email";
import { BotaoEmailTeste } from "@/components/email/botao-email-teste";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "E-mail" };

export default function PaginaEmail() {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto"
        >
          <ArrowLeft className="size-4" /> Configurações
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">INTEGRAÇÃO RESEND</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">E-mail</h1>
        <p className="mt-3 max-w-2xl text-texto-suave">
          Os e-mails da plataforma (como a folha de adiantamento) saem pelo Resend, com o remetente abaixo.
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

async function Conteudo() {
  const usuario = await getUsuario();
  if (!usuario.ativo || usuario.papel !== "admin") {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-6 text-sm text-texto-suave">
        <Lock className="size-5 shrink-0 text-destaque" />
        A configuração de e-mail é visível só para administradores.
      </div>
    );
  }

  const c = configuracaoEmail();
  const itens: [string, boolean, string][] = [
    ["Chave da API (RESEND_API_KEY)", c.chave, c.chave ? "Cadastrada" : "Não cadastrada"],
    ["Remetente (EMAIL_REMETENTE)", Boolean(c.remetente), c.remetente ?? "Não cadastrado"],
    ["Responder para (EMAIL_RESPONDER_PARA, opcional)", true, c.responderPara ?? "Mesmo endereço do remetente"],
  ];
  const pronto = c.chave && Boolean(c.remetente);

  return (
    <section className="entrada mt-8 max-w-3xl rounded-card bg-superficie ring-1 ring-borda p-6">
      <h2 className="text-lg font-bold text-texto">Configuração</h2>
      <ul className="mt-4 divide-y divide-borda">
        {itens.map(([rotulo, ok, valor]) => (
          <li key={rotulo} className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-semibold text-texto">{rotulo}</span>
            <span className="flex min-w-0 items-center gap-2 text-sm text-texto-suave">
              <span className="truncate">{valor}</span>
              {ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-sucesso" />
              ) : (
                <XCircle className="size-4 shrink-0 text-perigo" />
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-bloco bg-fundo px-4 py-3">
        <BotaoEmailTeste desabilitado={!pronto} />
        <span className="text-xs text-texto-suave">Vai para {usuario.email}.</span>
      </div>
      {!pronto && (
        <p className="mt-3 text-xs text-texto-suave">
          Cadastre as variáveis no .env.local (servidor do escritório) e na Vercel, e publique de novo.
        </p>
      )}
    </section>
  );
}
