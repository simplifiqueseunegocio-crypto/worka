"use client";

import { useEffect, useState, useTransition } from "react";
import { Hand, LoaderCircle } from "lucide-react";
import { assumirTarefas, type EstadoAcaoTarefa } from "@/lib/tarefas-actions";

// "Pegar para mim" na lista de Tarefas. Como na seleção de CND, as caixinhas
// ficam na tabela (Server Component) e se ligam à barra pelo atributo form.
export const FORM_ASSUMIR = "assumir-tarefas";

const caixinhas = () =>
  [...document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_ASSUMIR}"][name="tarefa"]`)].filter(
    (c) => !c.disabled,
  );

export function CaixaAssumir({ tarefaId, rotulo }: { tarefaId: string; rotulo: string }) {
  return (
    <input
      type="checkbox"
      form={FORM_ASSUMIR}
      name="tarefa"
      value={tarefaId}
      aria-label={`Selecionar ${rotulo}`}
      className="size-4 cursor-pointer accent-primaria"
    />
  );
}

export function MarcarTodasAssumir() {
  return (
    <input
      type="checkbox"
      aria-label="Selecionar todas as tarefas sem responsável da página"
      className="size-4 cursor-pointer accent-primaria"
      onChange={(e) => {
        for (const c of caixinhas()) c.checked = e.target.checked;
        document.dispatchEvent(new Event(FORM_ASSUMIR));
      }}
    />
  );
}

// Uma tarefa só, direto na linha.
export function PegarTarefa({ tarefaId }: { tarefaId: string }) {
  const [estado, setEstado] = useState<EstadoAcaoTarefa | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() => iniciar(async () => setEstado(await assumirTarefas([tarefaId])))}
        className="flex h-8 items-center gap-1.5 rounded-full border border-dashed border-alerta-borda px-3 text-xs font-semibold text-alerta transition-colors hover:border-primaria hover:bg-suave hover:text-destaque disabled:opacity-60"
      >
        {pendente ? <LoaderCircle className="size-3.5 animate-spin" /> : <Hand className="size-3.5" />}
        Pegar para mim
      </button>
      {estado?.erro && <span className="text-xs font-semibold text-perigo">{estado.erro}</span>}
    </span>
  );
}

export function BarraAssumir() {
  const [qtd, setQtd] = useState(0);
  const [estado, setEstado] = useState<EstadoAcaoTarefa | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    const contar = () => setQtd(caixinhas().filter((c) => c.checked).length);
    const aoMudar = (e: Event) => {
      if ((e.target as HTMLInputElement | null)?.getAttribute?.("form") === FORM_ASSUMIR) contar();
    };
    document.addEventListener("change", aoMudar);
    document.addEventListener(FORM_ASSUMIR, contar);
    contar();
    return () => {
      document.removeEventListener("change", aoMudar);
      document.removeEventListener(FORM_ASSUMIR, contar);
    };
  }, []);

  return (
    <form
      id={FORM_ASSUMIR}
      onSubmit={(e) => {
        e.preventDefault();
        const ids = caixinhas()
          .filter((c) => c.checked)
          .map((c) => c.value);
        iniciar(async () => {
          const r = await assumirTarefas(ids);
          setEstado(r);
          if (r.ok) {
            for (const c of caixinhas()) c.checked = false;
            setQtd(0);
          }
        });
      }}
      className="mt-4 flex flex-wrap items-center gap-3 rounded-bloco bg-fundo px-4 py-3"
    >
      <span className="text-sm text-texto-suave">
        {qtd ? (
          <>
            <strong className="text-texto">{qtd}</strong> {qtd === 1 ? "tarefa selecionada" : "tarefas selecionadas"}
          </>
        ) : (
          "Marque as tarefas sem responsável que você vai fazer"
        )}
      </span>
      <button
        type="submit"
        disabled={!qtd || pendente}
        className="flex h-10 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <Hand className="size-4" />}
        Pegar para mim
      </button>
      {estado && (
        <span role="status" className={`text-xs font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
          {estado.erro ?? estado.ok}
        </span>
      )}
    </form>
  );
}
