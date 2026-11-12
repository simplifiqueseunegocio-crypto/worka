import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlertCircle, HandCoins, MailWarning } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import {
  AdiantamentoIndisponivel,
  listarEnviosAdiantamento,
  podeEnviarAdiantamento,
  type EnvioAdiantamento,
} from "@/lib/adiantamento";
import { emailConfigurado } from "@/lib/email";
import { competenciasRecentes, hojeISO } from "@/lib/tarefas";
import { EnvioFolhas } from "@/components/adiantamento/envio-folhas";
import { SeletorCompetencia } from "@/components/ui/seletor-competencia";
import { Contador } from "@/components/ui/contador";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Folha de adiantamento" };

export default function Pagina({ searchParams }: PageProps<"/adiantamento">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <Suspense
          fallback={
            <Esqueleto>
              <Carregando />
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

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

async function Conteudo({ searchParams }: { searchParams: PageProps<"/adiantamento">["searchParams"] }) {
  // O mês padrão depende da data de hoje: calcula na requisição, não no prerender.
  await connection();
  const params = await searchParams;
  const pedida = Array.isArray(params.competencia) ? params.competencia[0] : params.competencia;
  // O adiantamento é pago dentro do próprio mês: a competência padrão é a atual.
  const competencia = pedida && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedida) ? pedida : hojeISO().slice(0, 7);

  const usuario = await getUsuario();
  let envios: EnvioAdiantamento[];
  try {
    envios = await listarEnviosAdiantamento(competencia);
  } catch (e) {
    if (e instanceof AdiantamentoIndisponivel) return <NaoInstalado />;
    throw e;
  }
  const pode = await podeEnviarAdiantamento(usuario);

  const opcoes = competenciasRecentes();
  if (!opcoes.some((o) => o.valor === competencia)) {
    opcoes.unshift({ valor: competencia, rotulo: competencia.split("-").reverse().join("/") });
  }
  const rotuloLongo = opcoes.find((o) => o.valor === competencia)!.rotulo;
  const [a, m] = competencia.split("-");
  const rotulo = `${m}/${a}`;

  // Por cliente vale o envio mais recente (a lista vem do mais novo ao mais antigo).
  const ultimoPorCliente = new Map<string, EnvioAdiantamento>();
  for (const e of envios) if (!ultimoPorCliente.has(e.cliente.id)) ultimoPorCliente.set(e.cliente.id, e);
  const recebidos = [...ultimoPorCliente.values()];
  const comSucesso = new Set(envios.filter((e) => e.email_id).map((e) => e.cliente.id));
  const falhas = recebidos.filter((e) => e.erro && !comSucesso.has(e.cliente.id)).length;
  const ultimo = envios[0];
  const emailOk = emailConfigurado();

  const cartoes = [
    {
      rotulo: "Clientes que receberam",
      valor: comSucesso.size,
      detalhe: comSucesso.size ? `Folha de ${rotulo} enviada` : "Nenhum envio ainda",
      cor: "",
    },
    {
      rotulo: "Com falha",
      valor: falhas,
      detalhe: falhas ? "Envie de novo pela área acima" : "Nenhuma pendente",
      cor: falhas ? "text-perigo" : "",
    },
    {
      rotulo: "E-mails disparados",
      valor: envios.filter((e) => e.email_id).length,
      detalhe: ultimo ? `Último em ${dataHora.format(new Date(ultimo.enviado_em))}` : "—",
      cor: "",
    },
  ];

  return (
    <>
      <div className="entrada flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave uppercase">
            Departamento Pessoal · {rotuloLongo}
          </p>
          <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Folha de adiantamento</h1>
        </div>
        <SeletorCompetencia caminho="/adiantamento" competencia={competencia} opcoes={opcoes} />
      </div>

      {!emailOk && (
        <p className="mt-6 flex items-center gap-2 rounded-bloco bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">
          <MailWarning className="size-4 shrink-0" />O envio de e-mails não está configurado.{" "}
          {usuario.papel === "admin" ? (
            <Link href="/configuracoes/email" className="font-semibold underline">
              Configurar
            </Link>
          ) : (
            "Peça ao administrador."
          )}
        </p>
      )}

      <section aria-label="Resumo" className="mt-8 grid gap-3 sm:grid-cols-3">
        {cartoes.map((c, i) => (
          <div
            key={c.rotulo}
            className="animate-surgir rounded-card bg-superficie ring-1 ring-borda p-5"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className="block text-sm font-semibold text-texto-suave">{c.rotulo}</span>
            <span className={`mt-2 block text-3xl font-display tabular-nums ${c.cor || "text-texto"}`}>
              <Contador valor={c.valor} />
            </span>
            <span className="mt-1 block text-xs text-texto-suave">{c.detalhe}</span>
          </div>
        ))}
      </section>

      <div className="mt-4 animate-surgir" style={{ animationDelay: "150ms" }}>
        {pode ? (
          <EnvioFolhas competencia={competencia} rotulo={rotulo} jaEnviados={[...comSucesso]} />
        ) : (
          <p className="flex items-center gap-2 rounded-card bg-superficie ring-1 ring-borda px-5 py-4 text-sm text-texto-suave">
            <AlertCircle className="size-4 shrink-0 text-destaque" />O envio da folha é feito pelo Departamento Pessoal.
            Aqui você acompanha o que já foi enviado.
          </p>
        )}
      </div>

      <Historico envios={envios} rotulo={rotulo} />
    </>
  );
}

function Historico({ envios, rotulo }: { envios: EnvioAdiantamento[]; rotulo: string }) {
  return (
    <section
      className="mt-4 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6"
      style={{ animationDelay: "200ms" }}
      aria-labelledby="historico"
    >
      <h2 id="historico" className="text-lg font-bold text-texto">
        Envios de {rotulo}
      </h2>

      {envios.length === 0 ? (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-bloco bg-fundo px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-superficie text-destaque">
            <HandCoins className="size-6" strokeWidth={1.8} />
          </span>
          <p className="font-semibold text-texto">Nenhuma folha enviada nesta competência.</p>
          <p className="max-w-md text-sm text-texto-suave">
            Cada envio aparece aqui com os destinatários, quem enviou e quando.
          </p>
        </div>
      ) : (
        <div className="-mx-4 mt-3 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave">
                <th className="px-4 py-3 font-semibold sm:px-6">CLIENTE</th>
                <th className="px-3 py-3 font-semibold">DESTINATÁRIOS</th>
                <th className="px-3 py-3 font-semibold">ENVIADO</th>
                <th className="px-4 py-3 font-semibold sm:px-6">SITUAÇÃO</th>
              </tr>
            </thead>
            <tbody>
              {envios.map((e, i) => (
                <tr
                  key={e.id}
                  className="animate-surgir border-t border-borda align-top transition-colors hover:bg-fundo"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <td className="max-w-[340px] px-4 py-3.5 sm:px-6">
                    <Link
                      href={`/clientes/${e.cliente.id}`}
                      className="block truncate font-semibold text-texto hover:text-destaque hover:underline"
                      title={e.cliente.razao_social}
                    >
                      {e.cliente.codigo_dominio !== null && (
                        <span className="font-medium text-texto-suave tabular-nums">{e.cliente.codigo_dominio} · </span>
                      )}
                      {e.cliente.fantasia || e.cliente.razao_social}
                    </Link>
                    <span className="block truncate text-xs text-texto-suave" title={e.arquivo_nome}>
                      {e.arquivo_nome}
                    </span>
                  </td>
                  <td className="max-w-[300px] px-3 py-3.5">
                    <span className="block truncate text-texto-suave" title={e.destinatarios.join(", ")}>
                      {e.destinatarios.join(", ")}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap">
                    <span className="block font-medium text-texto tabular-nums">
                      {dataHora.format(new Date(e.enviado_em))}
                    </span>
                    <span className="block text-xs text-texto-suave">{e.enviado_por?.nome ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3.5 sm:px-6">
                    {e.email_id ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sucesso-suave px-2.5 py-1 text-xs font-semibold text-sucesso">
                        <span className="size-1.5 rounded-full bg-current" /> Enviado
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-perigo-suave px-2.5 py-1 text-xs font-semibold text-perigo">
                          <span className="size-1.5 rounded-full bg-current" /> Falhou
                        </span>
                        {e.erro && (
                          <span className="mt-1.5 block max-w-[260px] text-xs text-texto-suave" title={e.erro}>
                            {e.erro}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NaoInstalado() {
  return (
    <section className="mt-4 flex flex-col items-start gap-3 rounded-card bg-superficie ring-1 ring-borda p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-xl bg-suave text-destaque">
        <HandCoins className="size-6" strokeWidth={1.8} />
      </span>
      <h1 className="font-display text-3xl text-texto">Folha de adiantamento</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-texto-suave">
        O módulo ainda não foi instalado no banco. Aplique a migration{" "}
        <code className="rounded bg-suave px-1.5 py-0.5 text-xs">20261103000000_adiantamento.sql</code> no SQL Editor do
        Supabase (ou com <code className="rounded bg-suave px-1.5 py-0.5 text-xs">supabase db push</code>).
      </p>
    </section>
  );
}

function Carregando() {
  return (
    <>
      <div className="h-[86px]" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="brilho h-[124px] rounded-card bg-superficie" />
        ))}
      </div>
      <div className="brilho mt-4 h-[260px] rounded-card bg-superficie" />
      <div className="brilho mt-4 h-[200px] rounded-card bg-superficie" />
    </>
  );
}
