"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import {
  desconectarClienteAgora,
  sincronizarClienteAgora,
  sincronizarTodosAgora,
  type EstadoContaAzul,
} from "@/lib/conta-azul-actions";

function Aviso({ estado }: { estado: EstadoContaAzul | null }) {
  if (!estado) return null;
  return (
    <p role="status" className={`text-xs font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
      {estado.erro ?? estado.ok}
    </p>
  );
}

// "Sincronizar todos agora" (o mesmo que a rotina das 23:00).
export function SincronizarTodos() {
  const [estado, setEstado] = useState<EstadoContaAzul | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pendente}
        onClick={() => iniciar(async () => setEstado(await sincronizarTodosAgora()))}
        className="flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-texto ring-1 ring-borda transition-colors hover:bg-suave disabled:opacity-60"
      >
        {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        {pendente ? "Sincronizando…" : "Sincronizar todos agora"}
      </button>
      <Aviso estado={estado} />
    </div>
  );
}

// Ações de uma linha: sincronizar este cliente e desconectar.
export function AcoesCliente({ clienteId, nome }: { clienteId: string; nome: string }) {
  const [estado, setEstado] = useState<EstadoContaAzul | null>(null);
  const [pendente, iniciar] = useTransition();
  const [acao, setAcao] = useState<"sync" | "sair" | null>(null);
  const rodar = (qual: "sync" | "sair", fn: () => Promise<EstadoContaAzul>) => {
    setAcao(qual);
    iniciar(async () => setEstado(await fn()));
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pendente}
          onClick={() => rodar("sync", () => sincronizarClienteAgora(clienteId))}
          className="grid size-9 place-items-center rounded-full text-texto-suave transition-colors hover:bg-suave hover:text-texto disabled:opacity-60"
          aria-label={`Sincronizar ${nome}`}
          title="Sincronizar agora"
        >
          {pendente && acao === "sync" ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </button>
        <a
          href={`/api/integracoes/conta-azul/conectar?cliente=${clienteId}`}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-texto-suave transition-colors hover:bg-suave hover:text-texto"
        >
          Reconectar
        </a>
        <button
          type="button"
          disabled={pendente}
          onClick={() => {
            if (confirm(`Desconectar ${nome} da Conta Azul? O cliente continua na plataforma, só para de ser atualizado.`)) {
              rodar("sair", () => desconectarClienteAgora(clienteId));
            }
          }}
          className="grid size-9 place-items-center rounded-full text-texto-suave transition-colors hover:bg-perigo-suave hover:text-perigo disabled:opacity-60"
          aria-label={`Desconectar ${nome}`}
          title="Desconectar"
        >
          {pendente && acao === "sair" ? <LoaderCircle className="size-4 animate-spin" /> : <Unplug className="size-4" />}
        </button>
      </div>
      <Aviso estado={estado} />
    </div>
  );
}
