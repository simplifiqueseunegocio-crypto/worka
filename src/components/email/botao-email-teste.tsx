"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { enviarEmailTeste, type EstadoEmailTeste } from "@/lib/email-actions";

export function BotaoEmailTeste({ desabilitado }: { desabilitado: boolean }) {
  const [estado, setEstado] = useState<EstadoEmailTeste | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={desabilitado || pendente}
        onClick={() => iniciar(async () => setEstado(await enviarEmailTeste()))}
        className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
        Enviar e-mail de teste
      </button>
      {estado && (
        <span role="status" className={`text-xs font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
          {estado.erro ?? estado.ok}
        </span>
      )}
    </span>
  );
}
