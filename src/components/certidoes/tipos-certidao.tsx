"use client";

import { useState, useTransition } from "react";
import { AlertCircle, LoaderCircle, Pencil, Plus, Trash2, Zap } from "lucide-react";
import type { TipoCertidao } from "@/lib/certidoes";
import {
  excluirTipoCertidao,
  salvarTipoCertidao,
  type DadosTipoCertidao,
  type EstadoCertidao,
} from "@/lib/certidoes-actions";

const campo =
  "h-11 w-full rounded-bloco border border-borda bg-superficie px-4 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";

type Tipo = TipoCertidao & { lancadas: number };

// Catálogo de tipos de certidão. O admin cria, edita, desativa e exclui.
export function TiposCertidao({ tipos, admin }: { tipos: Tipo[]; admin: boolean }) {
  const [editando, setEditando] = useState<number | "novo" | null>(null);
  const [aviso, setAviso] = useState<EstadoCertidao | null>(null);

  return (
    <section className="mt-8 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-texto">Tipos de certidão</h2>
          <p className="text-sm text-texto-suave">
            “Todo cliente” liga o tipo em todos os clientes; na página de cada cliente dá para tirar ou incluir.
          </p>
        </div>
        {admin && editando !== "novo" && (
          <button
            type="button"
            onClick={() => {
              setAviso(null);
              setEditando("novo");
            }}
            className="flex h-10 items-center gap-2 rounded-full bg-primaria px-4 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
          >
            <Plus className="size-4" strokeWidth={2.4} /> Novo tipo
          </button>
        )}
      </div>

      {aviso && (
        <p role="status" className={`mt-3 text-xs font-semibold ${aviso.erro ? "text-perigo" : "text-sucesso"}`}>
          {aviso.erro ?? aviso.ok}
        </p>
      )}

      {editando === "novo" && (
        <Formulario
          aoFechar={() => setEditando(null)}
          aoSalvar={(r) => {
            setAviso(r);
            setEditando(null);
          }}
        />
      )}

      <ul className="mt-4 divide-y divide-borda border-y border-borda">
        {tipos.map((t) =>
          editando === t.id ? (
            <li key={t.id} className="py-2">
              <Formulario
                tipo={t}
                aoFechar={() => setEditando(null)}
                aoSalvar={(r) => {
                  setAviso(r);
                  setEditando(null);
                }}
              />
            </li>
          ) : (
            <Linha
              key={t.id}
              tipo={t}
              admin={admin}
              aoEditar={() => {
                setAviso(null);
                setEditando(t.id);
              }}
              aoAvisar={setAviso}
            />
          ),
        )}
      </ul>
    </section>
  );
}

function Linha({
  tipo: t,
  admin,
  aoEditar,
  aoAvisar,
}: {
  tipo: Tipo;
  admin: boolean;
  aoEditar: () => void;
  aoAvisar: (e: EstadoCertidao) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const excluivel = !t.cnd_tipo && t.lancadas === 0;

  return (
    <li className={`flex flex-wrap items-center justify-between gap-3 py-3.5 ${t.ativo ? "" : "opacity-60"}`}>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-texto">
          {t.nome}
          {t.cnd_tipo && (
            <span className="flex items-center gap-1 rounded-full bg-suave px-2 py-0.5 text-[11px] font-semibold text-destaque">
              <Zap className="size-3" /> Consulta automática
            </span>
          )}
          {!t.ativo && (
            <span className="rounded-full bg-suave px-2 py-0.5 text-[11px] font-semibold text-texto-suave">Desativado</span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-texto-suave">
          {[
            t.orgao,
            t.validade_dias ? `validade de ${t.validade_dias} dias` : "sem validade padrão",
            t.padrao ? "todo cliente" : "só nos clientes escolhidos",
            `${t.lancadas.toLocaleString("pt-BR")} ${t.lancadas === 1 ? "lançada" : "lançadas"}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {admin && (
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={aoEditar}
            className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-suave hover:text-texto"
            aria-label={`Editar ${t.nome}`}
          >
            <Pencil className="size-3.5" />
          </button>
          {excluivel &&
            (confirmando ? (
              <button
                type="button"
                autoFocus
                disabled={pendente}
                onBlur={() => setConfirmando(false)}
                onClick={() => iniciar(async () => aoAvisar(await excluirTipoCertidao(t.id)))}
                className="h-8 rounded-full bg-perigo-forte px-3 text-xs font-bold text-white"
              >
                {pendente ? "Excluindo…" : "Excluir?"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-perigo-suave hover:text-perigo"
                aria-label={`Excluir ${t.nome}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            ))}
        </span>
      )}
    </li>
  );
}

function Formulario({
  tipo,
  aoFechar,
  aoSalvar,
}: {
  tipo?: Tipo;
  aoFechar: () => void;
  aoSalvar: (r: EstadoCertidao) => void;
}) {
  const [dados, setDados] = useState<DadosTipoCertidao>({
    nome: tipo?.nome ?? "",
    orgao: tipo?.orgao ?? "",
    validadeDias: tipo?.validade_dias?.toString() ?? "",
    padrao: tipo?.padrao ?? false,
    ativo: tipo?.ativo ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const mudar = (m: Partial<DadosTipoCertidao>) => setDados((d) => ({ ...d, ...m }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await salvarTipoCertidao(dados, tipo?.id);
          if (r.ok) aoSalvar(r);
          else setErro(r.erro ?? "Não foi possível salvar.");
        });
      }}
      className="mt-4 grid gap-4 rounded-bloco bg-fundo p-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_160px]"
    >
      {erro && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo sm:col-span-3"
        >
          <AlertCircle className="size-4 shrink-0" /> {erro}
        </p>
      )}
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-texto">Nome</span>
        <input
          required
          autoFocus
          maxLength={80}
          value={dados.nome}
          onChange={(e) => mudar({ nome: e.target.value })}
          placeholder="Ex.: Falência e concordata"
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-texto">Órgão</span>
        <input
          maxLength={120}
          value={dados.orgao}
          onChange={(e) => mudar({ orgao: e.target.value })}
          placeholder="Ex.: TJ-SP"
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-texto">Validade (dias)</span>
        <input
          type="number"
          min={1}
          max={3650}
          value={dados.validadeDias}
          onChange={(e) => mudar({ validadeDias: e.target.value })}
          placeholder="—"
          className={campo}
        />
      </label>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-texto">
          <input
            type="checkbox"
            checked={dados.padrao}
            onChange={(e) => mudar({ padrao: e.target.checked })}
            className="size-4 accent-primaria"
          />
          Acompanhar em todo cliente
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-texto">
          <input
            type="checkbox"
            checked={dados.ativo}
            onChange={(e) => mudar({ ativo: e.target.checked })}
            className="size-4 accent-primaria"
          />
          Ativo
        </label>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            className="h-10 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex h-10 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover disabled:opacity-70"
          >
            {salvando && <LoaderCircle className="size-4 animate-spin" />}
            {tipo ? "Salvar" : "Criar tipo"}
          </button>
        </span>
      </div>
    </form>
  );
}
