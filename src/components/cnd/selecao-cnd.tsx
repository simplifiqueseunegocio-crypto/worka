"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { consultarSelecionados, type EstadoAcaoCnd } from "@/lib/cnd-actions";

// As caixinhas das linhas ficam na tabela (Server Component) e se ligam a este
// formulário pelo atributo form="selecao-cnd": a página continua renderizada no
// servidor e só a barra de ações roda no navegador.
export const FORM_SELECAO_CND = "selecao-cnd";

const caixinhas = () =>
  [...document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_SELECAO_CND}"][name="cliente"]`)].filter(
    (c) => !c.disabled,
  );

export function MarcarTodosCnd() {
  return (
    <input
      type="checkbox"
      aria-label="Selecionar todos os clientes ativos da página"
      className="size-4 cursor-pointer accent-primaria"
      onChange={(e) => {
        for (const c of caixinhas()) c.checked = e.target.checked;
        document.dispatchEvent(new Event("selecao-cnd"));
      }}
    />
  );
}

export function BarraSelecaoCnd() {
  const [qtd, setQtd] = useState(0);
  const [estado, setEstado] = useState<EstadoAcaoCnd | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    const contar = () => setQtd(caixinhas().filter((c) => c.checked).length);
    const aoMudar = (e: Event) => {
      if ((e.target as HTMLInputElement | null)?.getAttribute?.("form") === FORM_SELECAO_CND) contar();
    };
    document.addEventListener("change", aoMudar);
    document.addEventListener("selecao-cnd", contar);
    contar();
    return () => {
      document.removeEventListener("change", aoMudar);
      document.removeEventListener("selecao-cnd", contar);
    };
  }, []);

  return (
    <form
      id={FORM_SELECAO_CND}
      onSubmit={(e) => {
        e.preventDefault();
        const ids = caixinhas()
          .filter((c) => c.checked)
          .map((c) => c.value);
        iniciar(async () => {
          const r = await consultarSelecionados(ids);
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
            <strong className="text-texto">{qtd}</strong> {qtd === 1 ? "cliente selecionado" : "clientes selecionados"}
          </>
        ) : (
          "Marque os clientes para consultar as certidões sob demanda"
        )}
      </span>
      <button
        type="submit"
        disabled={!qtd || pendente}
        className="flex h-10 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        Consultar CND dos selecionados
      </button>
      {estado && (
        <span role="status" className={`text-xs font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
          {estado.erro ?? estado.ok}
        </span>
      )}
    </form>
  );
}
