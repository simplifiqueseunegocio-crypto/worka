"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { enviarPreviaResumo, type EstadoPrevia } from "@/lib/automacoes-actions";

export function BotaoPreviaResumo() {
  const [estado, setEstado] = useState<EstadoPrevia | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() => iniciar(async () => setEstado(await enviarPreviaResumo()))}
        className="flex items-center gap-1.5 text-sm font-semibold text-destaque hover:text-texto disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendente ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        Enviar prévia para mim
      </button>
      {estado && (
        <span role="status" className={`text-xs ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
          {estado.erro ?? estado.ok}
        </span>
      )}
    </span>
  );
}
