import { ViewTransition, type ReactNode } from "react";

// Conteúdo de um módulo: anima ao entrar e ao sair numa navegação
// (classes pagina-entra / pagina-sai em globals.css). Colocar na página,
// não no layout: layouts persistem e não disparam entrada/saída.
export function TransicaoPagina({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="pagina-entra" exit="pagina-sai" default="none">
      {children}
    </ViewTransition>
  );
}

// Conteúdo que chega depois de um <Suspense>: sobe e aparece.
export function Revelar({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="revela" default="none">
      {children}
    </ViewTransition>
  );
}

// Fallback de um <Suspense>: só aparece se a espera passar de ~300 ms e,
// quando o conteúdo chega, desce e some.
export function Esqueleto({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ViewTransition exit="esconde" default="none">
      <div className={`esqueleto-atrasado ${className ?? ""}`} aria-hidden="true">
        {children}
      </div>
    </ViewTransition>
  );
}
