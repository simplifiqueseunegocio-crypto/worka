import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { TransicaoPagina } from "@/components/ui/transicao";
import { MarcarNovidadeVista } from "@/components/novidades/novidade-vista";
import { novidades, type ItemNovidade, type TipoItem, type Versao } from "@/lib/novidades";

export const metadata: Metadata = { title: "Novidades" };

const tipos: Record<TipoItem, { rotulo: string; um: string; varios: string; chip: string }> = {
  novo: { rotulo: "Novo", um: "novidade", varios: "novidades", chip: "bg-sucesso-suave text-sucesso" },
  melhoria: { rotulo: "Melhoria", um: "melhoria", varios: "melhorias", chip: "bg-info-suave text-info" },
  correcao: { rotulo: "Correção", um: "correção", varios: "correções", chip: "bg-alerta-suave text-alerta" },
};

const dataLonga = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

export default function Novidades() {
  return (
    <TransicaoPagina>
      <MarcarNovidadeVista />
      <main className="mx-auto w-full max-w-[1000px] px-4 py-8 sm:px-8">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-suave hover:text-texto"
        >
          <ArrowLeft className="size-4" /> Configurações
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">PLATAFORMA</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Novidades</h1>
        <p className="mt-3 max-w-2xl text-sm text-texto-suave">O que mudou na plataforma a cada versão, da mais recente para a mais antiga.</p>

        <ol className="entrada relative mt-10 flex flex-col gap-8">
          {/* Linha do tempo */}
          <span aria-hidden className="absolute top-2 bottom-2 left-[5px] w-px bg-borda sm:left-[123px]" />
          {novidades.map((v, i) => (
            <EntradaVersao key={v.versao} versao={v} atual={i === 0} />
          ))}
        </ol>
      </main>
    </TransicaoPagina>
  );
}

function EntradaVersao({ versao: v, atual }: { versao: Versao; atual: boolean }) {
  const contagem = (Object.keys(tipos) as TipoItem[])
    .map((t) => [t, v.itens.filter((i) => i.tipo === t).length] as const)
    .filter(([, n]) => n > 0);

  return (
    <li className="relative grid gap-3 pl-6 sm:grid-cols-[100px_1fr] sm:gap-12 sm:pl-0">
      <span
        aria-hidden
        className={`absolute top-1.5 left-0 size-[11px] rounded-full ring-4 ring-fundo sm:left-[118px] ${atual ? "bg-primaria" : "bg-borda"}`}
      />
      <div className="sm:text-right">
        <p className="text-sm font-bold text-texto">Versão {v.versao}</p>
        <time dateTime={v.data} className="text-xs text-texto-suave">
          {dataLonga.format(new Date(`${v.data}T12:00:00Z`))}
        </time>
      </div>

      <article className={`rounded-card bg-superficie px-5 py-4 ring-1 ${atual ? "ring-primaria/40" : "ring-borda"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-texto">{v.titulo}</h2>
          {atual && <span className="rounded-full bg-primaria px-2 py-0.5 text-[11px] font-semibold text-sobre-primaria">Mais recente</span>}
        </div>
        <p className="mt-1 text-sm text-texto-suave">{v.resumo}</p>
        <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-texto-suave">
          {contagem.map(([t, n]) => (
            <span key={t}>
              {n} {n === 1 ? tipos[t].um : tipos[t].varios}
            </span>
          ))}
        </p>

        <ul className="mt-4 flex flex-col divide-y divide-borda border-t border-borda">
          {v.itens.map((item) => (
            <Item key={item.texto} item={item} />
          ))}
        </ul>
      </article>
    </li>
  );
}

function Item({ item }: { item: ItemNovidade }) {
  const t = tipos[item.tipo];
  const conteudo = (
    <>
      <span className={`mt-0.5 w-[74px] shrink-0 rounded-full py-0.5 text-center text-[11px] font-semibold ${t.chip}`}>{t.rotulo}</span>
      <span className="flex-1 text-sm leading-relaxed text-texto/90">{item.texto}</span>
      {item.href && <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-texto-suave opacity-0 transition-opacity group-hover:opacity-100" />}
    </>
  );
  return (
    <li>
      {item.href ? (
        <Link href={item.href} className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-fundo">
          {conteudo}
        </Link>
      ) : (
        <div className="flex items-start gap-3 py-2.5">{conteudo}</div>
      )}
    </li>
  );
}
