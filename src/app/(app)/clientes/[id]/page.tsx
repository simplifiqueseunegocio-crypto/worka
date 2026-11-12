import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, Hash, MapPin, RefreshCw } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { contatosDoCliente, impactoExclusao, obterCliente, type ClienteDetalhe, type Regime } from "@/lib/clientes";
import { podeEnviarAdiantamento } from "@/lib/adiantamento";
import { certidoesDoCliente } from "@/lib/certidoes";
import { hojeISO } from "@/lib/tarefas";
import { CndIndisponivel, TIPOS_CND, cndDoCliente } from "@/lib/cnd";
import { podeUsarPonto } from "@/lib/ponto";
import { podeUsarDocumento } from "@/lib/documentos/dados";
import { formatarDocumento, formatarMunicipio } from "@/lib/formatar";
import { ConsultarCliente, InterruptorBuscaCnd } from "@/components/cnd/acoes-cnd";
import { DISPENSADA, SEM_COBERTURA, SituacaoClienteChip, StatusCndIcone } from "@/components/cnd/situacao-cnd";
import { CertidoesCliente } from "@/components/certidoes/certidoes-cliente";
import { Contatos } from "@/components/clientes/contatos";
import { SituacaoCliente } from "@/components/clientes/situacao-cliente";
import { AbasCliente, lerAba, type Aba } from "@/components/clientes/painel/abas";
import { VisaoGeral } from "@/components/clientes/painel/visao-geral";
import { AbaTarefas } from "@/components/clientes/painel/aba-tarefas";
import { AbaFiscal } from "@/components/clientes/painel/aba-fiscal";
import { AbaPessoal } from "@/components/clientes/painel/aba-pessoal";
import { AbaDocumentos } from "@/components/clientes/painel/aba-documentos";
import { AbaCadastro } from "@/components/clientes/painel/aba-cadastro";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Cliente" };

type Props = PageProps<"/clientes/[id]">;

// Painel do cliente: cabeçalho e abas (?aba=). Cada aba junta o que os
// módulos da plataforma sabem do cliente (lib/cliente-painel.ts).
export default function PaginaCliente({ params, searchParams }: Props) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <Link href="/clientes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto">
          <ArrowLeft className="size-4" /> Clientes
        </Link>
        <Suspense
          fallback={
            <Esqueleto>
              <Carregando />
            </Esqueleto>
          }
        >
          <Revelar>
            <Conteudo params={params} searchParams={searchParams} />
          </Revelar>
        </Suspense>
      </main>
    </TransicaoPagina>
  );
}

const REGIMES: Record<Regime, { rotulo: string; classe: string }> = {
  simples: { rotulo: "Simples Nacional", classe: "bg-info-suave text-info" },
  presumido: { rotulo: "Lucro Presumido", classe: "bg-alerta-suave text-alerta" },
  real: { rotulo: "Lucro Real", classe: "bg-info-suave text-info" },
  mei: { rotulo: "MEI", classe: "bg-sucesso-suave text-sucesso" },
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

async function Conteudo({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const aba = lerAba(sp.aba);
  const [cliente, usuario] = await Promise.all([obterCliente(id), getUsuario()]);
  if (!cliente) notFound();
  await connection();
  const gestor = usuario.papel === "admin" || usuario.papel === "gestor";
  // A exclusão só aparece para o admin e com o cliente fora de atividade.
  const impacto = usuario.papel === "admin" && cliente.status !== "ativo" ? await impactoExclusao(cliente.id) : null;
  const regime = cliente.regime ? REGIMES[cliente.regime] : null;

  return (
    <>
      <div className="entrada mt-4">
        <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">
          CLIENTE{cliente.status !== "ativo" && ` · ${cliente.status.toUpperCase()}`}
        </p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-4xl">{cliente.razao_social}</h1>
        {cliente.fantasia && cliente.fantasia !== cliente.razao_social && <p className="mt-2 text-texto-suave">{cliente.fantasia}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-texto-suave">
          <span className="font-semibold text-texto tabular-nums">{formatarDocumento(cliente.documento, cliente.tipo_inscricao)}</span>
          {regime && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${regime.classe}`}>{regime.rotulo}</span>}
          {cliente.codigo_dominio !== null && (
            <span className="inline-flex items-center gap-1">
              <Hash className="size-3.5" /> Domínio {cliente.codigo_dominio}
            </span>
          )}
          {cliente.municipio && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {formatarMunicipio(cliente.municipio, cliente.uf)}
            </span>
          )}
        </div>
        <SituacaoCliente
          clienteId={cliente.id}
          nome={cliente.fantasia || cliente.razao_social}
          status={cliente.status}
          statusManual={cliente.status_manual ?? false}
          doDominio={cliente.codigo_dominio !== null}
          podeAlterar={gestor}
          impacto={impacto}
        />
      </div>

      <AbasCliente ativa={aba} />

      <div className="mt-6">
        <Suspense key={aba} fallback={<CarregandoAba />}>
          <ConteudoAba aba={aba} cliente={cliente} usuario={usuario} gestor={gestor} />
        </Suspense>
      </div>
    </>
  );
}

async function ConteudoAba({
  aba,
  cliente,
  usuario,
  gestor,
}: {
  aba: Aba;
  cliente: ClienteDetalhe;
  usuario: Awaited<ReturnType<typeof getUsuario>>;
  gestor: boolean;
}) {
  switch (aba) {
    case "tarefas":
      return <AbaTarefas clienteId={cliente.id} busca={cliente.documento} />;
    case "certidoes":
      return <AbaCertidoes cliente={cliente} usuarioId={usuario.id} gestor={gestor} />;
    case "fiscal": {
      const [nfse, guia, comprovante] = await Promise.all([
        podeUsarDocumento(usuario, "nfse"),
        podeUsarDocumento(usuario, "guia"),
        podeUsarDocumento(usuario, "comprovante"),
      ]);
      return <AbaFiscal clienteId={cliente.id} acesso={{ nfse, guia, comprovante }} />;
    }
    case "pessoal":
      return <AbaPessoal clienteId={cliente.id} acessoDp={await podeUsarPonto(usuario)} />;
    case "documentos":
      return <AbaDocumentos clienteId={cliente.id} />;
    case "cadastro": {
      const [contatos, doPessoal] = await Promise.all([contatosDoCliente(cliente.id), podeEnviarAdiantamento(usuario)]);
      return (
        <AbaCadastro
          cliente={cliente}
          contatos={
            contatos ? (
              <Contatos clienteId={cliente.id} contatos={contatos} emailCadastro={cliente.email} podeAlterar={doPessoal || usuario.papel === "gestor"} />
            ) : (
              <>
                <h2 className="text-lg font-bold text-texto">Contatos</h2>
                <p className="mt-1 text-sm text-texto-suave">Aplique a migration do adiantamento no banco para cadastrar os contatos.</p>
              </>
            )
          }
        />
      );
    }
    default:
      return <VisaoGeral clienteId={cliente.id} busca={cliente.documento} />;
  }
}

async function AbaCertidoes({ cliente, usuarioId, gestor }: { cliente: ClienteDetalhe; usuarioId: string; gestor: boolean }) {
  const certidoes = await certidoesDoCliente(cliente.id);
  return (
    <div className="grid gap-4">
      <section className="min-w-0 rounded-card bg-superficie ring-1 ring-borda p-6">
        <SecaoCnd cliente={cliente} podeAlterar={gestor} />
      </section>
      <section id="certidoes" className="min-w-0 scroll-mt-6 rounded-card bg-superficie ring-1 ring-borda p-6">
        {certidoes ? (
          <CertidoesCliente clienteId={cliente.id} tipos={certidoes.tipos} certidoes={certidoes.certidoes} hoje={hojeISO()} usuarioId={usuarioId} gestor={gestor} />
        ) : (
          <>
            <h2 className="text-lg font-bold text-texto">Certidões emitidas</h2>
            <p className="mt-1 text-sm text-texto-suave">Aplique a migration das certidões no banco para lançar certidões.</p>
          </>
        )}
      </section>
    </div>
  );
}

async function SecaoCnd({ cliente, podeAlterar }: { cliente: ClienteDetalhe; podeAlterar: boolean }) {
  let cnd;
  try {
    cnd = await cndDoCliente(cliente.id);
  } catch (e) {
    if (e instanceof CndIndisponivel) {
      return <p className="text-sm text-texto-suave">O módulo de CND ainda não foi instalado no banco.</p>;
    }
    throw e;
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-texto">Certidões (CND)</h2>
          <p className="text-sm text-texto-suave">
            Todo dia 23 com a busca ligada · ou pelo botão (estadual e municipal em até 10 minutos; federal e FGTS nos dias úteis às 9h, 13h e
            16h)
          </p>
        </div>
        {cnd && <SituacaoClienteChip situacao={cnd.situacao} />}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-bloco bg-fundo px-4 py-3">
        <InterruptorBuscaCnd clienteId={cliente.id} ativo={cliente.busca_cnd} podeAlterar={podeAlterar} />
        {cliente.status === "ativo" && <ConsultarCliente clienteId={cliente.id} icone={<RefreshCw className="size-4" />} />}
      </div>

      <ul className="mt-5 grid gap-x-8 divide-y divide-borda md:grid-cols-2 md:divide-y-0">
        {TIPOS_CND.map((t) => (
          <li key={t.tipo} className="flex items-center justify-between gap-4 py-3 md:border-b md:border-borda">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-texto">{t.rotulo}</span>
              <span className="block truncate text-xs text-texto-suave">
                {cnd?.mensagens?.[t.tipo] ?? (cnd?.[t.tipo] === "sem_cobertura" ? SEM_COBERTURA : cnd?.[t.tipo] === "dispensada" ? DISPENSADA : t.descricao)}
              </span>
            </span>
            <StatusCndIcone status={cnd?.[t.tipo] ?? null} comRotulo />
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-texto-suave">
        {cnd?.na_fila
          ? "Consulta na fila do worker."
          : cnd?.consultado_em
            ? `Última consulta em ${dataHora.format(new Date(cnd.consultado_em))}.`
            : "Ainda não consultado."}
      </p>
    </>
  );
}

function CarregandoAba() {
  return (
    <Esqueleto>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="brilho h-20 rounded-card bg-superficie" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="brilho h-80 rounded-card bg-superficie xl:col-span-2" />
        <div className="brilho h-80 rounded-card bg-superficie" />
      </div>
    </Esqueleto>
  );
}

function Carregando() {
  return (
    <>
      <div className="mt-4 h-32" />
      <div className="brilho mt-6 h-11 rounded-bloco bg-superficie" />
      <div className="mt-6">
        <CarregandoAba />
      </div>
    </>
  );
}
