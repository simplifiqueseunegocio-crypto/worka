"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, ViewTransition, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/marca/logo";
import { PontoNovidade } from "@/components/novidades/novidade-vista";
import { SeletorTema } from "./seletor-tema";
import { departamentos, navPrincipal, navRodape, type ItemNav } from "./navegacao";

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// abertas: contador de tarefas abertas de cada departamento, por slug (vem do servidor).
export function Sidebar({ usuario, abertas }: { usuario: ReactNode; abertas: Record<string, ReactNode> }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      {/* Celular e tablet: barra superior + gaveta */}
      <header
        className="tema-escuro sticky top-0 z-30 flex h-14 items-center justify-between border-b border-borda bg-lateral px-4 text-texto lg:hidden"
        style={{ viewTransitionName: "barra-movel" }}
      >
        <Link href="/" aria-label="Início" className="rounded-lg">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="grid size-10 place-items-center rounded-lg text-texto hover:bg-suave"
          aria-label="Abrir menu"
          aria-expanded={aberto}
          aria-controls="menu-movel"
        >
          <Menu className="size-5" />
        </button>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-escuro/40 backdrop-blur-sm transition-opacity lg:hidden ${
          aberto ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setAberto(false)}
        aria-hidden="true"
      />
      <div
        id="menu-movel"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!aberto}
        onKeyDown={(e) => e.key === "Escape" && setAberto(false)}
        className={`tema-escuro fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-borda bg-lateral text-texto shadow-modal transition-transform duration-300 ease-out lg:hidden ${
          aberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Logo />
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="grid size-10 place-items-center rounded-lg text-texto-suave hover:bg-suave hover:text-texto"
            aria-label="Fechar menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <Conteudo usuario={usuario} abertas={abertas} aoNavegar={() => setAberto(false)} />
      </div>

      {/* Desktop: barra lateral fixa */}
      {/* Nome fixo: fica parado durante a transição entre módulos (globals.css). */}
      <aside
        className="tema-escuro sticky top-0 z-30 hidden h-screen w-[256px] shrink-0 flex-col border-r border-borda bg-lateral text-texto lg:flex"
        style={{ viewTransitionName: "menu-lateral" }}
      >
        <div className="flex h-16 items-center px-5">
          <Link href="/" aria-label="Início" className="rounded-lg">
            <Logo />
          </Link>
        </div>
        <Conteudo usuario={usuario} abertas={abertas} indicador />
      </aside>
    </>
  );
}

function Secao({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.08em] text-texto-suave uppercase">{children}</p>
  );
}

function Conteudo({
  usuario,
  abertas,
  aoNavegar,
  indicador = false,
}: {
  usuario: ReactNode;
  abertas: Record<string, ReactNode>;
  aoNavegar?: () => void;
  indicador?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Principal" className="rolagem-discreta flex-1 overflow-x-hidden overflow-y-auto px-3 py-2">
        <Secao>Menu</Secao>
        <ul className="flex flex-col gap-0.5">
          {navPrincipal.map((item) => (
            <li key={item.href}>
              <LinkNavDaRota item={item} aoNavegar={aoNavegar} indicador={indicador} />
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <Secao>Departamentos</Secao>
          <ul className="flex flex-col gap-0.5">
            {departamentos.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/tarefas?departamento=${d.slug}&status=abertas&competencia=todas`}
                  onClick={aoNavegar}
                  className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-texto-suave transition-colors hover:bg-suave hover:text-texto"
                >
                  <span className="grid size-5 shrink-0 place-items-center" aria-hidden="true">
                    <span className="size-2 rounded-full" style={{ background: d.cor }} />
                  </span>
                  <span className="flex-1 truncate">{d.nome}</span>
                  {abertas[d.slug]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="border-t border-borda px-3 pt-2 pb-3">
        <ul className="flex flex-col gap-0.5">
          {navRodape.map((item) => (
            <li key={item.href}>
              <LinkNavDaRota item={item} aoNavegar={aoNavegar} indicador={indicador} />
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between px-3">
          <span className="text-xs text-texto-suave">Aparência</span>
          <SeletorTema />
        </div>
        {usuario}
      </div>
    </div>
  );
}

type PropsLinkNav = { item: ItemNav; aoNavegar?: () => void; indicador: boolean };

// Só os links leem a rota. Em páginas com parâmetro dinâmico (ex.: /clientes/[id])
// a rota só é conhecida na requisição: o link aparece sem destaque e o destaque
// chega com o conteúdo, sem bloquear a pré-renderização do resto do layout.
function LinkNavDaRota(props: PropsLinkNav) {
  return (
    <Suspense fallback={<LinkNav {...props} ativo={false} />}>
      <LinkNavComRota {...props} />
    </Suspense>
  );
}

function LinkNavComRota(props: PropsLinkNav) {
  const pathname = usePathname();
  return <LinkNav {...props} ativo={ativo(pathname, props.item.href)} />;
}

function LinkNav({
  item,
  ativo,
  aoNavegar,
  indicador,
}: {
  item: ItemNav;
  ativo: boolean;
  aoNavegar?: () => void;
  indicador: boolean;
}) {
  const Icone = item.icone;
  // Item ativo: cartão claro com um filete laranja à esquerda.
  const fundo = (
    <span className="absolute inset-0 rounded-lg bg-superficie shadow-[0_1px_2px_rgb(36_35_34/0.06)] ring-1 ring-borda">
      <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-primaria" />
    </span>
  );

  return (
    <Link
      href={item.href}
      onClick={aoNavegar}
      aria-current={ativo ? "page" : undefined}
      className={`group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
        ativo ? "font-semibold text-texto" : "font-medium text-texto-suave hover:bg-suave hover:text-texto"
      }`}
    >
      {/* No desktop o fundo do item ativo desliza até o novo item. */}
      {ativo && (indicador ? <ViewTransition name="indicador-menu">{fundo}</ViewTransition> : fundo)}
      <Icone
        className={`relative size-[18px] shrink-0 transition-colors ${ativo ? "text-primaria" : "group-hover:text-texto"}`}
        strokeWidth={ativo ? 2 : 1.75}
      />
      <span className="relative flex-1 truncate">{item.rotulo}</span>
      {item.novidade && <PontoNovidade ativo={ativo} />}
      {item.contador !== undefined && (
        <span
          className={`relative rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            ativo ? "bg-primaria text-sobre-primaria" : "bg-suave text-texto-suave"
          }`}
        >
          {item.contador}
        </span>
      )}
    </Link>
  );
}
