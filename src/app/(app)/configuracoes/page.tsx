import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, FileBadge, Mail, Megaphone, RefreshCw, ScrollText, ShieldCheck, Users } from "lucide-react";
import { TransicaoPagina } from "@/components/ui/transicao";
import { PontoNovidade } from "@/components/novidades/novidade-vista";

export const metadata: Metadata = { title: "Configurações" };

const secoes = [
  {
    href: "/configuracoes/novidades",
    titulo: "Novidades",
    descricao: "O que mudou na plataforma a cada versão: novidades, melhorias e correções.",
    icone: Megaphone,
    pronto: true,
    novidade: true,
  },
  {
    href: "/configuracoes/certificado",
    titulo: "Certificado digital",
    descricao: "O certificado A1 da empresa para baixar e instalar. A senha não fica na plataforma.",
    icone: ShieldCheck,
    pronto: true,
  },
  {
    href: "/configuracoes/sincronizacao",
    titulo: "Log de sincronização",
    descricao: "Execuções diárias da integração com o Domínio: o que entrou, mudou ou falhou.",
    icone: RefreshCw,
    pronto: true,
  },
  {
    href: "/configuracoes/email",
    titulo: "E-mail",
    descricao: "Envio de e-mails pelo Resend: remetente, chave da API e e-mail de teste.",
    icone: Mail,
    pronto: true,
  },
  {
    href: "/configuracoes/equipe",
    titulo: "Equipe",
    descricao: "Criação de usuários, papéis, departamentos e envio do e-mail para definir a senha.",
    icone: Users,
    pronto: true,
  },
  {
    href: "/obrigacoes",
    titulo: "Catálogo de obrigações",
    descricao: "Prazos, metas internas e regimes de cada obrigação.",
    icone: ScrollText,
    pronto: true,
  },
  {
    href: "/configuracoes/certidoes",
    titulo: "Certidões",
    descricao: "Tipos de certidão acompanhados nos clientes: novos tipos, validade e quais valem para todos.",
    icone: FileBadge,
    pronto: true,
  },
  {
    href: "/configuracoes/feriados",
    titulo: "Feriados",
    descricao: "Feriados nacionais, estaduais e municipais usados no cálculo dos prazos.",
    icone: CalendarDays,
    pronto: true,
  },
];

export default function Configuracoes() {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">PLATAFORMA</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Configurações</h1>

        <ul className="entrada mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {secoes.map((s) => {
            const Icone = s.icone;
            const conteudo = (
              <>
                <span className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-suave text-destaque">
                    <Icone className="size-5" strokeWidth={1.8} />
                  </span>
                  {s.pronto ? (
                    <ArrowUpRight className="size-5 text-texto-suave opacity-0 transition-opacity group-hover:opacity-100" />
                  ) : (
                    <span className="rounded-full bg-suave px-2.5 py-1 text-[11px] font-semibold text-texto-suave">Em breve</span>
                  )}
                </span>
                <span className="mt-5 flex items-center gap-2 text-lg font-bold text-texto">
                  {s.titulo}
                  {"novidade" in s && s.novidade && <PontoNovidade ativo={false} />}
                </span>
                <span className="mt-1 block text-sm text-texto-suave">{s.descricao}</span>
              </>
            );
            return (
              <li key={s.titulo}>
                {s.href ? (
                  <Link
                    href={s.href}
                    className="group block h-full rounded-card bg-superficie p-6 ring-1 ring-borda transition hover:-translate-y-0.5 hover:shadow-elevado hover:ring-areia"
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <div className="h-full rounded-card bg-superficie/60 p-6">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </TransicaoPagina>
  );
}
