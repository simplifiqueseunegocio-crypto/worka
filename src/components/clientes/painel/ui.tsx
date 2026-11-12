import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Lock } from "lucide-react";

// Peças comuns do painel do cliente.

export function Cartao({
  titulo,
  subtitulo,
  icone: Icone,
  acao,
  className = "",
  children,
}: {
  titulo: string;
  subtitulo?: string;
  icone?: LucideIcon;
  acao?: { href: string; rotulo: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-card bg-superficie ring-1 ring-borda p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icone && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-suave">
              <Icone className="size-4 text-destaque" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-texto">{titulo}</h2>
            {subtitulo && <p className="text-xs text-texto-suave">{subtitulo}</p>}
          </div>
        </div>
        {acao && (
          <Link href={acao.href} className="inline-flex items-center gap-1 text-xs font-semibold text-destaque hover:underline">
            {acao.rotulo} <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-bloco bg-fundo px-4 py-5 text-center text-sm text-texto-suave">{children}</p>;
}

export function SemAcesso({ quem }: { quem: string }) {
  return (
    <p className="flex items-center gap-2 rounded-bloco bg-fundo px-4 py-5 text-sm text-texto-suave">
      <Lock className="size-4 shrink-0 text-destaque" /> Visível só para {quem}.
    </p>
  );
}

export function NaoInstalado({ modulo }: { modulo: string }) {
  return <Vazio>O módulo {modulo} ainda não foi instalado no banco (migration pendente).</Vazio>;
}

const TONS = {
  neutro: "bg-suave text-destaque",
  erro: "bg-perigo-suave text-perigo",
  aviso: "bg-alerta-suave text-alerta",
  ok: "bg-sucesso-suave text-sucesso",
} as const;

// Número de destaque da visão geral, que leva para a aba do assunto.
export function Indicador({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  tom = "neutro",
  href,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string;
  detalhe?: string;
  tom?: keyof typeof TONS;
  href: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className="group flex min-w-0 items-start gap-3 rounded-card bg-superficie ring-1 ring-borda p-4 transition hover:-translate-y-0.5 hover:shadow-elevado"
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${TONS[tom]}`}>
        <Icone className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold tracking-[0.12em] text-texto-suave uppercase">{rotulo}</span>
        <span className="mt-0.5 block truncate text-xl font-bold text-texto tabular-nums">{valor}</span>
        {detalhe && <span className={`block truncate text-xs ${tom === "erro" ? "font-semibold text-perigo" : "text-texto-suave"}`}>{detalhe}</span>}
      </span>
    </Link>
  );
}

export function Chip({ tom = "neutro", children }: { tom?: keyof typeof TONS; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONS[tom]}`}>{children}</span>;
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const real = (v: number | string | null | undefined) => (v === null || v === undefined ? "—" : moeda.format(Number(v)));
export const dataBR = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
export const mesBR = (iso: string | null | undefined) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const dataHora = (iso: string) => dataHoraFmt.format(new Date(iso));
export const diasAte = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
