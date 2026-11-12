"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Building2,
  CalendarClock,
  FileBadge,
  FileSignature,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  ScrollText,
  Search,
  Store,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Vencimento } from "@/lib/vencimentos";
import { diasAte, quando, situacao, TIPOS_VENCIMENTO, type Situacao, type TipoVencimento } from "@/lib/vencimentos-regras";
import { arquivarVencimento, buscarClientesVencimento, excluirVencimento, renovarVencimento, salvarVencimento } from "@/lib/vencimentos-actions";
import { SeletorCliente, type ClienteEscolhido } from "@/components/documentos/seletor-cliente";

type Estado = { ok?: string; erro?: string } | null;

const ICONE: Record<TipoVencimento, LucideIcon> = {
  certificado_digital: KeyRound,
  alvara: Store,
  licenca: BadgeCheck,
  procuracao: FileSignature,
  contrato: ScrollText,
  outro: FileBadge,
};
const COR: Record<Situacao, { borda: string; texto: string; fundo: string; rotulo: string }> = {
  vencido: { borda: "border-l-perigo", texto: "text-perigo", fundo: "bg-perigo-suave", rotulo: "Vencidos" },
  vencendo: { borda: "border-l-alerta", texto: "text-alerta", fundo: "bg-alerta-suave", rotulo: "Vencendo" },
  em_dia: { borda: "border-l-sucesso-forte", texto: "text-sucesso", fundo: "bg-sucesso-suave", rotulo: "Em dia" },
};
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function MonitorVencimentos({ itens, hoje, arquivados, gestor }: { itens: Vencimento[]; hoje: string; arquivados: boolean; gestor: boolean }) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<TipoVencimento | "">("");
  const [sit, setSit] = useState<Situacao | "">("");
  const [editando, setEditando] = useState<Vencimento | "novo" | null>(null);
  const [estado, setEstado] = useState<Estado>(null);
  const [pendente, executar] = useTransition();

  const comSituacao = useMemo(
    () => itens.map((v) => ({ v, dias: diasAte(v.vence_em, hoje), sit: situacao(diasAte(v.vence_em, hoje), v.avisar_dias) })),
    [itens, hoje],
  );
  const contagem = (s: Situacao) => comSituacao.filter((x) => x.sit === s).length;
  const visiveis = comSituacao.filter(
    ({ v, sit: s }) =>
      (!tipo || v.tipo === tipo) &&
      (!sit || s === sit) &&
      (!busca || semAcento(`${v.descricao} ${v.identificador ?? ""} ${v.cliente?.razao_social ?? "escritorio"} ${v.cliente?.codigo_dominio ?? ""}`).includes(semAcento(busca))),
  );

  const acao = (fn: () => Promise<Estado>) =>
    executar(async () => {
      setEstado(await fn());
    });

  return (
    <div className="flex flex-col gap-6">
      {!arquivados && (
        <div className="grid gap-3 sm:grid-cols-3">
          {(["vencido", "vencendo", "em_dia"] as Situacao[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSit(sit === s ? "" : s)}
              className={`rounded-card bg-superficie px-5 py-4 text-left ring-2 transition ${sit === s ? "ring-primaria" : "ring-borda hover:ring-areia"}`}
            >
              <p className="text-xs text-texto-suave">{COR[s].rotulo}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${contagem(s) && s !== "em_dia" ? COR[s].texto : "text-texto"}`}>{contagem(s)}</p>
              <p className="text-xs text-texto-suave">{s === "vencido" ? "já passaram da data" : s === "vencendo" ? "dentro do prazo de aviso" : "fora do prazo de aviso"}</p>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-texto-suave" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Cliente, descrição ou número"
            className="h-11 w-full rounded-full border border-borda bg-superficie pr-4 pl-11 text-sm outline-none focus:border-primaria"
          />
        </label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoVencimento | "")}
          className="h-11 rounded-full border border-borda bg-superficie px-4 text-sm text-texto"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS_VENCIMENTO).map(([k, r]) => (
            <option key={k} value={k}>
              {r}
            </option>
          ))}
        </select>
        {!arquivados && (
          <button
            type="button"
            onClick={() => setEditando("novo")}
            className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover"
          >
            <Plus className="size-4" /> Cadastrar
          </button>
        )}
        <Link
          href={arquivados ? "/automacoes/vencimentos" : "/automacoes/vencimentos?arquivados=1"}
          className="flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave hover:text-texto"
        >
          {arquivados ? <CalendarClock className="size-4" /> : <Archive className="size-4" />}
          {arquivados ? "Ver ativos" : "Arquivados"}
        </Link>
      </div>

      {(estado?.erro || estado?.ok) && (
        <p role="status" className={`rounded-bloco px-4 py-2.5 text-sm font-semibold ${estado?.erro ? "bg-perigo-suave text-perigo" : "bg-sucesso-suave text-sucesso"}`}>
          {estado?.erro ?? estado?.ok}
        </p>
      )}

      {editando && (
        <Formulario
          key={editando === "novo" ? "novo" : editando.id}
          item={editando === "novo" ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={(r) => {
            setEstado(r);
            if (!r.erro) setEditando(null);
          }}
        />
      )}

      {visiveis.length === 0 ? (
        <div className="rounded-card bg-superficie ring-1 ring-borda px-6 py-10 text-center text-sm text-texto-suave">
          {itens.length === 0
            ? arquivados
              ? "Nenhum item arquivado."
              : "Nada cadastrado ainda. Comece pelos certificados digitais dos clientes."
            : "Nenhum item com estes filtros."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visiveis.map(({ v, dias, sit: s }) => (
            <Linha
              key={v.id}
              v={v}
              dias={dias}
              sit={arquivados ? null : s}
              gestor={gestor}
              pendente={pendente}
              onEditar={() => setEditando(v)}
              onRenovar={(data) => acao(() => renovarVencimento(v.id, data))}
              onArquivar={() => acao(() => arquivarVencimento(v.id, arquivados))}
              onExcluir={() => confirm(`Excluir "${v.descricao}"?`) && acao(() => excluirVencimento(v.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Linha({
  v,
  dias,
  sit,
  gestor,
  pendente,
  onEditar,
  onRenovar,
  onArquivar,
  onExcluir,
}: {
  v: Vencimento;
  dias: number;
  sit: Situacao | null;
  gestor: boolean;
  pendente: boolean;
  onEditar: () => void;
  onRenovar: (data: string) => void;
  onArquivar: () => void;
  onExcluir: () => void;
}) {
  const [renovando, setRenovando] = useState(false);
  const [nova, setNova] = useState("");
  const Icone = ICONE[v.tipo];
  const cor = sit ? COR[sit] : null;
  return (
    <li className={`group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border-l-4 bg-superficie px-4 py-3 ${cor?.borda ?? "border-l-borda"}`}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cor ? `${cor.fundo} ${cor.texto}` : "bg-suave text-texto-suave"}`}>
        <Icone className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate font-semibold text-texto">
          {v.descricao}
          {v.identificador && <span className="font-normal text-texto-suave"> · {v.identificador}</span>}
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-texto-suave">
          <Building2 className="size-3.5 shrink-0" />
          {v.cliente ? `${v.cliente.codigo_dominio ? `${v.cliente.codigo_dominio} · ` : ""}${v.cliente.razao_social}` : "Escritório"}
          <span className="text-borda">•</span> {TIPOS_VENCIMENTO[v.tipo]}
        </p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold tabular-nums ${cor?.texto ?? "text-texto-suave"}`}>{dataBR(v.vence_em)}</p>
        <p className="text-xs text-texto-suave">{sit ? quando(dias) : "arquivado"} · avisa {v.avisar_dias} dias antes</p>
      </div>

      <div className="flex items-center gap-1">
        {renovando ? (
          <span className="flex items-center gap-1">
            <input
              type="date"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              className="h-9 rounded-bloco border border-borda px-2 text-sm"
              aria-label="Novo vencimento"
            />
            <button
              type="button"
              disabled={!nova || pendente}
              onClick={() => {
                onRenovar(nova);
                setRenovando(false);
              }}
              className="h-9 rounded-full bg-sucesso-forte px-3 text-xs font-bold text-white disabled:opacity-40"
            >
              {pendente ? <LoaderCircle className="size-4 animate-spin" /> : "OK"}
            </button>
            <button type="button" onClick={() => setRenovando(false)} className="rounded-full p-1.5 text-texto-suave hover:bg-suave" aria-label="Cancelar">
              <X className="size-4" />
            </button>
          </span>
        ) : (
          <>
            {sit && (
              <button
                type="button"
                onClick={() => setRenovando(true)}
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-sucesso hover:bg-sucesso-suave"
                title="Renovou: informe a nova data"
              >
                <RefreshCcw className="size-3.5" /> Renovar
              </button>
            )}
            <button type="button" onClick={onEditar} className="rounded-full p-2 text-texto-suave hover:bg-suave hover:text-texto" title="Editar" aria-label="Editar">
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              disabled={pendente}
              onClick={onArquivar}
              className="rounded-full p-2 text-texto-suave hover:bg-suave hover:text-texto"
              title={sit ? "Arquivar (não avisa mais)" : "Reativar"}
              aria-label={sit ? "Arquivar" : "Reativar"}
            >
              {sit ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
            </button>
            {gestor && (
              <button
                type="button"
                disabled={pendente}
                onClick={onExcluir}
                className="rounded-full p-2 text-texto-suave hover:bg-perigo-suave hover:text-perigo"
                title="Excluir"
                aria-label="Excluir"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function Formulario({ item, onFechar, onSalvo }: { item: Vencimento | null; onFechar: () => void; onSalvo: (r: Estado & object) => void }) {
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(item?.cliente ?? null);
  const [doEscritorio, setDoEscritorio] = useState(Boolean(item && !item.cliente));
  const [tipo, setTipo] = useState<string>(item?.tipo ?? "certificado_digital");
  const [descricao, setDescricao] = useState(item?.descricao ?? "");
  const [identificador, setIdentificador] = useState(item?.identificador ?? "");
  const [venceEm, setVenceEm] = useState(item?.vence_em ?? "");
  const [avisar, setAvisar] = useState(item?.avisar_dias ?? 30);
  const [observacao, setObservacao] = useState(item?.observacao ?? "");
  const [pendente, executar] = useTransition();
  const campo = "h-10 w-full rounded-bloco border border-borda bg-superficie px-3 text-sm text-texto focus:border-primaria focus:outline-none";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        executar(async () =>
          onSalvo(
            await salvarVencimento({
              id: item?.id,
              clienteId: doEscritorio ? null : (cliente?.id ?? null),
              tipo,
              descricao,
              identificador,
              venceEm,
              avisarDias: avisar,
              observacao,
            }),
          ),
        );
      }}
      className="rounded-card bg-superficie p-5 ring-2 ring-primaria/20"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-texto">{item ? "Editar vencimento" : "Cadastrar vencimento"}</h2>
        <button type="button" onClick={onFechar} className="rounded-full p-2 text-texto-suave hover:bg-suave" aria-label="Fechar">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-6">
        <div className="flex flex-col gap-1 text-sm sm:col-span-4">
          <span className="text-xs font-semibold text-texto-suave">Cliente</span>
          {doEscritorio ? (
            <p className="flex h-10 items-center gap-2 text-sm font-semibold text-texto">
              <Building2 className="size-4 text-destaque" /> Escritório
            </p>
          ) : (
            <SeletorCliente valor={cliente} onEscolher={setCliente} buscar={buscarClientesVencimento} />
          )}
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-texto sm:col-span-2">
          <input type="checkbox" checked={doEscritorio} onChange={(e) => setDoEscritorio(e.target.checked)} className="size-4 accent-primaria" />
          É do escritório
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-texto-suave">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
            {Object.entries(TIPOS_VENCIMENTO).map(([k, r]) => (
              <option key={k} value={k}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-4">
          <span className="text-xs font-semibold text-texto-suave">Descrição</span>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={200}
            placeholder="Ex.: e-CNPJ A1, Alvará de funcionamento"
            className={campo}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-texto-suave">Vence em</span>
          <input type="date" value={venceEm} onChange={(e) => setVenceEm(e.target.value)} className={campo} required />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-texto-suave">Avisar quantos dias antes</span>
          <input type="number" min={1} max={180} value={avisar} onChange={(e) => setAvisar(Number(e.target.value))} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-texto-suave">Número / titular (opcional)</span>
          <input value={identificador} onChange={(e) => setIdentificador(e.target.value)} maxLength={200} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-6">
          <span className="text-xs font-semibold text-texto-suave">Observação (opcional)</span>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} className={campo} />
        </label>
      </div>
      <p className="mt-3 text-xs text-texto-suave">
        Avisos por e-mail nos dias úteis: {avisar} dias antes, 15, 7 e 1 dia antes, no dia e quando vencer. Item de cliente avisa os
        responsáveis dele, gestores e admins; do escritório, gestores e admins.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="h-10 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pendente || (!doEscritorio && !cliente)}
          title={!doEscritorio && !cliente ? "Escolha o cliente ou marque “É do escritório”" : undefined}
          className="flex h-10 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover disabled:opacity-50"
        >
          {pendente && <LoaderCircle className="size-4 animate-spin" />} Salvar
        </button>
      </div>
    </form>
  );
}
