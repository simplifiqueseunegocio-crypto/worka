import Link from "next/link";
import { Building2, FolderOpen, LayoutDashboard, ListChecks, Receipt, ShieldCheck, Users, type LucideIcon } from "lucide-react";

export const ABAS = [
  { chave: "visao", rotulo: "Visão geral", icone: LayoutDashboard },
  { chave: "tarefas", rotulo: "Tarefas", icone: ListChecks },
  { chave: "certidoes", rotulo: "Certidões", icone: ShieldCheck },
  { chave: "fiscal", rotulo: "Fiscal e financeiro", icone: Receipt },
  { chave: "pessoal", rotulo: "Pessoal", icone: Users },
  { chave: "documentos", rotulo: "Documentos e vencimentos", icone: FolderOpen },
  { chave: "cadastro", rotulo: "Cadastro", icone: Building2 },
] as const satisfies readonly { chave: string; rotulo: string; icone: LucideIcon }[];

export type Aba = (typeof ABAS)[number]["chave"];
export const lerAba = (v: unknown): Aba => (ABAS.some((a) => a.chave === v) ? (v as Aba) : "visao");

// Abas do painel do cliente (?aba=...), roláveis no celular.
export function AbasCliente({ ativa, alertas }: { ativa: Aba; alertas?: Partial<Record<Aba, number>> }) {
  return (
    <nav aria-label="Seções do cliente" className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max min-w-full gap-1 border-b border-borda">
        {ABAS.map(({ chave, rotulo, icone: Icone }) => {
          const atual = chave === ativa;
          const n = alertas?.[chave];
          return (
            <li key={chave}>
              <Link
                href={chave === "visao" ? "?" : `?aba=${chave}`}
                scroll={false}
                aria-current={atual ? "page" : undefined}
                className={`relative flex h-11 items-center gap-2 px-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  atual ? "text-texto" : "text-texto-suave hover:text-texto"
                }`}
              >
                <Icone className={`size-4 ${atual ? "text-destaque" : ""}`} />
                {rotulo}
                {n ? <span className="rounded-full bg-perigo-suave px-1.5 text-[11px] font-bold text-perigo tabular-nums">{n}</span> : null}
                {atual && <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-primaria" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
