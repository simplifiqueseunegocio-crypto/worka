"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Hourglass, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { alterarStatusTarefa, type EstadoAcaoTarefa } from "@/lib/tarefas-actions";
import type { StatusTarefaBanco } from "@/lib/tarefas";

// Próximo passo mais comum para cada status: vira o botão principal da linha.
const proximo: Record<StatusTarefaBanco, { status: StatusTarefaBanco; rotulo: string; icone: typeof Play }> = {
  pendente: { status: "em_andamento", rotulo: "Iniciar", icone: Play },
  em_andamento: { status: "concluida", rotulo: "Concluir", icone: Check },
  aguardando_cliente: { status: "em_andamento", rotulo: "Retomar", icone: Play },
  concluida: { status: "pendente", rotulo: "Reabrir", icone: RotateCcw },
  dispensada: { status: "pendente", rotulo: "Reabrir", icone: RotateCcw },
};

const outras: { status: StatusTarefaBanco; rotulo: string; icone: typeof Play }[] = [
  { status: "em_andamento", rotulo: "Em andamento", icone: Play },
  { status: "aguardando_cliente", rotulo: "Aguardando cliente", icone: Hourglass },
  { status: "concluida", rotulo: "Concluída", icone: Check },
  { status: "pendente", rotulo: "Voltar para pendente", icone: RotateCcw },
];

// Posição fixa do menu na tela (px): abaixo da seta ou, sem espaço, acima.
type Posicao = { direita: number; topo?: number; baixo?: number };
const ALTURA_MENU = 230;

export function AcoesTarefa({ tarefaId, status, rotulo }: { tarefaId: string; status: StatusTarefaBanco; rotulo: string }) {
  const [estado, setEstado] = useState<EstadoAcaoTarefa | null>(null);
  const [pendente, iniciar] = useTransition();
  const [menu, setMenu] = useState<Posicao | null>(null);
  const [dispensando, setDispensando] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const seta = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // O menu vai para o <body> (portal) com posição fixa: dentro da tabela ele
  // ficaria atrás das linhas seguintes (cada linha anima e vira uma camada) e
  // seria cortado pela rolagem horizontal. Fecha ao clicar fora, rolar ou redimensionar.
  useEffect(() => {
    if (!menu) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (!raiz.current?.contains(alvo) && !caixa.current?.contains(alvo)) setMenu(null);
    };
    const fechar = () => setMenu(null);
    document.addEventListener("pointerdown", fora);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [menu]);

  function abrirMenu() {
    if (menu) return setMenu(null);
    const r = seta.current!.getBoundingClientRect();
    const direita = window.innerWidth - r.right;
    // Sem espaço embaixo, abre para cima.
    setMenu(
      window.innerHeight - r.bottom < ALTURA_MENU
        ? { direita, baixo: window.innerHeight - r.top + 6 }
        : { direita, topo: r.bottom + 6 },
    );
  }

  function alterar(novo: StatusTarefaBanco, justificativa?: string) {
    setMenu(null);
    iniciar(async () => {
      const r = await alterarStatusTarefa(tarefaId, novo, justificativa);
      setEstado(r);
      if (r.ok) setDispensando(false);
    });
  }

  const principal = proximo[status];
  const Icone = principal.icone;
  const opcoes = outras.filter((o) => o.status !== status && o.status !== principal.status);

  return (
    <div ref={raiz} className="relative flex flex-col items-end gap-1.5">
      <div className="flex items-center">
        <button
          type="button"
          disabled={pendente}
          onClick={() => alterar(principal.status)}
          aria-label={`${principal.rotulo}: ${rotulo}`}
          className="flex h-9 items-center gap-1.5 rounded-l-full bg-primaria pr-3 pl-4 text-xs font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:opacity-60"
        >
          {pendente ? <LoaderCircle className="size-3.5 animate-spin" /> : <Icone className="size-3.5" strokeWidth={2.5} />}
          {principal.rotulo}
        </button>
        <button
          ref={seta}
          type="button"
          disabled={pendente}
          onClick={abrirMenu}
          onKeyDown={(e) => e.key === "Escape" && setMenu(null)}
          aria-haspopup="menu"
          aria-expanded={Boolean(menu)}
          aria-label={`Mais ações: ${rotulo}`}
          className="grid h-9 w-9 place-items-center rounded-r-full border-l border-white/20 bg-primaria text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:opacity-60"
        >
          <ChevronDown className={`size-4 transition-transform ${menu ? "rotate-180" : ""}`} />
        </button>
      </div>

      {menu &&
        createPortal(
          <div
            ref={caixa}
            role="menu"
            onKeyDown={(e) => e.key === "Escape" && setMenu(null)}
            style={{ top: menu.topo, bottom: menu.baixo, right: menu.direita }}
            className="fixed z-50 w-56 animate-surgir rounded-bloco bg-superficie p-1.5 text-left shadow-elevado ring-1 ring-borda"
          >
            {opcoes.map((o) => (
              <button
                key={o.status}
                type="button"
                role="menuitem"
                onClick={() => alterar(o.status)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-texto hover:bg-suave"
              >
                <o.icone className="size-4 text-texto-suave" />
                {o.rotulo}
              </button>
            ))}
            {status !== "dispensada" && (
              <>
                <div className="my-1 border-t border-borda" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    setDispensando(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-perigo hover:bg-perigo-suave"
                >
                  Dispensar…
                </button>
              </>
            )}
          </div>,
          document.body,
        )}

      {dispensando && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            alterar("dispensada", String(new FormData(e.currentTarget).get("justificativa") ?? ""));
          }}
          className="flex w-64 flex-col gap-2 rounded-bloco bg-fundo p-3 text-left ring-1 ring-borda"
        >
          <label className="text-xs font-semibold text-texto" htmlFor={`justificativa-${tarefaId}`}>
            Por que dispensar?
          </label>
          <textarea
            id={`justificativa-${tarefaId}`}
            name="justificativa"
            required
            autoFocus
            maxLength={500}
            rows={2}
            placeholder="Ex.: empresa sem movimento no mês"
            className="resize-none rounded-xl border border-borda bg-superficie px-3 py-2 text-sm outline-none focus:border-primaria focus:ring-4 focus:ring-primaria/15"
          />
          <span className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDispensando(false)}
              className="h-8 rounded-full px-3 text-xs font-semibold text-texto-suave hover:bg-suave"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pendente}
              className="h-8 rounded-full bg-perigo-forte px-4 text-xs font-bold text-white hover:bg-perigo-forte-hover disabled:opacity-60"
            >
              Dispensar
            </button>
          </span>
        </form>
      )}

      {estado && (
        <span role="status" className={`text-xs font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
          {estado.erro ?? estado.ok}
        </span>
      )}
    </div>
  );
}
