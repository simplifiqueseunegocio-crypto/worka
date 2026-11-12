"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AlertCircle, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { excluirLeituraPonto, iniciarLeituraPonto } from "@/lib/ponto-actions";

type Acoes = { ler: (id: string) => Promise<{ erro?: string }>; excluir: (id: string) => Promise<void> };

// Enquanto a IA lê: barra de andamento, atualizada a cada 3 s. Se falhar (ou
// parar por mais de 10 minutos), oferece ler de novo. Serve à ficha ponto e aos
// outros leitores de documentos (ações por propriedade).
export function AndamentoLeitura(props: {
  id: string;
  status: "enviando" | "lendo" | "erro";
  total: number;
  lidas: number;
  mensagem: string | null;
  enviadaEm: string;
  acoes?: Acoes;
}) {
  const acoes = props.acoes ?? { ler: iniciarLeituraPonto, excluir: excluirLeituraPonto };
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [pendente, executar] = useTransition();
  const lendo = props.status !== "erro";
  const parada = lendo && agora - new Date(props.enviadaEm).getTime() > 10 * 60_000;

  useEffect(() => {
    if (!lendo) return;
    const t = setInterval(() => {
      setAgora(Date.now());
      router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [lendo, router]);

  const lerDeNovo = () =>
    executar(async () => {
      const r = await acoes.ler(props.id);
      setErro(r.erro ?? null);
    });

  const pct = props.total ? Math.round((props.lidas / props.total) * 100) : 0;
  return (
    <section className="mt-6 rounded-card bg-superficie ring-1 ring-borda p-6">
      {lendo ? (
        <>
          <p className="flex items-center gap-2 font-semibold text-texto">
            <LoaderCircle className="size-4 animate-spin text-destaque" />
            {props.total ? `Lendo ${props.lidas} de ${props.total} ${props.total === 1 ? "página" : "páginas"}…` : "Preparando os arquivos…"}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-suave">
            <div className="h-full rounded-full bg-primaria transition-all duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
          <p className="mt-3 text-sm text-texto-suave">
            Cada página leva cerca de 20 a 60 segundos, várias em paralelo. Pode sair desta tela: a leitura continua e fica na
            lista.
          </p>
        </>
      ) : (
        <p className="flex items-start gap-2 text-sm font-semibold text-perigo">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {props.mensagem ?? "A leitura falhou."}
        </p>
      )}

      {(!lendo || parada) && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {parada && <p className="w-full text-sm text-alerta">A leitura parece ter parado.</p>}
          <button
            type="button"
            disabled={pendente}
            onClick={lerDeNovo}
            className="flex h-10 items-center gap-2 rounded-full bg-primaria px-4 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover disabled:opacity-60"
          >
            {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Ler de novo
          </button>
          <button
            type="button"
            disabled={pendente}
            onClick={() => confirm("Excluir esta leitura e os arquivos enviados?") && executar(() => acoes.excluir(props.id))}
            className="flex h-10 items-center gap-2 rounded-full border border-borda px-4 text-sm font-semibold text-perigo hover:bg-perigo-suave"
          >
            <Trash2 className="size-4" /> Excluir
          </button>
          {erro && <p className="text-sm font-semibold text-perigo">{erro}</p>}
        </div>
      )}
    </section>
  );
}
