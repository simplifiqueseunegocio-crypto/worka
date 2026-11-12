"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ChevronDown, FileText, LoaderCircle, Plus, Trash2, Upload, X } from "lucide-react";
import type { Certidao, SituacaoCertidao, TipoDoCliente } from "@/lib/certidoes";
import { definirAcompanhamento, excluirCertidao, lancarCertidao, type EstadoCertidao } from "@/lib/certidoes-actions";

const LIMITE_PDF = 4 * 1024 * 1024; // igual a lib/certidoes.ts
const campo =
  "h-11 w-full rounded-bloco border border-borda bg-superficie px-4 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";

export const situacoes: Record<SituacaoCertidao, { rotulo: string; classe: string }> = {
  negativa: { rotulo: "Negativa", classe: "bg-sucesso-suave text-sucesso" },
  positiva_efeito_negativa: { rotulo: "Positiva c/ efeito de negativa", classe: "bg-info-suave text-info" },
  positiva: { rotulo: "Positiva", classe: "bg-perigo-suave text-perigo" },
};

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dias = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function CertidoesCliente({
  clienteId,
  tipos,
  certidoes,
  hoje,
  usuarioId,
  gestor,
}: {
  clienteId: string;
  tipos: TipoDoCliente[];
  certidoes: Certidao[];
  hoje: string;
  usuarioId: string;
  gestor: boolean; // admin ou gestor: escolhe os tipos e exclui qualquer certidão
}) {
  const [lancando, setLancando] = useState<number | "escolher" | null>(null);
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<EstadoCertidao | null>(null);

  // Na lista: os acompanhados e os que já têm certidão lançada.
  const visiveis = tipos.filter((t) => t.acompanha || certidoes.some((c) => c.tipo_id === t.id));
  const abrir = (tipo: number | "escolher") => {
    setAviso(null);
    setVersao((v) => v + 1);
    setLancando(tipo);
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-texto">Certidões emitidas</h2>
          <p className="text-sm text-texto-suave">Lançadas pela equipe, com o PDF e a validade.</p>
        </div>
        <button
          type="button"
          onClick={() => abrir("escolher")}
          className="flex h-10 items-center gap-2 rounded-full bg-primaria px-4 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
        >
          <Plus className="size-4" strokeWidth={2.4} /> Lançar certidão
        </button>
      </div>

      {aviso && (
        <p role="status" className={`mt-3 text-xs font-semibold ${aviso.erro ? "text-perigo" : "text-sucesso"}`}>
          {aviso.erro ?? aviso.ok}
        </p>
      )}

      {visiveis.length === 0 ? (
        <p className="mt-5 rounded-bloco bg-fundo px-4 py-6 text-center text-sm text-texto-suave">
          O cliente não acompanha nenhuma certidão.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-borda border-y border-borda">
          {visiveis.map((t) => (
            <LinhaTipo
              key={t.id}
              tipo={t}
              certidoes={certidoes.filter((c) => c.tipo_id === t.id)}
              hoje={hoje}
              podeExcluir={(c) => gestor || c.criado_por?.id === usuarioId}
              aoLancar={() => abrir(t.id)}
              aoAvisar={setAviso}
            />
          ))}
        </ul>
      )}

      <EscolhaTipos clienteId={clienteId} tipos={tipos} gestor={gestor} aoAvisar={setAviso} />

      {lancando !== null &&
        createPortal(
          <Formulario
            key={versao}
            clienteId={clienteId}
            tipos={tipos}
            tipoInicial={lancando === "escolher" ? null : lancando}
            hoje={hoje}
            aoFechar={() => setLancando(null)}
            aoLancar={(r) => {
              setAviso(r);
              setLancando(null);
            }}
          />,
          document.body,
        )}
    </>
  );
}

function Validade({ certidao: c, hoje }: { certidao: Certidao; hoje: string }) {
  if (!c.valida_ate) return <span className="text-xs text-texto-suave">Sem validade informada</span>;
  const n = dias(hoje, c.valida_ate);
  if (n < 0)
    return (
      <span className="text-xs font-semibold text-perigo">
        Vencida em {dataBr(c.valida_ate)} · há {-n} {-n === 1 ? "dia" : "dias"}
      </span>
    );
  return (
    <span className={`text-xs ${n <= 15 ? "font-semibold text-alerta" : "text-texto-suave"}`}>
      Válida até {dataBr(c.valida_ate)} · {n === 0 ? "vence hoje" : n === 1 ? "vence amanhã" : `vence em ${n} dias`}
    </span>
  );
}

function Situacao({ situacao }: { situacao: SituacaoCertidao }) {
  const { rotulo, classe } = situacoes[situacao];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${classe}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {rotulo}
    </span>
  );
}

function LinhaTipo({
  tipo: t,
  certidoes,
  hoje,
  podeExcluir,
  aoLancar,
  aoAvisar,
}: {
  tipo: TipoDoCliente;
  certidoes: Certidao[];
  hoje: string;
  podeExcluir: (c: Certidao) => boolean;
  aoLancar: () => void;
  aoAvisar: (e: EstadoCertidao) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = certidoes[0];

  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-texto">
            {t.nome}
            {!t.acompanha && (
              <span className="rounded-full bg-suave px-2 py-0.5 text-[11px] font-semibold text-texto-suave">
                Não acompanha
              </span>
            )}
          </span>
          {atual ? (
            <Validade certidao={atual} hoje={hoje} />
          ) : (
            <span className="text-xs text-texto-suave">{t.orgao ?? "Nenhuma lançada"}</span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {atual ? (
            <>
              <Situacao situacao={atual.situacao} />
              {atual.tem_arquivo && <LinkPdf certidao={atual} />}
              <button
                type="button"
                onClick={() => setAberto((v) => !v)}
                aria-expanded={aberto}
                className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-texto-suave hover:bg-suave hover:text-texto"
              >
                {certidoes.length === 1 ? "Detalhes" : `Histórico (${certidoes.length})`}
                <ChevronDown className={`size-3.5 transition-transform ${aberto ? "rotate-180" : ""}`} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={aoLancar}
              className="flex h-8 items-center gap-1 rounded-full border border-dashed border-borda px-3 text-xs font-semibold text-destaque hover:border-primaria hover:bg-suave"
            >
              <Plus className="size-3.5" /> Lançar
            </button>
          )}
        </span>
      </div>

      {aberto && (
        <ul className="mt-3 flex flex-col gap-2 rounded-bloco bg-fundo p-2">
          {certidoes.map((c) => (
            <ItemHistorico key={c.id} certidao={c} hoje={hoje} podeExcluir={podeExcluir(c)} aoAvisar={aoAvisar} />
          ))}
        </ul>
      )}
    </li>
  );
}

function LinkPdf({ certidao }: { certidao: Certidao }) {
  return (
    <a
      href={`/certidoes/${certidao.id}/arquivo`}
      target="_blank"
      rel="noopener"
      title={certidao.arquivo_nome ?? "PDF"}
      className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-destaque hover:bg-suave"
    >
      <FileText className="size-3.5" /> PDF
    </a>
  );
}

function ItemHistorico({
  certidao: c,
  hoje,
  podeExcluir,
  aoAvisar,
}: {
  certidao: Certidao;
  hoje: string;
  podeExcluir: boolean;
  aoAvisar: (e: EstadoCertidao) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-superficie px-3 py-2.5">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-texto tabular-nums">Emitida em {dataBr(c.emitida_em)}</span>
          <Situacao situacao={c.situacao} />
        </span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-texto-suave">
          <Validade certidao={c} hoje={hoje} />
          {c.criado_por && <span>Lançada por {c.criado_por.nome}</span>}
        </span>
        {c.observacao && <span className="mt-1 block text-xs text-texto-suave">{c.observacao}</span>}
      </span>
      <span className="flex items-center gap-1">
        {c.tem_arquivo && <LinkPdf certidao={c} />}
        {podeExcluir &&
          (confirmando ? (
            <button
              type="button"
              autoFocus
              disabled={pendente}
              onBlur={() => setConfirmando(false)}
              onClick={() => iniciar(async () => aoAvisar(await excluirCertidao(c.id)))}
              className="h-8 rounded-full bg-perigo-forte px-3 text-xs font-bold text-white"
            >
              {pendente ? "Excluindo…" : "Excluir?"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-perigo-suave hover:text-perigo"
              aria-label={`Excluir certidão emitida em ${dataBr(c.emitida_em)}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          ))}
      </span>
    </li>
  );
}

// Quais certidões o cliente acompanha. Admin e gestor alteram.
function EscolhaTipos({
  clienteId,
  tipos,
  gestor,
  aoAvisar,
}: {
  clienteId: string;
  tipos: TipoDoCliente[];
  gestor: boolean;
  aoAvisar: (e: EstadoCertidao) => void;
}) {
  const ativos = tipos.filter((t) => t.ativo);
  if (!gestor) {
    const fora = ativos.filter((t) => !t.acompanha);
    if (!fora.length) return null;
    return (
      <p className="mt-4 text-xs text-texto-suave">
        Não acompanha: {fora.map((t) => t.nome).join(", ")}. Só admin ou gestor altera.
      </p>
    );
  }
  return (
    <div className="mt-5">
      <p className="text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">
        Certidões que o cliente acompanha
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ativos.map((t) => (
          <ChipTipo key={t.id} clienteId={clienteId} tipo={t} aoAvisar={aoAvisar} />
        ))}
      </div>
      <p className="mt-2 text-xs text-texto-suave">
        Desligar um tipo com consulta automática (Federal, FGTS, Estadual, Municipal) tira o cliente dessa consulta.
      </p>
    </div>
  );
}

function ChipTipo({
  clienteId,
  tipo: t,
  aoAvisar,
}: {
  clienteId: string;
  tipo: TipoDoCliente;
  aoAvisar: (e: EstadoCertidao) => void;
}) {
  const [acompanha, setAcompanha] = useOptimistic(t.acompanha);
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acompanha}
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          setAcompanha(!acompanha);
          aoAvisar(await definirAcompanhamento(clienteId, t.id, !acompanha));
        })
      }
      title={t.orgao ?? undefined}
      className={`flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors disabled:opacity-70 ${
        acompanha
          ? "bg-primaria text-sobre-primaria hover:bg-primaria-hover"
          : "border border-dashed border-borda text-texto-suave hover:bg-suave"
      }`}
    >
      {acompanha ? "✓" : <Plus className="size-3.5" />} {t.nome}
    </button>
  );
}

function Formulario({
  clienteId,
  tipos,
  tipoInicial,
  hoje,
  aoFechar,
  aoLancar,
}: {
  clienteId: string;
  tipos: TipoDoCliente[];
  tipoInicial: number | null;
  hoje: string;
  aoFechar: () => void;
  aoLancar: (r: EstadoCertidao) => void;
}) {
  const [tipoId, setTipoId] = useState(tipoInicial ?? 0);
  const [emitida, setEmitida] = useState(hoje);
  const [valida, setValida] = useState(() => {
    const t = tipos.find((x) => x.id === tipoInicial);
    return t?.validade_dias ? somarDias(hoje, t.validade_dias) : "";
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

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

  // Validade sugerida pelo tipo (catálogo); continua editável.
  const sugerir = (id: number, data: string) => {
    const t = tipos.find((x) => x.id === id);
    if (t?.validade_dias && /^\d{4}-\d{2}-\d{2}$/.test(data)) setValida(somarDias(data, t.validade_dias));
  };

  const acompanhados = tipos.filter((t) => t.acompanha);
  const outros = tipos.filter((t) => !t.acompanha && t.ativo);

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tipoId) return setErro("Escolha o tipo da certidão.");
    if (arquivo && arquivo.size > LIMITE_PDF) return setErro("PDF maior que 4 MB.");
    const form = new FormData(e.currentTarget);
    form.set("clienteId", clienteId);
    form.set("tipoId", String(tipoId));
    if (arquivo) form.set("arquivo", arquivo);
    iniciar(async () => {
      const r: EstadoCertidao = await lancarCertidao(form).catch(() => ({ erro: "Falha de conexão. Tente de novo." }));
      if (r.ok) aoLancar(r);
      else setErro(r.erro ?? "Não foi possível lançar.");
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
        aria-labelledby="lancar-certidao"
        className="relative flex max-h-[92vh] w-full max-w-xl animate-surgir flex-col overflow-hidden rounded-t-card bg-superficie ring-1 ring-borda shadow-modal sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-4 border-b border-borda px-6 py-5">
          <div>
            <h2 id="lancar-certidao" className="font-display text-2xl text-texto">
              Lançar certidão
            </h2>
            <p className="mt-1 text-sm text-texto-suave">Uma certidão já emitida no site do órgão.</p>
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
          {erro && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo sm:col-span-2"
            >
              <AlertCircle className="size-4 shrink-0" /> {erro}
            </p>
          )}

          <label className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm font-semibold text-texto">Certidão</span>
            <select
              required
              value={tipoId || ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setTipoId(id);
                sugerir(id, emitida);
              }}
              className={`${campo} cursor-pointer`}
            >
              <option value="" disabled>
                Escolha…
              </option>
              <optgroup label="Acompanhadas pelo cliente">
                {acompanhados.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                    {t.orgao ? ` · ${t.orgao}` : ""}
                  </option>
                ))}
              </optgroup>
              {outros.length > 0 && (
                <optgroup label="Outras">
                  {outros.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                      {t.orgao ? ` · ${t.orgao}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="mb-2 text-sm font-semibold text-texto">Situação</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(situacoes) as SituacaoCertidao[]).map((s, i) => (
                <label
                  key={s}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-bloco border border-borda px-3 py-2 text-sm font-medium text-texto transition has-checked:border-primaria has-checked:bg-suave"
                >
                  <input type="radio" name="situacao" value={s} defaultChecked={i === 0} className="accent-primaria" />
                  {situacoes[s].rotulo}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">Emitida em</span>
            <input
              type="date"
              name="emitidaEm"
              required
              max={hoje}
              value={emitida}
              onChange={(e) => {
                setEmitida(e.target.value);
                sugerir(tipoId, e.target.value);
              }}
              className={campo}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">
              Válida até <span className="font-normal text-texto-suave">(opcional)</span>
            </span>
            <input
              type="date"
              name="validaAte"
              min={emitida}
              value={valida}
              onChange={(e) => setValida(e.target.value)}
              className={campo}
            />
          </label>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm font-semibold text-texto">
              PDF da certidão <span className="font-normal text-texto-suave">(opcional, até 4 MB)</span>
            </span>
            {arquivo ? (
              <span className="flex h-11 items-center justify-between gap-3 rounded-bloco border border-primaria bg-suave px-4 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-semibold text-texto">
                  <FileText className="size-4 shrink-0 text-destaque" />
                  <span className="truncate">{arquivo.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setArquivo(null)}
                  className="shrink-0 text-xs font-semibold text-destaque hover:underline"
                >
                  Trocar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => entrada.current?.click()}
                className="flex h-11 items-center justify-center gap-2 rounded-bloco border-2 border-dashed border-borda text-sm font-semibold text-texto-suave transition hover:border-primaria/40 hover:bg-suave/60"
              >
                <Upload className="size-4" /> Escolher PDF
              </button>
            )}
            <input
              ref={entrada}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>

          <label className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm font-semibold text-texto">
              Observação <span className="font-normal text-texto-suave">(opcional)</span>
            </span>
            <input name="observacao" maxLength={500} autoComplete="off" className={campo} />
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
            {salvando ? "Lançando…" : "Lançar certidão"}
          </button>
        </div>
      </form>
    </div>
  );
}
