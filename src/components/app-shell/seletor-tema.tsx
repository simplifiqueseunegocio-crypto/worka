"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { CHAVE_TEMA, EVENTO_TEMA, type Tema } from "@/lib/tema";

const opcoes: { valor: Tema; rotulo: string; icone: LucideIcon }[] = [
  { valor: "claro", rotulo: "Tema claro", icone: Sun },
  { valor: "escuro", rotulo: "Tema escuro", icone: Moon },
  { valor: "sistema", rotulo: "Tema do sistema", icone: Monitor },
];

const midia = () => window.matchMedia("(prefers-color-scheme: dark)");

function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE_TEMA);
    return t === "claro" || t === "escuro" ? t : "sistema";
  } catch {
    return "sistema";
  }
}

function aplicar(tema: Tema) {
  const escuro = tema === "escuro" || (tema === "sistema" && midia().matches);
  document.documentElement.classList.toggle("dark", escuro);
}

function assinar(aviso: () => void) {
  // Em "sistema", acompanha a troca de tema do sistema operacional ao vivo.
  const aoMudarSistema = () => {
    if (lerTema() === "sistema") aplicar("sistema");
    aviso();
  };
  const m = midia();
  m.addEventListener("change", aoMudarSistema);
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO_TEMA, aviso);
  return () => {
    m.removeEventListener("change", aoMudarSistema);
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO_TEMA, aviso);
  };
}

function escolher(tema: Tema) {
  try {
    if (tema === "sistema") localStorage.removeItem(CHAVE_TEMA);
    else localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // sem localStorage: vale só nesta página
  }
  aplicar(tema);
  window.dispatchEvent(new Event(EVENTO_TEMA));
}

export function SeletorTema() {
  const atual = useSyncExternalStore(assinar, lerTema, () => "sistema" as Tema);

  return (
    <div role="group" aria-label="Tema da interface" className="flex items-center gap-0.5 rounded-full bg-suave p-0.5">
      {opcoes.map(({ valor, rotulo, icone: Icone }) => {
        const sel = atual === valor;
        return (
          <button
            key={valor}
            type="button"
            onClick={() => escolher(valor)}
            aria-pressed={sel}
            aria-label={rotulo}
            title={rotulo}
            className={`grid size-7 place-items-center rounded-full transition-colors ${
              sel ? "bg-superficie text-texto shadow-sm ring-1 ring-borda" : "text-texto-suave hover:text-texto"
            }`}
          >
            <Icone className="size-3.5" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
