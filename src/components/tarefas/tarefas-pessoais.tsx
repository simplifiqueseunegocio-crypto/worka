"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, LoaderCircle, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import type { ClienteNovaTarefa } from "@/lib/tarefas-actions";
import type { Recorrencia, TarefaPessoal } from "@/lib/tarefas-pessoais";
import {
  concluirTarefaPessoal,
  excluirTarefaPessoal,
  salvarTarefaPessoal,
  type EstadoTarefaPessoal,
} from "@/lib/tarefas-pessoais-actions";
import { BuscaCliente } from "./nova-tarefa";

const campo =
  "h-11 w-full rounded-bloco border border-borda bg-superficie px-4 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";

const rotuloRepeticao: Record<Recorrencia, string> = { nenhuma: "Não repete", mensal: "Todo mês", anual: "Todo ano" };

const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" });
const dataCurta = (iso: string) =>
  `${diaSemana.format(new Date(`${iso}T12:00:00Z`)).replace(".", "")}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diferencaDias = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

// Seção "Tarefas pessoais" de Minhas tarefas: lista, conclusão e formulário.
export function TarefasPessoais({
  abertas,
  concluidas,
  hoje,
}: {
  abertas: TarefaPessoal[];
  concluidas: TarefaPessoal[];
  hoje: string;
}) {
  const [editando, setEditando] = useState<TarefaPessoal | "nova" | null>(null);
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<EstadoTarefaPessoal | null>(null);
  const [verConcluidas, setVerConcluidas] = useState(false);

  const abrir = (t: TarefaPessoal | "nova") => {
    setAviso(null);
    setVersao((v) => v + 1);
    setEditando(t);
  };

  return (
    <section className="mt-4 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6" aria-labelledby="pessoais">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pessoais" className="text-lg font-bold text-texto">
            Tarefas pessoais
          </h2>
          <p className="text-sm text-texto-suave">Lembretes seus, fora das obrigações. Só você vê.</p>
        </div>
        <button
          type="button"
          onClick={() => abrir("nova")}
          className="flex h-10 items-center gap-2 rounded-full bg-primaria px-4 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
        >
          <Plus className="size-4" strokeWidth={2.4} /> Nova tarefa pessoal
        </button>
      </div>

      {aviso && (
        <p role="status" className={`mt-3 text-xs font-semibold ${aviso.erro ? "text-perigo" : "text-sucesso"}`}>
          {aviso.erro ?? aviso.ok}
        </p>
      )}

      {abertas.length === 0 ? (
        <p className="mt-4 rounded-bloco bg-fundo px-4 py-6 text-center text-sm text-texto-suave">
          Nenhuma tarefa pessoal em aberto.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-borda border-y border-borda">
          {abertas.map((t) => (
            <Linha key={t.id} tarefa={t} hoje={hoje} aoEditar={() => abrir(t)} aoAvisar={setAviso} />
          ))}
        </ul>
      )}

      {concluidas.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setVerConcluidas((v) => !v)}
            aria-expanded={verConcluidas}
            className="text-xs font-semibold text-destaque hover:underline"
          >
            {verConcluidas ? "Esconder concluídas" : `Ver concluídas recentes (${concluidas.length})`}
          </button>
          {verConcluidas && (
            <ul className="mt-2 divide-y divide-borda">
              {concluidas.map((t) => (
                <Linha key={t.id} tarefa={t} hoje={hoje} aoEditar={() => abrir(t)} aoAvisar={setAviso} />
              ))}
            </ul>
          )}
        </div>
      )}

      {editando &&
        createPortal(
          <Formulario
            key={versao}
            tarefa={editando === "nova" ? null : editando}
            hoje={hoje}
            aoFechar={() => setEditando(null)}
            aoSalvar={(r) => {
              setAviso(r);
              setEditando(null);
            }}
          />,
          document.body,
        )}
    </section>
  );
}

function Linha({
  tarefa: t,
  hoje,
  aoEditar,
  aoAvisar,
}: {
  tarefa: TarefaPessoal;
  hoje: string;
  aoEditar: () => void;
  aoAvisar: (e: EstadoTarefaPessoal) => void;
}) {
  const [feita, setFeita] = useOptimistic(Boolean(t.concluida_em));
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const dias = diferencaDias(hoje, t.prazo);
  const relativo =
    dias < 0
      ? `atrasada há ${-dias} ${-dias === 1 ? "dia" : "dias"}`
      : dias === 0
        ? "hoje"
        : dias === 1
          ? "amanhã"
          : `em ${dias} dias`;
  const cor = feita ? "text-texto-suave" : dias < 0 ? "text-perigo" : dias <= 1 ? "text-alerta" : "text-texto-suave";
  const cliente = t.cliente ? t.cliente.fantasia || t.cliente.razao_social : null;

  return (
    <li className="flex items-start gap-3 py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={feita}
        aria-label={feita ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setFeita(!feita);
            aoAvisar(await concluirTarefaPessoal(t.id, !feita));
          })
        }
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${
          feita ? "border-sucesso-forte bg-sucesso-forte text-white" : "border-borda hover:border-primaria"
        }`}
      >
        {feita && <Check className="size-3.5" strokeWidth={3} />}
      </button>

      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${feita ? "text-texto-suave line-through" : "text-texto"}`}>
          {t.titulo}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={`font-semibold tabular-nums ${cor}`}>
            {dataCurta(t.prazo)}
            {!feita && ` · ${relativo}`}
          </span>
          {t.recorrencia !== "nenhuma" && (
            <span className="flex items-center gap-1 text-destaque">
              <Repeat className="size-3" /> {rotuloRepeticao[t.recorrencia]}
            </span>
          )}
          {cliente && t.cliente && (
            <Link
              href={`/clientes/${t.cliente.id}`}
              className="truncate text-texto-suave hover:text-destaque hover:underline"
            >
              {cliente}
            </Link>
          )}
        </span>
        {t.descricao && <span className="mt-1 block text-xs whitespace-pre-line text-texto-suave">{t.descricao}</span>}
      </span>

      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={aoEditar}
          className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-suave hover:text-texto"
          aria-label={`Editar ${t.titulo}`}
        >
          <Pencil className="size-3.5" />
        </button>
        {confirmando ? (
          <button
            type="button"
            autoFocus
            disabled={pendente}
            onBlur={() => setConfirmando(false)}
            onClick={() => iniciar(async () => aoAvisar(await excluirTarefaPessoal(t.id)))}
            className="h-8 rounded-full bg-perigo-forte px-3 text-xs font-bold text-white"
          >
            {pendente ? "Excluindo…" : "Excluir?"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-perigo-suave hover:text-perigo"
            aria-label={`Excluir ${t.titulo}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </span>
    </li>
  );
}

function Formulario({
  tarefa,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  tarefa: TarefaPessoal | null;
  hoje: string;
  aoFechar: () => void;
  aoSalvar: (r: EstadoTarefaPessoal) => void;
}) {
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? "");
  const [prazo, setPrazo] = useState(tarefa?.prazo ?? hoje);
  const [recorrencia, setRecorrencia] = useState<Recorrencia>(tarefa?.recorrencia ?? "nenhuma");
  const [cliente, setCliente] = useState<ClienteNovaTarefa | null>(
    tarefa?.cliente ? { ...tarefa.cliente, responsaveis: [] } : null,
  );
  const [comCliente, setComCliente] = useState(Boolean(tarefa?.cliente));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && !salvando && aoFechar();
    document.addEventListener("keydown", fechar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", fechar);
      document.body.style.overflow = overflow;
    };
  }, [aoFechar, salvando]);

  const dia = Number(prazo.slice(8, 10)) || 1;
  const explicacao: Record<Recorrencia, string> = {
    nenhuma: "Some da lista quando concluída.",
    mensal: `Ao concluir, a próxima aparece para o dia ${dia} do mês seguinte${dia > 28 ? " (ou o último dia, em meses mais curtos)" : ""}.`,
    anual: `Ao concluir, a próxima aparece para ${prazo.slice(8, 10)}/${prazo.slice(5, 7)} do ano seguinte.`,
  };

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await salvarTarefaPessoal(
        { titulo, descricao, prazo, recorrencia, clienteId: comCliente ? (cliente?.id ?? "") : "" },
        tarefa?.id,
      );
      if (r.ok) aoSalvar(r);
      else setErro(r.erro ?? "Não foi possível salvar.");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-[aparecer_200ms_ease-out_both] bg-escuro/50 backdrop-blur-sm"
        onClick={() => !salvando && aoFechar()}
        aria-hidden="true"
      />
      <form
        onSubmit={salvar}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tp-titulo"
        className="relative flex max-h-[92vh] w-full max-w-xl animate-surgir flex-col overflow-hidden rounded-t-card bg-superficie ring-1 ring-borda shadow-modal sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-4 border-b border-borda px-6 py-5">
          <div>
            <h2 id="tp-titulo" className="font-display text-2xl text-texto">
              {tarefa ? "Editar tarefa pessoal" : "Nova tarefa pessoal"}
            </h2>
            <p className="mt-1 text-sm text-texto-suave">Só você vê esta tarefa.</p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            className="grid size-10 shrink-0 place-items-center rounded-full text-texto-suave hover:bg-suave hover:text-texto"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="rolagem-discreta flex flex-col gap-5 overflow-y-auto px-6 py-5">
          {erro && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo"
            >
              <AlertCircle className="size-4 shrink-0" /> {erro}
            </p>
          )}

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">O que fazer</span>
            <input
              required
              autoFocus
              maxLength={200}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Conferir extratos bancários"
              className={campo}
            />
          </label>

          <label className="flex flex-col gap-2 sm:max-w-[220px]">
            <span className="text-sm font-semibold text-texto">Prazo</span>
            <input type="date" required value={prazo} onChange={(e) => setPrazo(e.target.value)} className={campo} />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-texto">Repetir</legend>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(rotuloRepeticao) as Recorrencia[]).map((r) => (
                <label
                  key={r}
                  className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-borda text-sm font-semibold text-texto-suave transition has-checked:border-primaria has-checked:bg-suave has-checked:text-texto"
                >
                  <input
                    type="radio"
                    name="recorrencia"
                    value={r}
                    checked={recorrencia === r}
                    onChange={() => setRecorrencia(r)}
                    className="sr-only"
                  />
                  {r !== "nenhuma" && <Repeat className="size-3.5" />}
                  {rotuloRepeticao[r]}
                </label>
              ))}
            </div>
            <span className="text-xs text-texto-suave">{explicacao[recorrencia]}</span>
          </fieldset>

          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-texto">
              <input
                type="checkbox"
                checked={comCliente}
                onChange={(e) => setComCliente(e.target.checked)}
                className="size-4 accent-primaria"
              />
              Ligada a um cliente <span className="font-normal text-texto-suave">(opcional)</span>
            </label>
            {comCliente && (
              <>
                <span id="nt-cliente" className="sr-only">
                  Cliente
                </span>
                <BuscaCliente selecionado={cliente} aoEscolher={setCliente} />
              </>
            )}
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">
              Detalhes <span className="font-normal text-texto-suave">(opcional)</span>
            </span>
            <textarea
              rows={3}
              maxLength={2000}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={`${campo} h-auto resize-none py-3`}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-borda bg-fundo/60 px-6 py-4">
          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            className="h-11 rounded-full px-5 text-sm font-semibold text-texto-suave hover:bg-suave"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex h-11 items-center gap-2 rounded-full bg-primaria px-6 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:opacity-70"
          >
            {salvando && <LoaderCircle className="size-4 animate-spin" />}
            {salvando ? "Salvando…" : tarefa ? "Salvar" : "Criar tarefa"}
          </button>
        </div>
      </form>
    </div>
  );
}
