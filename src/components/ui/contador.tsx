"use client";

import { useEffect, useRef, useState } from "react";

// Número que conta de 0 até o valor ao aparecer na tela.
// Com "reduzir movimento" ativado, mostra o valor direto.
export function Contador({ valor, duracao = 900, className }: { valor: number; duracao?: number; className?: string }) {
  const [atual, setAtual] = useState(0);
  const quadro = useRef<number | null>(null);

  useEffect(() => {
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = reduzir ? 1 : Math.min(1, (agora - inicio) / duracao);
      const suave = 1 - Math.pow(1 - t, 3);
      setAtual(Math.round(valor * suave));
      if (t < 1) quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
    return () => {
      if (quadro.current !== null) cancelAnimationFrame(quadro.current);
    };
  }, [valor, duracao]);

  return (
    <span className={`tabular-nums ${className ?? ""}`} aria-label={valor.toLocaleString("pt-BR")}>
      <span aria-hidden="true">{atual.toLocaleString("pt-BR")}</span>
    </span>
  );
}
