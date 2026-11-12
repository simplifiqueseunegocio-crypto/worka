import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { listarEquipe, type Membro } from "@/lib/equipe";
import { rotulosPapel } from "@/lib/papeis";
import { listarDepartamentos } from "@/lib/tarefas";
import {
  AcessoMembro,
  CadastrarPessoa,
  DepartamentosMembro,
  PapelMembro,
  RedefinirSenha,
} from "@/components/equipe/equipe";
import { Contador } from "@/components/ui/contador";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";

export const metadata: Metadata = { title: "Equipe" };

export default function PaginaEquipe() {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto"
        >
          <ArrowLeft className="size-4" /> Configurações
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">ACESSO</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Equipe</h1>
        <p className="mt-3 max-w-2xl text-texto-suave">
          Quem acessa a plataforma, com qual papel e em quais departamentos.
        </p>

        <Suspense
          fallback={
            <Esqueleto>
              <Carregando />
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

// ---------------------------------------------------------------------------

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes.at(-1)![0] : "")).toUpperCase();
}

async function Conteudo() {
  const usuario = await getUsuario();
  const admin = usuario.ativo && usuario.papel === "admin";
  const [equipe, departamentos] = await Promise.all([listarEquipe(admin), listarDepartamentos()]);
  const deps = departamentos.map(({ id, nome, cor }) => ({ id, nome, cor }));

  const ativos = equipe.filter((m) => m.ativo);
  const cartoes = [
    { rotulo: "Pessoas ativas", valor: ativos.length, destaque: true },
    { rotulo: "Administradores", valor: ativos.filter((m) => m.papel === "admin").length },
    { rotulo: "Gestores", valor: ativos.filter((m) => m.papel === "gestor").length },
    { rotulo: "Colaboradores", valor: ativos.filter((m) => m.papel === "colaborador").length },
    { rotulo: "Desativadas", valor: equipe.length - ativos.length },
  ];
  const semDepartamento = ativos.filter((m) => m.papel === "gestor" && m.departamentos.length === 0);

  return (
    <>
      <section aria-label="Resumo" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {cartoes.map((c, i) => (
          <div
            key={c.rotulo}
            className={`animate-surgir rounded-card p-5 ${c.destaque ? "col-span-2 bg-escuro text-white sm:col-span-1" : "bg-superficie"}`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className={`block text-sm font-semibold ${c.destaque ? "text-texto-inverso-suave" : "text-texto-suave"}`}>
              {c.rotulo}
            </span>
            <span
              className={`mt-2 block text-3xl font-display tabular-nums ${c.destaque ? "text-white" : "text-texto"}`}
            >
              <Contador valor={c.valor} />
            </span>
          </div>
        ))}
      </section>

      {admin ? (
        <CadastrarPessoa departamentos={deps} />
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-card bg-superficie p-5 text-sm text-texto-suave">
          <Lock className="size-5 shrink-0 text-destaque" />
          Só administradores cadastram pessoas e alteram papéis, departamentos e acessos.
        </div>
      )}

      {admin && semDepartamento.length > 0 && (
        <p className="mt-4 rounded-bloco bg-alerta-suave px-4 py-3 text-sm text-alerta">
          <strong className="font-semibold">
            {semDepartamento.map((m) => m.nome.split(" ")[0]).join(", ")}
          </strong>{" "}
          {semDepartamento.length === 1 ? "é gestor" : "são gestores"} sem departamento: marque ao menos um para que
          possa gerir as tarefas.
        </p>
      )}

      <section className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6">
        <h2 className="text-lg font-bold text-texto">Pessoas</h2>
        <div className="-mx-4 mt-3 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave">
                <th className="px-4 py-3 font-semibold sm:px-6">PESSOA</th>
                <th className="px-3 py-3 font-semibold">PAPEL</th>
                <th className="px-3 py-3 font-semibold">DEPARTAMENTOS</th>
                {admin && <th className="px-3 py-3 font-semibold">ÚLTIMO ACESSO</th>}
                <th className="px-3 py-3 font-semibold">ACESSO</th>
                {admin && (
                  <th className="px-4 py-3 sm:px-6">
                    <span className="sr-only">Senha</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {equipe.map((m, i) => (
                <Linha key={m.id} membro={m} indice={i} admin={admin} proprio={m.id === usuario.id} deps={deps} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Linha({
  membro: m,
  indice,
  admin,
  proprio,
  deps,
}: {
  membro: Membro;
  indice: number;
  admin: boolean;
  proprio: boolean;
  deps: { id: number; nome: string; cor: string }[];
}) {
  return (
    <tr
      className={`animate-surgir border-t border-borda align-top transition-colors hover:bg-fundo ${m.ativo ? "" : "bg-fundo/60"}`}
      style={{ animationDelay: `${Math.min(indice, 12) * 25}ms` }}
    >
      <td className="px-4 py-3.5 sm:px-6">
        <span className={`flex items-center gap-3 ${m.ativo ? "" : "opacity-60"}`}>
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
              proprio ? "bg-realce text-texto" : "bg-suave text-destaque"
            }`}
            aria-hidden="true"
          >
            {iniciais(m.nome)}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-texto">
              {m.nome}
              {proprio && <span className="ml-2 text-xs font-medium text-texto-suave">(você)</span>}
            </span>
            <span className="block truncate text-xs text-texto-suave">{m.email}</span>
          </span>
        </span>
      </td>
      <td className="px-3 py-3.5">
        {admin ? (
          <PapelMembro id={m.id} papel={m.papel} proprio={proprio} />
        ) : (
          <span className="font-medium text-texto">{rotulosPapel[m.papel].rotulo}</span>
        )}
      </td>
      <td className="px-3 py-3.5">
        {admin ? (
          <DepartamentosMembro id={m.id} marcados={m.departamentos} departamentos={deps} />
        ) : m.departamentos.length ? (
          <span className="flex flex-wrap gap-1.5">
            {deps
              .filter((d) => m.departamentos.includes(d.id))
              .map((d) => (
                <span key={d.id} className="flex h-7 items-center gap-1.5 rounded-full bg-suave px-2.5 text-xs font-semibold">
                  <span className="size-2 rounded-full" style={{ background: d.cor }} aria-hidden="true" />
                  {d.nome}
                </span>
              ))}
          </span>
        ) : (
          <span className="text-texto-suave">—</span>
        )}
      </td>
      {admin && (
        <td className="px-3 py-3.5 whitespace-nowrap">
          {m.ultimoAcesso ? (
            <span className="tabular-nums">{dataHora.format(new Date(m.ultimoAcesso))}</span>
          ) : (
            <span className="text-xs font-semibold text-alerta">Nunca entrou</span>
          )}
        </td>
      )}
      <td className="px-3 py-3.5">
        {admin ? (
          <AcessoMembro id={m.id} ativo={m.ativo} proprio={proprio} />
        ) : (
          <span className={`text-sm font-semibold ${m.ativo ? "text-sucesso" : "text-texto-suave"}`}>
            {m.ativo ? "Ativo" : "Desativado"}
          </span>
        )}
      </td>
      {admin && (
        <td className="px-4 py-3 text-right sm:px-6">
          {m.ativo && <RedefinirSenha id={m.id} nome={m.nome} />}
        </td>
      )}
    </tr>
  );
}

function Carregando() {
  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="brilho h-[96px] rounded-card bg-superficie" />
        ))}
      </div>
      <div className="brilho mt-4 h-[92px] rounded-card bg-superficie" />
      <div className="mt-4 rounded-card bg-superficie ring-1 ring-borda p-6">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="brilho h-16 rounded-bloco bg-fundo" />
          ))}
        </div>
      </div>
    </>
  );
}
