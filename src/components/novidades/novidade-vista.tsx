"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CHAVE_VISTA, VERSAO_ATUAL } from "@/lib/novidades";

// Guarda no navegador a última versão que a pessoa viu na tela Novidades.
// Sem acesso ao localStorage (aba anônima, bloqueio), o ponto não aparece.

const EVENTO = "mcont:novidades";

function lerVista() {
  try {
    return localStorage.getItem(CHAVE_VISTA);
  } catch {
    return VERSAO_ATUAL;
  }
}

function assinar(aviso: () => void) {
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO, aviso);
  };
}

// Ponto de destaque no item do menu enquanto houver versão não vista.
export function PontoNovidade({ ativo }: { ativo: boolean }) {
  const vista = useSyncExternalStore(assinar, lerVista, () => VERSAO_ATUAL);
  if (vista === VERSAO_ATUAL) return null;
  return (
    <span className="relative flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${ativo ? "bg-primaria" : "bg-primaria/80"}`} />
      <span className="sr-only">Há novidades</span>
    </span>
  );
}

// Na tela Novidades: marca a versão atual como vista.
export function MarcarNovidadeVista() {
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_VISTA, VERSAO_ATUAL);
      window.dispatchEvent(new Event(EVENTO));
    } catch {
      // sem localStorage: nada a guardar
    }
  }, []);
  return null;
}
