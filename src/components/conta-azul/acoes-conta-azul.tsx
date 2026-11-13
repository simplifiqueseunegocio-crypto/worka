"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { desconectar, sincronizarAgora, type EstadoContaAzul } from "@/lib/conta-azul-actions";

// Ações da tela Conta Azul: sincronizar agora (com opção de forçar) e desconectar.
export function AcoesContaAzul() {
  const [estado, setEstado] = useState<EstadoContaAzul | null>(null);
  const [forcar, setForcar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [acao, setAcao] = useState<"sync" | "sair" | null>(null);

  const rodar = (qual: "sync" | "sair", fn: () => Promise<EstadoContaAzul>) => {
    setAcao(qual);
    iniciar(async () => setEstado(await fn()));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pendente}
          onClick={() => rodar("sync", () => sincronizarAgora(forcar))}
          className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendente && acao === "sync" ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {pendente && acao === "sync" ? "Sincronizando…" : "Sincronizar agora"}
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => {
            if (confirm("Desconectar a Conta Azul? A sincronização diária para até alguém conectar de novo.")) {
              rodar("sair", desconectar);
            }
          }}
          className="flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-texto-suave ring-1 ring-borda transition-colors hover:bg-suave hover:text-texto disabled:opacity-60"
        >
          {pendente && acao === "sair" ? <LoaderCircle className="size-4 animate-spin" /> : <Unplug className="size-4" />}
          Desconectar
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-texto-suave">
        <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} className="size-4" />
        Forçar (aceita uma queda grande no número de clientes, por exemplo após uma limpeza na Conta Azul)
      </label>
      {estado && (
        <p
          role="status"
          className={`rounded-bloco px-4 py-3 text-sm font-medium ${estado.erro ? "bg-perigo-suave text-perigo" : "bg-sucesso-suave text-sucesso"}`}
        >
          {estado.erro ?? estado.ok}
        </p>
      )}
    </div>
  );
}
