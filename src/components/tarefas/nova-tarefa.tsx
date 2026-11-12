"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, LoaderCircle, Plus, Search, X } from "lucide-react";
import {
  buscarClientesTarefa,
  criarTarefa,
  type ClienteNovaTarefa,
  type EstadoAcaoTarefa,
} from "@/lib/tarefas-actions";
import type { ObrigacaoNovaTarefa } from "@/lib/tarefas";
import { geraNaCompetencia, prazoLegal, prazoMeta, rotulosPeriodicidade } from "@/lib/prazos";

const campo =
  "h-11 w-full rounded-bloco border border-borda bg-superficie px-4 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";

type Props = {
  obrigacoes: ObrigacaoNovaTarefa[]; // só as dos departamentos que o usuário gere
  departamentos: { id: number; nome: string; cor: string }[];
  equipe: { id: string; nome: string }[];
  feriados: string[];
  competencia: string; // "AAAA-MM"
};

// Botão "Nova tarefa" + formulário em janela. Cria uma tarefa avulsa:
// uma obrigação do catálogo para um cliente numa competência.
export function NovaTarefa(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <>
      <span className="flex flex-wrap items-center justify-end gap-3">
        {aviso && (
          <span role="status" className="flex items-center gap-1.5 text-xs font-semibold text-sucesso">
            <Check className="size-3.5" strokeWidth={2.6} /> {aviso}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setAviso(null);
            setVersao((v) => v + 1);
            setAberto(true);
          }}
          className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
        >
          <Plus className="size-4" strokeWidth={2.4} /> Nova tarefa
        </button>
      </span>
      {/* No <body>: o cabeçalho da página anima com transform, e um ancestral com
          transform vira a referência do position: fixed (a janela ficaria presa nele). */}
      {aberto &&
        createPortal(
          <Janela
            key={versao}
            {...props}
            aoFechar={() => setAberto(false)}
            aoCriar={(msg) => {
              setAviso(msg);
              setAberto(false);
            }}
          />,
          document.body,
        )}
    </>
  );
}

function Janela({
  obrigacoes,
  departamentos,
  equipe,
  feriados,
  competencia: competenciaInicial,
  aoFechar,
  aoCriar,
}: Props & { aoFechar: () => void; aoCriar: (msg: string) => void }) {
  const feriadosSet = useMemo(() => new Set(feriados), [feriados]);
  const [cliente, setCliente] = useState<ClienteNovaTarefa | null>(null);
  const [obrigacaoId, setObrigacaoId] = useState(0);
  const [competencia, setCompetencia] = useState(competenciaInicial);
  const [legal, setLegal] = useState("");
  const [meta, setMeta] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [observacao, setObservacao] = useState("");
  const [estado, setEstado] = useState<EstadoAcaoTarefa | null>(null);
  const [salvando, iniciar] = useTransition();

  const obrigacao = obrigacoes.find((o) => o.id === obrigacaoId) ?? null;
  const foraDaPeriodicidade =
    obrigacao && competencia && !geraNaCompetencia(obrigacao.periodicidade, Number(competencia.slice(5, 7)));

  // Prazos sugeridos pela regra da obrigação; continuam editáveis.
  function sugerirPrazos(o: ObrigacaoNovaTarefa | null, comp: string) {
    if (!o || !/^\d{4}-\d{2}$/.test(comp)) return;
    const l = prazoLegal(o, `${comp}-01`, feriadosSet);
    setLegal(l);
    setMeta(prazoMeta(o, l, feriadosSet));
  }

  // Responsável sugerido: o do cliente no departamento da obrigação.
  function sugerirResponsavel(c: ClienteNovaTarefa | null, o: ObrigacaoNovaTarefa | null) {
    if (!c || !o) return;
    const r = c.responsaveis.find((x) => x.departamento_id === o.departamento_id)?.profile_id ?? "";
    setResponsavel(equipe.some((p) => p.id === r) ? r : "");
  }

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

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente) return setEstado({ erro: "Escolha o cliente." });
    if (!obrigacao) return setEstado({ erro: "Escolha a obrigação." });
    iniciar(async () => {
      const r = await criarTarefa({
        clienteId: cliente.id,
        obrigacaoId: obrigacao.id,
        competencia,
        prazoLegal: legal,
        prazoMeta: meta,
        responsavelId: responsavel,
        observacao,
      });
      if (r.ok) aoCriar(r.ok);
      else setEstado(r);
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
        aria-labelledby="nova-tarefa-titulo"
        className="relative flex max-h-[92vh] w-full max-w-2xl animate-surgir flex-col overflow-hidden rounded-t-card bg-superficie ring-1 ring-borda shadow-modal sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-4 border-b border-borda px-6 py-5">
          <div>
            <h2 id="nova-tarefa-titulo" className="font-display text-2xl text-texto">
              Nova tarefa
            </h2>
            <p className="mt-1 text-sm text-texto-suave">
              Uma obrigação do catálogo para um cliente, fora da geração automática.
            </p>
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

        <div className="rolagem-discreta grid gap-5 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          {estado?.erro && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo sm:col-span-2"
            >
              <AlertCircle className="size-4 shrink-0" />
              {estado.erro}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:col-span-2">
            <span id="nt-cliente" className="text-sm font-semibold text-texto">
              Cliente
            </span>
            <BuscaCliente
              selecionado={cliente}
              aoEscolher={(c) => {
                setCliente(c);
                sugerirResponsavel(c, obrigacao);
              }}
            />
          </div>

          <label className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm font-semibold text-texto">Obrigação</span>
            <select
              required
              value={obrigacaoId || ""}
              onChange={(e) => {
                const o = obrigacoes.find((x) => x.id === Number(e.target.value)) ?? null;
                setObrigacaoId(o?.id ?? 0);
                sugerirPrazos(o, competencia);
                sugerirResponsavel(cliente, o);
              }}
              className={`${campo} cursor-pointer`}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {departamentos.map((d) => {
                const doDep = obrigacoes.filter((o) => o.departamento_id === d.id);
                if (!doDep.length) return null;
                return (
                  <optgroup key={d.id} label={d.nome}>
                    {doDep.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome} · {rotulosPeriodicidade[o.periodicidade].toLowerCase()}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">Competência</span>
            <input
              type="month"
              required
              value={competencia}
              onChange={(e) => {
                setCompetencia(e.target.value);
                sugerirPrazos(obrigacao, e.target.value);
              }}
              className={campo}
            />
            {foraDaPeriodicidade && (
              <span className="text-xs text-alerta">
                Obrigação {rotulosPeriodicidade[obrigacao.periodicidade].toLowerCase()}: normalmente não é gerada nesta
                competência.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">Responsável</span>
            <select
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className={`${campo} cursor-pointer`}
            >
              <option value="">Sem responsável</option>
              {equipe.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">Prazo legal</span>
            <input type="date" required value={legal} onChange={(e) => setLegal(e.target.value)} className={campo} />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">
              Meta interna <span className="font-normal text-texto-suave">(opcional)</span>
            </span>
            <input
              type="date"
              value={meta}
              max={legal || undefined}
              onChange={(e) => setMeta(e.target.value)}
              className={campo}
            />
          </label>
          {obrigacao && (
            <p className="-mt-2 text-xs text-texto-suave sm:col-span-2">
              Prazos calculados pela regra da obrigação (dia útil e feriados). Ajuste se precisar.
            </p>
          )}

          <label className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm font-semibold text-texto">
              Observação <span className="font-normal text-texto-suave">(opcional)</span>
            </span>
            <textarea
              rows={2}
              maxLength={500}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: retificação pedida pelo cliente"
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
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" strokeWidth={2.4} />
            )}
            {salvando ? "Criando…" : "Criar tarefa"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Campo de busca de cliente com lista de sugestões (busca no servidor).
export function BuscaCliente({
  selecionado,
  aoEscolher,
}: {
  selecionado: ClienteNovaTarefa | null;
  aoEscolher: (c: ClienteNovaTarefa | null) => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ClienteNovaTarefa[]>([]);
  const [ativo, setAtivo] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const ultima = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selecionado || termo.trim().length < 2) return;
    const id = ++ultima.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      const r = await buscarClientesTarefa(termo);
      if (id !== ultima.current) return; // chegou uma busca mais nova
      setResultados(r);
      setAtivo(0);
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [termo, selecionado]);

  if (selecionado) {
    return (
      <span className="flex h-11 items-center justify-between gap-3 rounded-bloco border border-primaria bg-suave px-4 text-sm">
        <span className="min-w-0 truncate font-semibold text-texto">
          {selecionado.codigo_dominio !== null && (
            <span className="font-medium text-texto-suave tabular-nums">{selecionado.codigo_dominio} · </span>
          )}
          {selecionado.fantasia || selecionado.razao_social}
        </span>
        <button
          type="button"
          onClick={() => {
            aoEscolher(null);
            setTermo("");
            setResultados([]);
            requestAnimationFrame(() => input.current?.focus());
          }}
          className="shrink-0 text-xs font-semibold text-destaque hover:underline"
        >
          Trocar
        </button>
      </span>
    );
  }

  const mostrar = termo.trim().length >= 2;
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-texto-suave" />
      <input
        ref={input}
        autoFocus
        value={termo}
        aria-labelledby="nt-cliente"
        role="combobox"
        aria-expanded={mostrar && resultados.length > 0}
        aria-controls="nt-clientes"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Nome, fantasia, código ou CNPJ"
        onChange={(e) => {
          setTermo(e.target.value);
          if (e.target.value.trim().length < 2) setResultados([]);
        }}
        onKeyDown={(e) => {
          if (!resultados.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAtivo((a) => (a + 1) % resultados.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((a) => (a - 1 + resultados.length) % resultados.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            aoEscolher(resultados[ativo]);
          }
        }}
        className={`${campo} pl-10`}
      />
      {buscando && (
        <LoaderCircle className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-destaque" />
      )}
      {mostrar && !buscando && (
        <ul
          id="nt-clientes"
          role="listbox"
          className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-64 overflow-y-auto rounded-bloco border border-borda bg-superficie p-1.5 shadow-elevado"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-texto-suave">Nenhum cliente ativo encontrado.</li>
          ) : (
            resultados.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === ativo}
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  aoEscolher(c);
                }}
                className={`cursor-pointer rounded-[10px] px-3 py-2 text-sm ${i === ativo ? "bg-suave" : ""}`}
              >
                <span className="block truncate font-semibold text-texto">
                  {c.codigo_dominio !== null && (
                    <span className="font-medium text-texto-suave tabular-nums">{c.codigo_dominio} · </span>
                  )}
                  {c.fantasia || c.razao_social}
                </span>
                {c.fantasia && <span className="block truncate text-xs text-texto-suave">{c.razao_social}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
