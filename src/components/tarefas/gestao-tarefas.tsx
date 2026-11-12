"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { atribuirResponsavel, gerarTarefas, type EstadoAcaoTarefa } from "@/lib/tarefas-actions";

function Aviso({ estado }: { estado: EstadoAcaoTarefa | null }) {
  if (!estado) return null;
  return (
    <span role="status" className={`text-xs font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
      {estado.erro ?? estado.ok}
    </span>
  );
}

// "Gerar tarefas" da competência escolhida, com confirmação no próprio botão.
export function GerarTarefas({ competencia, rotulo }: { competencia: string; rotulo: string }) {
  const [estado, setEstado] = useState<EstadoAcaoTarefa | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const todas = competencia === "todas";

  return (
    <span className="flex flex-wrap items-center justify-end gap-3">
      <Aviso estado={estado} />
      {confirmando && !pendente && (
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="h-11 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave"
        >
          Cancelar
        </button>
      )}
      <button
        type="button"
        disabled={pendente || todas}
        title={todas ? "Escolha uma competência para gerar" : undefined}
        onClick={() => {
          if (!confirmando) {
            setEstado(null);
            setConfirmando(true);
            return;
          }
          iniciar(async () => {
            setEstado(await gerarTarefas(competencia));
            setConfirmando(false);
          });
        }}
        className={`flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition-colors disabled:opacity-50 ${
          confirmando
            ? "bg-primaria text-sobre-primaria hover:bg-primaria-hover"
            : "border-2 border-primaria text-destaque hover:bg-primaria hover:text-sobre-primaria"
        }`}
      >
        {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" strokeWidth={2.2} />}
        {confirmando ? `Gerar ${rotulo}?` : "Gerar tarefas"}
      </button>
    </span>
  );
}

// Responsável da tarefa, trocado na própria linha (admin e gestor do departamento).
export function ResponsavelTarefa({
  tarefaId,
  atual,
  equipe,
  rotulo,
}: {
  tarefaId: string;
  atual: string | null;
  equipe: { id: string; nome: string }[];
  rotulo: string;
}) {
  const [estado, setEstado] = useState<EstadoAcaoTarefa | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <span className="flex flex-col gap-1">
      <span className="relative flex items-center">
        <select
          defaultValue={atual ?? ""}
          disabled={pendente}
          aria-label={`Responsável: ${rotulo}`}
          onChange={(e) => {
            const select = e.currentTarget;
            iniciar(async () => {
              const r = await atribuirResponsavel(tarefaId, select.value);
              if (r.erro) select.value = atual ?? ""; // volta ao que está salvo
              setEstado(r);
            });
          }}
          className={`h-9 w-full max-w-[190px] cursor-pointer truncate rounded-full border bg-superficie pr-8 pl-3 text-sm outline-none focus:border-primaria focus:ring-4 focus:ring-primaria/15 disabled:opacity-60 ${
            atual ? "border-borda font-medium text-texto" : "border-dashed border-alerta-borda font-semibold text-alerta"
          }`}
        >
          <option value="">Sem responsável</option>
          {equipe.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        {pendente && <LoaderCircle className="absolute right-3 size-3.5 animate-spin text-destaque" />}
      </span>
      {estado?.erro && <Aviso estado={estado} />}
    </span>
  );
}
