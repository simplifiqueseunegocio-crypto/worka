"use client";

import { useState, useTransition, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { alterarBuscaCnd, consultarCnd, ligarBuscaCarteira, type EstadoAcaoCnd } from "@/lib/cnd-actions";

function Aviso({ estado }: { estado: EstadoAcaoCnd | null }) {
  if (!estado) return null;
  return (
    <span role="status" className={`text-xs font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
      {estado.erro ?? estado.ok}
    </span>
  );
}

const estilos = {
  primario: "bg-primaria text-sobre-primaria hover:bg-primaria-hover",
  contorno: "border-2 border-primaria text-destaque hover:bg-primaria hover:text-sobre-primaria",
};

function BotaoAcao({
  acao,
  icone,
  children,
  variante = "primario",
}: {
  acao: () => Promise<EstadoAcaoCnd>;
  icone: ReactNode;
  children: ReactNode;
  variante?: keyof typeof estilos;
}) {
  const [estado, setEstado] = useState<EstadoAcaoCnd | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pendente}
        onClick={() => iniciar(async () => setEstado(await acao()))}
        className={`flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition-colors disabled:opacity-60 ${estilos[variante]}`}
      >
        {pendente ? <LoaderCircle className="size-4 animate-spin" /> : icone}
        {children}
      </button>
      <Aviso estado={estado} />
    </span>
  );
}

export function ConsultarCliente({ clienteId, icone }: { clienteId: string; icone: ReactNode }) {
  return (
    <BotaoAcao acao={() => consultarCnd(clienteId)} icone={icone} variante="contorno">
      Consultar agora
    </BotaoAcao>
  );
}

export function LigarCarteira({ icone }: { icone: ReactNode }) {
  return (
    <BotaoAcao acao={ligarBuscaCarteira} icone={icone}>
      Ligar para todos os clientes ativos
    </BotaoAcao>
  );
}

// Interruptor "Buscar CND" do cliente. Só admin e gestor podem alterar.
export function InterruptorBuscaCnd({
  clienteId,
  ativo,
  podeAlterar,
}: {
  clienteId: string;
  ativo: boolean;
  podeAlterar: boolean;
}) {
  const [estado, setEstado] = useState<EstadoAcaoCnd | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={ativo}
        aria-label="Buscar CND deste cliente"
        disabled={!podeAlterar || pendente}
        onClick={() => iniciar(async () => setEstado(await alterarBuscaCnd(clienteId, !ativo)))}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          ativo ? "bg-primaria" : "bg-borda"
        }`}
      >
        <span
          className={`absolute top-1 left-1 grid size-5 place-items-center rounded-full bg-superficie shadow transition-transform ${
            ativo ? "translate-x-5" : ""
          }`}
        >
          {pendente && <LoaderCircle className="size-3 animate-spin text-destaque" />}
        </span>
      </button>
      <span className="text-sm font-semibold text-texto">{ativo ? "Busca ligada" : "Busca desligada"}</span>
      {!podeAlterar && <span className="text-xs text-texto-suave">Apenas admin ou gestor altera.</span>}
      <Aviso estado={estado} />
    </span>
  );
}
