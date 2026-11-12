"use client";

import { useActionState, useMemo, useState, useTransition, type ReactNode } from "react";
import { AlertCircle, CalendarClock, LoaderCircle, Pencil, Plus } from "lucide-react";
import { alterarAtivoObrigacao, salvarObrigacao, type EstadoObrigacao } from "@/lib/obrigacoes-actions";
import {
  descreverMeta,
  descreverVencimento,
  proximosVencimentos,
  rotulosAjuste,
  rotulosPeriodicidade,
  rotulosRegime,
  type Ajuste,
  type Periodicidade,
  type RegimeObrigacao,
} from "@/lib/prazos";
import { competenciaCurta, dataCurta } from "@/components/tarefas/prazo";

export type DadosObrigacao = {
  id: number;
  nome: string;
  departamento_id: number;
  periodicidade: Periodicidade;
  dia_vencimento: number;
  meses_apos: number;
  ajuste: Ajuste;
  meta_dias_antes: number;
  regimes: RegimeObrigacao[];
};

type Contexto = {
  departamentos: { id: number; nome: string; cor: string }[];
  feriados: string[];
  hoje: string;
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const campo =
  "h-11 w-full rounded-bloco border border-borda bg-superficie px-4 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";
const rotulo = "text-sm font-semibold text-texto";

function opcoesMeses(p: Periodicidade) {
  return Array.from({ length: 13 }, (_, n) => ({
    valor: n,
    rotulo:
      p === "anual"
        ? n === 0
          ? "Dezembro do próprio ano-base"
          : `${MESES[(11 + n) % 12]} do ano seguinte`
        : n === 0
          ? p === "trimestral"
            ? "No último mês do trimestre"
            : "No mesmo mês da competência"
          : n === 1
            ? "No mês seguinte"
            : `${n} meses depois`,
  }));
}

// ---------------------------------------------------------------------------
// Formulário (criar ou editar), com a prévia dos próximos vencimentos.

function Formulario({
  inicial,
  contexto,
  aoFechar,
}: {
  inicial: DadosObrigacao | null;
  contexto: Contexto;
  aoFechar: (resultado?: EstadoObrigacao) => void;
}) {
  const [estado, acao, salvando] = useActionState<EstadoObrigacao, FormData>(async (anterior, form) => {
    const r = await salvarObrigacao(anterior, form);
    if (r.ok) aoFechar(r);
    return r;
  }, {});
  const [regra, setRegra] = useState({
    periodicidade: inicial?.periodicidade ?? ("mensal" as Periodicidade),
    dia_vencimento: inicial?.dia_vencimento ?? 20,
    meses_apos: inicial?.meses_apos ?? 1,
    ajuste: inicial?.ajuste ?? ("antecipa" as Ajuste),
    meta_dias_antes: inicial?.meta_dias_antes ?? 3,
  });
  const feriados = useMemo(() => new Set(contexto.feriados), [contexto.feriados]);
  const valida = regra.dia_vencimento >= 1 && regra.dia_vencimento <= 31 && regra.meta_dias_antes >= 0;
  const proximos = valida ? proximosVencimentos(regra, contexto.hoje, feriados, 3) : [];
  const mudar = (campo: keyof typeof regra, valor: string | number) => setRegra((r) => ({ ...r, [campo]: valor }));

  return (
    <form action={acao} className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {inicial && <input type="hidden" name="id" value={inicial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {estado.erro && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo sm:col-span-2"
          >
            <AlertCircle className="size-4 shrink-0" />
            {estado.erro}
          </p>
        )}

        <label className="flex flex-col gap-2 sm:col-span-2">
          <span className={rotulo}>Nome</span>
          <input name="nome" required defaultValue={inicial?.nome} placeholder="Ex.: DCTFWeb" className={campo} />
        </label>

        <label className="flex flex-col gap-2">
          <span className={rotulo}>Departamento</span>
          <select
            name="departamento_id"
            defaultValue={inicial?.departamento_id ?? contexto.departamentos[0]?.id}
            className={`${campo} cursor-pointer`}
          >
            {contexto.departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className={rotulo}>Periodicidade</span>
          <select
            name="periodicidade"
            value={regra.periodicidade}
            onChange={(e) => mudar("periodicidade", e.target.value)}
            className={`${campo} cursor-pointer`}
          >
            {(Object.keys(rotulosPeriodicidade) as Periodicidade[]).map((p) => (
              <option key={p} value={p}>
                {rotulosPeriodicidade[p]}
              </option>
            ))}
          </select>
          {regra.periodicidade !== "mensal" && (
            <span className="text-xs text-texto-suave">
              {regra.periodicidade === "trimestral"
                ? "Gerada nas competências de março, junho, setembro e dezembro."
                : "Gerada na competência de dezembro (ano-base)."}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className={rotulo}>Dia do vencimento</span>
          <input
            name="dia_vencimento"
            type="number"
            min={1}
            max={31}
            required
            value={regra.dia_vencimento}
            onChange={(e) => mudar("dia_vencimento", Number(e.target.value))}
            className={campo}
          />
          <span className="text-xs text-texto-suave">31 = último dia do mês.</span>
        </label>

        <label className="flex flex-col gap-2">
          <span className={rotulo}>Mês do vencimento</span>
          <select
            name="meses_apos"
            value={regra.meses_apos}
            onChange={(e) => mudar("meses_apos", Number(e.target.value))}
            className={`${campo} cursor-pointer`}
          >
            {opcoesMeses(regra.periodicidade).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className={rotulo}>Se não for dia útil</span>
          <select
            name="ajuste"
            value={regra.ajuste}
            onChange={(e) => mudar("ajuste", e.target.value)}
            className={`${campo} cursor-pointer`}
          >
            {(Object.keys(rotulosAjuste) as Ajuste[]).map((a) => (
              <option key={a} value={a}>
                {rotulosAjuste[a]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className={rotulo}>Meta interna (dias antes)</span>
          <input
            name="meta_dias_antes"
            type="number"
            min={0}
            max={60}
            required
            value={regra.meta_dias_antes}
            onChange={(e) => mudar("meta_dias_antes", Number(e.target.value))}
            className={campo}
          />
          <span className="text-xs text-texto-suave">Recua para o dia útil anterior, se preciso.</span>
        </label>

        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className={`${rotulo} mb-2`}>Regimes</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(rotulosRegime) as RegimeObrigacao[]).map((r) => (
              <label
                key={r}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-borda px-4 text-sm font-medium text-texto-suave transition has-checked:border-primaria has-checked:bg-suave has-checked:text-texto"
              >
                <input
                  type="checkbox"
                  name="regime"
                  value={r}
                  defaultChecked={inicial?.regimes.includes(r)}
                  className="accent-primaria"
                />
                {rotulosRegime[r]}
              </label>
            ))}
          </div>
          <span className="text-xs text-texto-suave">
            Os clientes desses regimes passam a ter a obrigação; os de um regime desmarcado são desvinculados.
          </span>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={salvando}
            className="flex h-11 items-center gap-2 rounded-full bg-primaria px-6 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:opacity-70"
          >
            {salvando && <LoaderCircle className="size-4 animate-spin" />}
            {inicial ? "Salvar alterações" : "Criar obrigação"}
          </button>
          <button
            type="button"
            onClick={() => aoFechar()}
            className="h-11 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave hover:text-texto"
          >
            Cancelar
          </button>
          {inicial && (
            <span className="text-xs text-texto-suave">
              As tarefas já geradas mantêm o prazo; a regra vale para as próximas.
            </span>
          )}
        </div>
      </div>

      <aside className="rounded-bloco bg-escuro p-5 text-white" aria-live="polite">
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-texto-inverso-suave">
          <CalendarClock className="size-4" /> PRÉVIA
        </p>
        <p className="mt-3 text-sm font-semibold">{valida ? descreverVencimento(regra) : "Dia inválido"}</p>
        <p className="mt-1 text-xs text-texto-inverso-suave">{rotulosAjuste[regra.ajuste]}</p>
        <p className="text-xs text-texto-inverso-suave">Meta: {descreverMeta(regra.meta_dias_antes || 0).toLowerCase()}</p>
        <ul className="mt-4 flex flex-col gap-2">
          {proximos.map((p) => (
            <li key={p.competencia} className="rounded-xl bg-white/5 px-3 py-2.5">
              <span className="block text-[11px] font-semibold tracking-wider text-texto-inverso-suave">
                COMPETÊNCIA {competenciaCurta(p.competencia)}
              </span>
              <span className="block font-semibold text-realce tabular-nums">{dataCurta(p.legal)}</span>
              {p.meta !== p.legal && (
                <span className="block text-xs text-texto-inverso-suave tabular-nums">Meta {dataCurta(p.meta)}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-texto-inverso-suave">Considera fins de semana e feriados nacionais.</p>
      </aside>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Cartão de uma obrigação: mostra a leitura (children) ou o formulário.

export function ObrigacaoEditavel({
  obrigacao,
  ativo,
  contexto,
  children,
}: {
  obrigacao: DadosObrigacao;
  ativo: boolean;
  contexto: Contexto;
  children: ReactNode;
}) {
  const [editando, setEditando] = useState(false);
  const [estado, setEstado] = useState<EstadoObrigacao | null>(null);
  const [pendente, iniciar] = useTransition();

  if (editando) {
    return (
      <div className="px-4 py-5 sm:px-6">
        <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-texto-suave">EDITANDO · {obrigacao.nome.toUpperCase()}</p>
        <Formulario
          inicial={obrigacao}
          contexto={contexto}
          aoFechar={(r) => {
            setEditando(false);
            if (r) setEstado(r);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-6">
      <div className={`min-w-0 flex-1 ${ativo ? "" : "opacity-55"}`}>{children}</div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={ativo}
            aria-label={`${obrigacao.nome} ativa`}
            title={ativo ? "Ativa: gera tarefas" : "Desativada: não gera tarefas"}
            disabled={pendente}
            onClick={() => iniciar(async () => setEstado(await alterarAtivoObrigacao(obrigacao.id, !ativo)))}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
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
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-destaque hover:bg-suave"
          >
            <Pencil className="size-3.5" /> Editar
          </button>
        </div>
        {estado && (
          <span role="status" className={`text-xs font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
            {estado.erro ?? estado.ok}
          </span>
        )}
      </div>
    </div>
  );
}

export function NovaObrigacao({ contexto }: { contexto: Contexto }) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<EstadoObrigacao | null>(null);

  if (!aberto) {
    return (
      <span className="flex flex-wrap items-center justify-end gap-3">
        {estado?.ok && (
          <span role="status" className="text-xs font-semibold text-sucesso">
            {estado.ok}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setEstado(null);
            setAberto(true);
          }}
          className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
        >
          <Plus className="size-4" strokeWidth={2.5} /> Nova obrigação
        </button>
      </span>
    );
  }

  return (
    <section className="w-full animate-surgir rounded-card bg-superficie ring-1 ring-borda p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-texto">Nova obrigação</h2>
      <Formulario
        inicial={null}
        contexto={contexto}
        aoFechar={(r) => {
          setAberto(false);
          if (r) setEstado(r);
        }}
      />
    </section>
  );
}
