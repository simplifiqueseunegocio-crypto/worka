import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Info, Lock, Plus, XCircle } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { contaAzulConfigurada, listarConexoes, urlRetorno, type ConexaoResumo } from "@/lib/integracoes/conta-azul";
import { formatarDocumento } from "@/lib/formatar";
import { AcoesCliente, SincronizarTodos } from "@/components/conta-azul/acoes-conta-azul";
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
          Cada cliente tem a sua Conta Azul Pro. Conecte uma empresa e ela entra como cliente na plataforma; todo dia às
          23:00 o cadastro e os clientes e fornecedores dela são atualizados.
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
  const erro = typeof params.erro === "string" ? params.erro.slice(0, 500) : null;
  const conectado = typeof params.conectado === "string" ? params.conectado.slice(0, 200) : null;
  const novo = params.novo === "1";
  const configurada = contaAzulConfigurada();
  const conexoes = configurada ? await listarConexoes() : [];
  const retorno = urlRetorno(process.env.APP_URL?.replace(/\/+$/, "") || "https://SEU-ENDERECO");

  return (
    <div className="entrada mt-8 flex flex-col gap-4">
      {erro && (
        <p role="alert" className="flex max-w-4xl items-start gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {erro}
        </p>
      )}
      {conectado && (
        <p role="status" className="flex max-w-4xl items-start gap-2 rounded-bloco bg-sucesso-suave px-4 py-3 text-sm font-medium text-sucesso">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {conectado} conectada{novo ? " e cadastrada como cliente" : " ao cliente que já existia"}. A primeira leitura já foi feita.
        </p>
      )}

      <section className="rounded-card bg-superficie p-4 ring-1 ring-borda sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-texto">Empresas conectadas</h2>
            <p className="text-sm text-texto-suave">
              {conexoes.length ? `${conexoes.length} ${conexoes.length === 1 ? "empresa" : "empresas"}` : "Nenhuma empresa conectada ainda."}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            {conexoes.length > 0 && <SincronizarTodos />}
            {configurada && (
              // Link comum (não <Link>): a rota redireciona para o login da Conta Azul.
              <a
                href="/api/integracoes/conta-azul/conectar"
                className="flex h-10 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
              >
                <Plus className="size-4" /> Adicionar empresa
              </a>
            )}
          </div>
        </div>

        {conexoes.length > 0 && (
          <div className="-mx-4 mt-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-[11px] font-semibold tracking-[0.12em] text-texto-suave uppercase">
                  <th className="px-4 py-2 font-semibold sm:px-6">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Clientes e fornecedores</th>
                  <th className="px-3 py-2 font-semibold">Última leitura</th>
                  <th className="px-4 py-2 text-right font-semibold sm:px-6">Ações</th>
                </tr>
              </thead>
              <tbody>
                {conexoes.map((c) => (
                  <Linha key={c.clienteId} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="max-w-4xl rounded-card bg-superficie p-6 ring-1 ring-borda">
        <h2 className="flex items-center gap-2 text-lg font-bold text-texto">
          <Info className="size-5 text-destaque" /> Como conectar uma empresa
        </h2>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-texto-suave">
          <li>
            Na Conta Azul Pro do cliente (pela Conta Azul Mais), crie um <strong className="text-texto">usuário para o escritório</strong>{" "}
            em Configurações → Usuários. A Conta Azul não aceita o mesmo e-mail em duas empresas: use um por cliente, por
            exemplo <code className="rounded bg-suave px-1 text-texto">integracao+nomedocliente@gmail.com</code> (no Gmail, tudo
            chega na mesma caixa).
          </li>
          <li>Abra o convite que chega nesse e-mail e crie a senha.</li>
          <li>
            Aqui, clique em <strong className="text-texto">Adicionar empresa</strong> e entre com esse usuário.{" "}
            <strong className="text-texto">Use uma janela anônima</strong> a cada empresa, para a Conta Azul não reaproveitar o
            login da anterior.
          </li>
          <li>A empresa vira cliente da plataforma (ou é vinculada ao cliente com o mesmo CNPJ) e a primeira leitura é feita na hora.</li>
        </ol>
      </section>

      <section className="max-w-4xl rounded-card bg-superficie p-6 ring-1 ring-borda">
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
          O resumo de cada rodada fica em{" "}
          <Link href="/configuracoes/sincronizacao" className="font-semibold text-destaque hover:underline">
            Log de sincronização
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

function Linha({ c }: { c: ConexaoResumo }) {
  return (
    <tr className="border-t border-borda align-top">
      <td className="px-4 py-3 sm:px-6">
        <Link href={`/clientes/${c.clienteId}`} className="font-semibold text-texto hover:text-destaque hover:underline">
          {c.cliente}
        </Link>
        <span className="block text-xs text-texto-suave">
          {[c.empresa !== c.cliente ? c.empresa : null, c.documento ? formatarDocumento(c.documento) : null].filter(Boolean).join(" · ")}
        </span>
        {c.erro && (
          <span className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-perigo">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {c.erro}
          </span>
        )}
      </td>
      <td className="px-3 py-3 tabular-nums text-texto">{c.pessoas.toLocaleString("pt-BR")}</td>
      <td className="px-3 py-3 text-texto-suave tabular-nums">
        {c.sincronizadoEm ? dataHora.format(new Date(c.sincronizadoEm)) : "Ainda não"}
        <span className="block text-xs">conectada em {dataHora.format(new Date(c.conectadoEm))}</span>
      </td>
      <td className="px-4 py-3 sm:px-6">
        <AcoesCliente clienteId={c.clienteId} nome={c.cliente} />
      </td>
    </tr>
  );
}
