"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LoaderCircle, Play, Settings, Upload } from "lucide-react";
import { enviarPlanilhaDet, iniciarDet, type EstadoDet } from "@/lib/det-actions";

function Aviso({ estado }: { estado: EstadoDet | null }) {
  if (!estado) return null;
  return (
    <p role="status" className={`text-sm font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
      {estado.erro ?? estado.ok}
    </p>
  );
}

// Botões do topo da tela do robô (gestor e admin): Iniciar e Configurar.
export function AcoesDet({ naFila }: { naFila: number }) {
  const [estado, setEstado] = useState<EstadoDet | null>(null);
  const [iniciando, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={iniciando}
          onClick={() => iniciar(async () => setEstado(await iniciarDet()))}
          className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover disabled:opacity-60"
        >
          {iniciando ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}
          {naFila ? "Iniciar de novo" : "Iniciar"}
        </button>
        <Link
          href="/automacoes/det/configurar"
          className="flex h-11 items-center gap-2 rounded-full border border-borda bg-superficie px-4 text-sm font-semibold text-texto hover:bg-suave"
        >
          <Settings className="size-4" /> Configurar
        </Link>
      </div>
      <Aviso estado={estado} />
    </div>
  );
}

// Envio da planilha de empresas (tela Configurar).
export function EnvioPlanilhaDet({ temPlanilha }: { temPlanilha: boolean }) {
  const [estado, setEstado] = useState<EstadoDet | null>(null);
  const [enviando, enviar] = useTransition();

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          const form = e.currentTarget;
          enviar(async () => {
            const r = await enviarPlanilhaDet(dados);
            setEstado(r);
            if (r.ok) form.reset();
          });
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input
          type="file"
          name="arquivo"
          required
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="min-w-0 flex-1 text-sm text-texto file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-suave file:px-4 file:text-sm file:font-semibold file:text-texto hover:file:bg-borda"
        />
        <button
          type="submit"
          disabled={enviando}
          className="flex h-10 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover disabled:opacity-60"
        >
          {enviando ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {temPlanilha ? "Trocar planilha" : "Enviar planilha"}
        </button>
      </form>
      <div className="mt-3">
        <Aviso estado={estado} />
      </div>
      {estado?.problemas && estado.problemas.length > 0 && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-bloco border border-borda">
          <p className="sticky top-0 bg-alerta-suave px-3 py-2 text-xs font-semibold text-alerta">
            Ficaram fora da fila (aparecem em Pendências):
          </p>
          <ul className="divide-y divide-borda text-sm">
            {estado.problemas.map((p, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-3 px-3 py-1.5">
                <span className="text-texto">{p.empresa}</span>
                <span className="text-texto-suave">{p.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
