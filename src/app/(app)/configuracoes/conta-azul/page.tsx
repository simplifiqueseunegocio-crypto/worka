import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink, Link2, Lock, PlugZap, XCircle } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { contaAzulConfigurada, situacaoConexao, urlRetorno } from "@/lib/integracoes/conta-azul";
import { AcoesContaAzul } from "@/components/conta-azul/acoes-conta-azul";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Conta Azul" };

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default function PaginaContaAzul({ searchParams }: PageProps<"/configuracoes/conta-azul">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto"
        >
          <ArrowLeft className="size-4" /> Configurações
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">INTEGRAÇÃO</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Conta Azul</h1>
        <p className="mt-3 max-w-2xl text-texto-suave">
          A Conta Azul é a fonte do cadastro de clientes: todo dia às 23:00 a plataforma lê os clientes ativos da conta
          do escritório, cadastra os novos, atualiza os dados e suspende quem saiu.
        </p>

        <Suspense
          fallback={
            <Esqueleto>
              <div className="brilho mt-8 h-64 rounded-card bg-superficie" />
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

async function Conteudo({ searchParams }: { searchParams: PageProps<"/configuracoes/conta-azul">["searchParams"] }) {
  const usuario = await getUsuario();
  if (!usuario.ativo || usuario.papel !== "admin") {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie p-6 text-sm text-texto-suave ring-1 ring-borda">
        <Lock className="size-5 shrink-0 text-destaque" />
        A integração com a Conta Azul é visível só para administradores.
      </div>
    );
  }

  const params = await searchParams;
  const erro = typeof params.erro === "string" ? params.erro.slice(0, 400) : null;
  const conectadoAgora = params.conectado === "1";
  const configurada = contaAzulConfigurada();
  const s = await situacaoConexao();
  const retorno = urlRetorno(process.env.APP_URL?.replace(/\/+$/, "") || "https://SEU-ENDERECO");

  return (
    <div className="entrada mt-8 flex max-w-3xl flex-col gap-4">
      {erro && (
        <p role="alert" className="flex items-start gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {erro}
        </p>
      )}
      {conectadoAgora && (
        <p role="status" className="flex items-start gap-2 rounded-bloco bg-sucesso-suave px-4 py-3 text-sm font-medium text-sucesso">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> Conta Azul conectada. Rode a primeira sincronização abaixo.
        </p>
      )}

      <section className="rounded-card bg-superficie p-6 ring-1 ring-borda">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`grid size-11 place-items-center rounded-xl ${s.conectada ? "bg-sucesso-suave text-sucesso" : "bg-suave text-texto-suave"}`}
            >
              {s.conectada ? <Link2 className="size-5" /> : <PlugZap className="size-5" />}
            </span>
            <div>
              <h2 className="text-lg font-bold text-texto">{s.conectada ? "Conectada" : "Não conectada"}</h2>
              <p className="text-sm text-texto-suave">
                {s.conectada
                  ? [s.contaNome, s.conectadoEm && `desde ${dataHora.format(new Date(s.conectadoEm))}`, s.conectadoPor && `por ${s.conectadoPor}`]
                      .filter(Boolean)
                      .join(" · ")
                  : "Conecte a conta Conta Azul do escritório para trazer os clientes."}
              </p>
            </div>
          </div>
          {configurada && (
            // Link comum (não <Link>): a rota redireciona para o login da Conta Azul.
            <a
              href="/api/integracoes/conta-azul/conectar"
              className={`flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition-colors ${
                s.conectada
                  ? "text-texto ring-1 ring-borda hover:bg-suave"
                  : "bg-primaria text-sobre-primaria hover:bg-primaria-hover"
              }`}
            >
              <ExternalLink className="size-4" /> {s.conectada ? "Reconectar" : "Conectar Conta Azul"}
            </a>
          )}
        </div>

        {s.conectada && (
          <div className="mt-6 border-t border-borda pt-5">
            <AcoesContaAzul />
          </div>
        )}
      </section>

      <section className="rounded-card bg-superficie p-6 ring-1 ring-borda">
        <h2 className="text-lg font-bold text-texto">Configuração do servidor</h2>
        <ul className="mt-3 divide-y divide-borda text-sm">
          {(
            [
              ["CONTA_AZUL_CLIENT_ID", Boolean(process.env.CONTA_AZUL_CLIENT_ID)],
              ["CONTA_AZUL_CLIENT_SECRET", Boolean(process.env.CONTA_AZUL_CLIENT_SECRET)],
              ["CRON_SECRET (sincronização diária)", Boolean(process.env.CRON_SECRET)],
            ] as const
          ).map(([nome, ok]) => (
            <li key={nome} className="flex items-center justify-between gap-4 py-3">
              <span className="font-semibold text-texto">{nome}</span>
              <span className="flex items-center gap-2 text-texto-suave">
                {ok ? "Cadastrada" : "Não cadastrada"}
                {ok ? <CheckCircle2 className="size-4 text-sucesso" /> : <XCircle className="size-4 text-perigo" />}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-bloco bg-fundo px-4 py-3 text-xs text-texto-suave">
          <p className="font-semibold text-texto">URL de redirecionamento</p>
          <p className="mt-1">Cadastre exatamente este endereço no seu aplicativo do Portal do Desenvolvedor da Conta Azul:</p>
          <code className="mt-2 block break-all rounded bg-suave px-2 py-1.5 text-texto">{retorno}</code>
        </div>
        <p className="mt-4 text-xs text-texto-suave">
          O histórico de cada sincronização fica em{" "}
          <Link href="/configuracoes/sincronizacao" className="font-semibold text-destaque hover:underline">
            Log de sincronização
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
