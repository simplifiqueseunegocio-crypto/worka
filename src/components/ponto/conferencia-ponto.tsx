"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import type { LeituraCompleta } from "@/lib/ponto";
import {
  alertasDoDia,
  diaDaSemana,
  hhmm,
  NOME_DIA,
  previstoNoDia,
  resumoFicha,
  trabalhadoNoDia,
  type DiaPonto,
  type JornadaDia,
} from "@/lib/ponto-regras";
import {
  buscarClientesPonto,
  confirmarLeituraPonto,
  definirClienteFichaPonto,
  excluirLeituraPonto,
  iniciarLeituraPonto,
  reabrirLeituraPonto,
  salvarFichaPonto,
} from "@/lib/ponto-actions";

type Estado = { ok?: string; erro?: string } | null;

const cpfFormatado = (c: string) => c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
const dataCurta = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);

// "0705" / "7:5" / "07h05" → "07:05" (o resto fica como está, para o alerta mostrar).
function normalizarHora(v: string) {
  const s = v.trim().replace(/h/i, ":");
  const d = s.replace(/\D/g, "");
  if (/^\d{1,2}:\d{1,2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }
  if (d.length === 3 || d.length === 4) return `${d.slice(0, -2).padStart(2, "0")}:${d.slice(-2)}`;
  return s;
}

export function ConferenciaPonto({ leitura }: { leitura: LeituraCompleta }) {
  const confirmada = leitura.status === "confirmada";
  const competencia = leitura.competencia?.slice(0, 7) ?? null;
  const [selecionada, setSelecionada] = useState(0);
  // Edições por ficha (só as alteradas), para trocar de funcionário sem perder.
  const [edicoes, setEdicoes] = useState<Record<string, DiaPonto[]>>({});
  const [estado, setEstado] = useState<Estado>(null);
  const [pendente, executar] = useTransition();

  const fichas = leitura.fichas;
  const ficha = fichas[selecionada];
  const dias = ficha ? (edicoes[ficha.id] ?? ficha.dias) : [];
  const alterada = ficha ? ficha.id in edicoes : false;

  const resumos = useMemo(
    () => Object.fromEntries(fichas.map((f) => [f.id, resumoFicha(edicoes[f.id] ?? f.dias, f.jornada, competencia)])),
    [fichas, edicoes, competencia],
  );
  const conferidas = fichas.filter((f) => f.conferida).length;
  // Fichas de mais de uma empresa: a lista mostra o cliente de cada uma.
  const variasEmpresas = new Set(fichas.map((f) => (f.cliente ?? leitura.cliente)?.id ?? "")).size > 1;

  const mudarDia = (i: number, novo: DiaPonto) => {
    if (!ficha) return;
    const lista = [...dias];
    lista[i] = novo;
    setEdicoes((e) => ({ ...e, [ficha.id]: lista }));
  };

  const salvar = (conferida: boolean) =>
    executar(async () => {
      const limpos = dias.map((d) => ({
        ...d,
        marcacoes: d.marcacoes.map((m) => ({ ...m, hora: normalizarHora(m.hora) })).filter((m) => m.hora),
      }));
      const r = await salvarFichaPonto(ficha.id, limpos, conferida);
      setEstado(r);
      if (!r.erro) {
        setEdicoes((e) => {
          const resto = { ...e };
          delete resto[ficha.id];
          return resto;
        });
        if (conferida) {
          const proxima = fichas.findIndex((f, i) => i > selecionada && !f.conferida);
          if (proxima >= 0) setSelecionada(proxima);
        }
      }
    });

  const acao = (fn: () => Promise<Estado | void>) =>
    executar(async () => {
      const r = await fn();
      if (r) setEstado(r);
    });

  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* Cabeçalho da leitura */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card bg-superficie ring-1 ring-borda px-5 py-4">
        {ficha && <ClienteFicha key={ficha.id} ficha={ficha} leitura={leitura} bloqueado={confirmada || pendente} onEstado={setEstado} />}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {leitura.arquivos.map((a, i) => (
            <a
              key={i}
              href={`/automacoes/ponto/${leitura.id}/arquivo/${i}`}
              target="_blank"
              rel="noopener"
              className="flex max-w-56 items-center gap-1.5 rounded-full bg-suave px-3 py-1.5 text-xs font-semibold text-texto hover:bg-borda"
              title={a.nome}
            >
              <FileText className="size-3.5 shrink-0 text-destaque" /> <span className="truncate">{a.nome}</span>
            </a>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {confirmada ? (
            <button
              type="button"
              disabled={pendente}
              onClick={() => acao(() => reabrirLeituraPonto(leitura.id))}
              className="flex h-10 items-center gap-2 rounded-full border border-borda px-4 text-sm font-semibold text-texto hover:bg-suave"
            >
              <RotateCcw className="size-4" /> Reabrir
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={pendente}
                onClick={() => confirm("Ler de novo apaga as correções feitas nesta leitura. Continuar?") && acao(() => iniciarLeituraPonto(leitura.id))}
                className="flex h-10 items-center gap-2 rounded-full border border-borda px-4 text-sm font-semibold text-texto hover:bg-suave"
              >
                <RotateCcw className="size-4" /> Ler de novo
              </button>
              <button
                type="button"
                disabled={pendente || conferidas < fichas.length || !leitura.cliente}
                onClick={() => acao(() => confirmarLeituraPonto(leitura.id))}
                title={!leitura.cliente ? "Escolha o cliente" : conferidas < fichas.length ? "Confira todas as fichas" : undefined}
                className="flex h-10 items-center gap-2 rounded-full bg-sucesso-forte px-5 text-sm font-bold text-white hover:bg-sucesso-forte-hover disabled:opacity-40"
              >
                <CheckCircle2 className="size-4" /> Confirmar leitura ({conferidas}/{fichas.length})
              </button>
            </>
          )}
          <button
            type="button"
            disabled={pendente}
            onClick={() => confirm("Excluir esta leitura, as fichas e os arquivos enviados?") && executar(() => excluirLeituraPonto(leitura.id))}
            className="flex size-10 items-center justify-center rounded-full text-texto-suave hover:bg-perigo-suave hover:text-perigo"
            aria-label="Excluir leitura"
            title="Excluir leitura"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </section>

      {/* Só quando faltou ler alguma página. */}
      {leitura.mensagem && /Não lidas/.test(leitura.mensagem) && (
        <p className="flex items-start gap-2 rounded-bloco bg-alerta-suave px-4 py-2.5 text-sm font-semibold text-alerta">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {leitura.mensagem.slice(leitura.mensagem.indexOf("Não lidas"))}
            {!confirmada && " Use “Ler de novo” para tentar as páginas que faltaram."}
          </span>
        </p>
      )}
      {(estado?.erro || estado?.ok) && (
        <p
          role="status"
          className={`rounded-bloco px-4 py-2.5 text-sm font-semibold ${estado?.erro ? "bg-perigo-suave text-perigo" : "bg-sucesso-suave text-sucesso"}`}
        >
          {estado?.erro ?? estado?.ok}
        </p>
      )}

      <div className="flex flex-col gap-5">
        {/* Funcionários, lado a lado (rola na horizontal quando são muitos) */}
        <nav className="overflow-hidden rounded-card bg-superficie ring-1 ring-borda">
          <p className="flex items-center justify-between border-b border-borda px-4 py-3 text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">
            <span>Funcionários ({fichas.length})</span>
            <span className="tracking-normal normal-case">{conferidas} de {fichas.length} conferidas</span>
          </p>
          <ul className="flex gap-2 overflow-x-auto p-2">
            {fichas.map((f, i) => {
              const r = resumos[f.id];
              return (
                <li key={f.id} className="w-64 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelecionada(i)}
                    className={`flex h-full w-full items-center gap-2.5 rounded-bloco border-b-[3px] px-3 py-2.5 text-left text-sm transition-colors ${
                      i === selecionada ? "border-primaria bg-suave" : "border-transparent bg-fundo/60 hover:bg-fundo"
                    }`}
                  >
                    {f.conferida ? (
                      <CheckCircle2 className="size-4 shrink-0 text-sucesso" />
                    ) : r.erros ? (
                      <AlertTriangle className="size-4 shrink-0 text-alerta" />
                    ) : (
                      <span className="size-4 shrink-0 rounded-full border-2 border-borda" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-texto">{f.nome}</span>
                      {variasEmpresas && (
                        <span className={`block truncate text-xs font-semibold ${(f.cliente ?? leitura.cliente) ? "text-destaque" : "text-alerta"}`}>
                          {(f.cliente ?? leitura.cliente)?.razao_social ?? "Sem cliente"}
                        </span>
                      )}
                      <span className="block text-xs text-texto-suave">
                        {hhmm(r.trabalhado)} trabalhadas
                        {r.erros ? <span className="text-alerta"> · {r.erros} {r.erros === 1 ? "alerta" : "alertas"}</span> : null}
                      </span>
                    </span>
                    {f.id in edicoes && <span className="size-2 shrink-0 rounded-full bg-alerta-ponto" title="Alterações não salvas" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Ficha selecionada */}
        {ficha && (
          <section className="min-w-0 rounded-card bg-superficie ring-1 ring-borda">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-2 border-b border-borda px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-texto">{ficha.nome}</h2>
                <p className="text-sm text-texto-suave">
                  {[ficha.cpf && `CPF ${cpfFormatado(ficha.cpf)}`, ficha.cargo, ficha.admissao && `admissão ${ficha.admissao.split("-").reverse().join("/")}`]
                    .filter(Boolean)
                    .join(" · ") || "Sem CPF na ficha"}
                </p>
              </div>
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  ficha.funcionario_id ? "bg-sucesso-suave text-sucesso" : "bg-suave text-texto-suave"
                }`}
              >
                {ficha.funcionario_id ? <UserCheck className="size-3.5" /> : <UserPlus className="size-3.5" />}
                {ficha.funcionario_id ? "Funcionário já cadastrado" : "Será cadastrado ao confirmar"}
              </span>
              <Resumo ficha={ficha} dias={dias} competencia={competencia} />
            </div>

            <Jornada jornada={ficha.jornada} />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-borda bg-fundo text-left text-xs text-texto-suave">
                    <th className="px-3 py-2 font-semibold">Dia</th>
                    <th className="px-2 py-2 font-semibold">Marcações</th>
                    <th className="px-2 py-2 font-semibold">Ocorrência</th>
                    <th className="px-2 py-2 text-right font-semibold">Trabalhado</th>
                    <th className="px-3 py-2 font-semibold">Alertas</th>
                  </tr>
                </thead>
                <tbody>
                  {dias.map((d, i) => (
                    <LinhaDia key={d.data} dia={d} jornada={ficha.jornada} competencia={competencia} bloqueado={confirmada} onChange={(novo) => mudarDia(i, novo)} />
                  ))}
                </tbody>
              </table>
            </div>

            {ficha.observacoes && (
              <p className="border-t border-borda px-5 py-3 text-sm whitespace-pre-line text-texto-suave">
                <strong className="text-texto">Observações da ficha:</strong> {ficha.observacoes}
              </p>
            )}

            {!confirmada && (
              <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-b-card border-t border-borda bg-superficie/95 px-5 py-3 backdrop-blur">
                {alterada && <span className="mr-auto text-sm font-semibold text-alerta">Alterações não salvas</span>}
                <button
                  type="button"
                  disabled={pendente || !alterada}
                  onClick={() => salvar(ficha.conferida)}
                  className="ml-auto flex h-10 items-center gap-2 rounded-full border border-borda px-4 text-sm font-semibold text-texto hover:bg-suave disabled:opacity-40"
                >
                  <Save className="size-4" /> Salvar
                </button>
                {ficha.conferida && !alterada ? (
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => salvar(false)}
                    className="flex h-10 items-center gap-2 rounded-full bg-sucesso-suave px-4 text-sm font-semibold text-sucesso hover:bg-sucesso-suave-hover"
                  >
                    <Check className="size-4" /> Conferida · desmarcar
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => salvar(true)}
                    className="flex h-10 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover disabled:opacity-60"
                  >
                    {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Salvar e marcar conferida
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Resumo({ ficha, dias, competencia }: { ficha: LeituraCompleta["fichas"][number]; dias: DiaPonto[]; competencia: string | null }) {
  const r = resumoFicha(dias, ficha.jornada, competencia);
  const itens = [
    { rotulo: "Trabalhado", valor: hhmm(r.trabalhado) },
    ...(r.previsto !== null ? [{ rotulo: "Previsto", valor: hhmm(r.previsto) }, { rotulo: "Diferença", valor: hhmm(r.trabalhado - r.previsto) }] : []),
  ];
  return (
    <div className="ml-auto flex flex-col items-end gap-1.5">
      <div className="flex gap-4">
        {itens.map((i) => (
          <div key={i.rotulo} className="text-right">
            <p className="text-[11px] text-texto-suave">{i.rotulo}</p>
            <p className="font-bold text-texto tabular-nums">{i.valor}</p>
          </div>
        ))}
      </div>
      {ficha.totais_origem.length > 0 && (
        <p className="max-w-md text-right text-[11px] text-texto-suave" title="Totais impressos pelo sistema de ponto, para comparar">
          No sistema de ponto: {ficha.totais_origem.map((t) => `${t.rotulo} ${t.valor}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Jornada({ jornada }: { jornada: JornadaDia[] }) {
  if (!jornada.length) {
    return <p className="border-b border-borda px-5 py-2.5 text-xs text-texto-suave">A ficha não informa a jornada: sem previsto nem “dia sem marcação”.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-borda px-5 py-2.5 text-xs">
      <span className="font-semibold text-texto-suave">Jornada:</span>
      {jornada.map((j) => (
        <span key={j.dia} className="rounded-full bg-fundo px-2 py-0.5 text-texto">
          {NOME_DIA[j.dia]}{" "}
          {j.entrada && j.saida
            ? `${j.entrada}–${j.saida}${j.intervalo_inicio && j.intervalo_fim ? ` (int. ${j.intervalo_inicio}–${j.intervalo_fim})` : ""}`
            : (j.carga ?? "—")}
        </span>
      ))}
    </div>
  );
}

function LinhaDia({
  dia,
  jornada,
  competencia,
  bloqueado,
  onChange,
}: {
  dia: DiaPonto;
  jornada: JornadaDia[];
  competencia: string | null;
  bloqueado: boolean;
  onChange: (d: DiaPonto) => void;
}) {
  const alertas = alertasDoDia(dia, jornada, competencia);
  const temErro = alertas.some((a) => a.tipo === "erro");
  const fimDeSemana = ["sab", "dom"].includes(diaDaSemana(dia.data));
  const previsto = previstoNoDia(jornada, dia.data);
  const trabalhado = trabalhadoNoDia(dia);
  const campos = Math.max(4, dia.marcacoes.length + (dia.marcacoes.length % 2));

  const mudarHora = (i: number, valor: string) => {
    const marcacoes = [...dia.marcacoes];
    while (marcacoes.length <= i) marcacoes.push({ hora: "", manual: false });
    marcacoes[i] = { ...marcacoes[i], hora: valor };
    onChange({ ...dia, marcacoes });
  };
  // Ao sair do campo: completa o formato e tira as vazias (vale a ordem das batidas).
  const limparVazias = () => onChange({ ...dia, marcacoes: dia.marcacoes.map((m) => ({ ...m, hora: normalizarHora(m.hora) })).filter((m) => m.hora) });

  return (
    <tr className={`border-b border-borda/70 align-top ${temErro ? "bg-alerta-suave" : fimDeSemana ? "bg-fundo/60" : ""}`}>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <span className="font-semibold text-texto tabular-nums">{dataCurta(dia.data)}</span>{" "}
        <span className="text-xs text-texto-suave">{NOME_DIA[diaDaSemana(dia.data)]}</span>
      </td>
      <td className="px-2 py-1">
        <div className="flex flex-wrap items-center gap-1">
          {Array.from({ length: campos }, (_, i) => {
            const m = dia.marcacoes[i];
            return (
              <span key={i} className="relative">
                <input
                  value={m?.hora ?? ""}
                  disabled={bloqueado}
                  onChange={(e) => mudarHora(i, e.target.value)}
                  onBlur={limparVazias}
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="--:--"
                  aria-label={`${i % 2 ? "Saída" : "Entrada"} ${Math.floor(i / 2) + 1} de ${dataCurta(dia.data)}`}
                  className={`h-8 w-[58px] rounded-md border bg-superficie px-1.5 text-center text-sm tabular-nums text-texto placeholder:text-borda focus:border-primaria focus:outline-none disabled:bg-transparent ${
                    i % 2 ? "border-borda" : "border-borda"
                  } ${m?.manual ? "border-dashed border-alerta" : ""}`}
                  title={m?.manual ? "Batida lançada manualmente" : undefined}
                />
              </span>
            );
          })}
          {!bloqueado && (
            <button
              type="button"
              onClick={() => onChange({ ...dia, marcacoes: [...dia.marcacoes, { hora: "", manual: false }, { hora: "", manual: false }] })}
              className="flex size-7 items-center justify-center rounded-md text-texto-suave hover:bg-suave hover:text-texto"
              title="Mais um par de marcações"
              aria-label="Mais um par de marcações"
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
      </td>
      <td className="px-2 py-1">
        <input
          value={dia.ocorrencia ?? ""}
          disabled={bloqueado}
          onChange={(e) => onChange({ ...dia, ocorrencia: e.target.value.toUpperCase() || null })}
          placeholder={fimDeSemana ? "" : "—"}
          maxLength={60}
          className="h-8 w-28 rounded-md border border-borda bg-superficie px-2 text-xs font-semibold text-texto uppercase focus:border-primaria focus:outline-none disabled:bg-transparent"
        />
        {dia.observacao && <p className="mt-1 max-w-48 text-[11px] leading-snug text-texto-suave">{dia.observacao}</p>}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
        <span className="font-semibold text-texto">{trabalhado ? hhmm(trabalhado) : "—"}</span>
        {previsto ? <span className="block text-[11px] text-texto-suave">de {hhmm(previsto)}</span> : null}
      </td>
      <td className="px-3 py-1.5">
        <ul className="flex flex-col gap-0.5">
          {alertas.map((a, i) => (
            <li key={i} className={`flex items-start gap-1 text-xs ${a.tipo === "erro" ? "font-semibold text-alerta" : "text-texto-suave"}`}>
              {a.tipo === "erro" ? <AlertTriangle className="mt-0.5 size-3 shrink-0" /> : <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-texto-suave/50" />}
              {a.texto}
            </li>
          ))}
          {dia.duvida && !bloqueado && (
            <li>
              <button type="button" onClick={() => onChange({ ...dia, duvida: null })} className="text-[11px] font-semibold text-destaque hover:underline">
                Conferido, tirar alerta
              </button>
            </li>
          )}
        </ul>
      </td>
    </tr>
  );
}

// Cliente da leitura: reconhecido pelo CNPJ da ficha ou escolhido aqui.
// Cliente da ficha aberta: trocar muda só esta ficha (fichas de empresas
// diferentes podem vir na mesma leitura). Sem cliente próprio, vale o da leitura.
function ClienteFicha({
  ficha,
  leitura,
  bloqueado,
  onEstado,
}: {
  ficha: LeituraCompleta["fichas"][number];
  leitura: LeituraCompleta;
  bloqueado: boolean;
  onEstado: (e: Estado) => void;
}) {
  const cliente = ficha.cliente ?? leitura.cliente;
  const [editando, setEditando] = useState(!cliente);
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<{ id: string; razao_social: string; documento: string; codigo_dominio: number | null }[]>([]);
  const [buscando, buscar] = useTransition();

  if (!editando && cliente) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Building2 className="size-4 shrink-0 text-destaque" />
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold tracking-[0.12em] text-texto-suave uppercase">Cliente de {ficha.nome.split(" ")[0]}</span>
          <span className="block truncate font-semibold text-texto">
            {cliente.codigo_dominio ? `${cliente.codigo_dominio} · ` : ""}
            {cliente.razao_social}
          </span>
        </span>
        {!bloqueado && (
          <button type="button" onClick={() => setEditando(true)} className="text-xs font-semibold text-destaque hover:underline">
            trocar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-md">
      <p className="mb-1 text-xs font-semibold text-alerta">
        {cliente ? `Trocar o cliente só da ficha de ${ficha.nome.split(" ")[0]}` : `Cliente da ficha de ${ficha.nome.split(" ")[0]} não reconhecido: escolha`}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-borda px-3 focus-within:border-primaria">
          <Search className="size-4 text-texto-suave" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => {
              const q = e.target.value;
              setBusca(q);
              buscar(async () => setOpcoes(q.trim().length >= 2 ? await buscarClientesPonto(q) : []));
            }}
            placeholder="Nome, CNPJ ou código"
            className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none"
          />
          {buscando && <LoaderCircle className="size-4 animate-spin text-texto-suave" />}
        </div>
        {cliente && (
          <button type="button" onClick={() => setEditando(false)} className="rounded-full p-2 text-texto-suave hover:bg-suave" aria-label="Cancelar">
            <X className="size-4" />
          </button>
        )}
      </div>
      {opcoes.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-bloco border border-borda bg-superficie shadow-lg">
          {opcoes.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() =>
                  buscar(async () => {
                    const r = await definirClienteFichaPonto(ficha.id, c.id);
                    onEstado(r);
                    if (!r.erro) {
                      setEditando(false);
                      setOpcoes([]);
                    }
                  })
                }
                className="w-full px-3 py-2 text-left text-sm hover:bg-suave"
              >
                <span className="font-semibold text-texto">
                  {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                  {c.razao_social}
                </span>
                <span className="block text-xs text-texto-suave">{c.documento}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
