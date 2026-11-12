"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCircle2, Download, FileText, LoaderCircle, Lock, RotateCcw, Save, Trash2, UserCheck, UserPlus, X } from "lucide-react";
import type { LeituraDocumento } from "@/lib/documentos/dados";
import { tipoDocumento, type Campo, type Dados } from "@/lib/documentos/tipos";
import {
  confirmarLeituraDocumento,
  definirClienteDocumento,
  excluirItemDocumento,
  excluirLeituraDocumento,
  iniciarLeituraDocumento,
  reabrirLeituraDocumento,
  salvarItemDocumento,
} from "@/lib/documentos/actions";
import { SeletorCliente } from "@/components/documentos/seletor-cliente";

type Estado = { ok?: string; erro?: string } | null;

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const LARGURA: Record<NonNullable<Campo["largura"]>, string> = { inteira: "sm:col-span-6", meia: "sm:col-span-3", terco: "sm:col-span-2" };

// Conferência de uma leitura de documentos, montada a partir do tipo
// (campos, regras e resumo em lib/documentos/tipos.ts).
export function ConferenciaDocumentos({ leitura }: { leitura: LeituraDocumento }) {
  const tipo = tipoDocumento(leitura.tipo)!;
  const confirmada = leitura.status === "confirmada";
  const hoje = hojeSP();
  const clienteDocumento = leitura.cliente?.documento ?? null;
  const [sel, setSel] = useState(0);
  const [edicoes, setEdicoes] = useState<Record<string, Dados>>({});
  const [estado, setEstado] = useState<Estado>(null);
  const [pendente, executar] = useTransition();

  const itens = leitura.itens;
  const item = itens[Math.min(sel, itens.length - 1)];
  const dados = item ? (edicoes[item.id] ?? item.dados) : {};
  const alterado = item ? item.id in edicoes : false;
  const alertas = useMemo(
    () => Object.fromEntries(itens.map((i) => [i.id, tipo.validar(edicoes[i.id] ?? i.dados, { hoje, clienteDocumento })])),
    [itens, edicoes, tipo, hoje, clienteDocumento],
  );
  const conferidos = itens.filter((i) => i.conferido).length;

  const mudar = (chave: string, valor: string | number | null) => item && setEdicoes((e) => ({ ...e, [item.id]: { ...dados, [chave]: valor } }));
  const acao = (fn: () => Promise<Estado | void>) =>
    executar(async () => {
      const r = await fn();
      if (r) setEstado(r);
    });
  const salvar = (conferido: boolean) =>
    executar(async () => {
      const r = await salvarItemDocumento(item.id, dados, conferido);
      setEstado(r);
      if (!r.erro) {
        setEdicoes((e) => {
          const resto = { ...e };
          delete resto[item.id];
          return resto;
        });
        if (conferido) {
          const prox = itens.findIndex((x, i) => i > sel && !x.conferido);
          if (prox >= 0) setSel(prox);
        }
      }
    });

  const arquivo = item?.origem ? leitura.arquivos[item.origem.arquivo] : null;
  const urlArquivo = item?.origem ? `/automacoes/documentos/${leitura.tipo}/${leitura.id}/arquivo/${item.origem.arquivo}` : null;

  return (
    <div className="mt-6 flex flex-col gap-5">
      <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card bg-superficie ring-1 ring-borda px-5 py-4">
        <SeletorCliente
          tipo={leitura.tipo}
          valor={leitura.cliente}
          bloqueado={confirmada || pendente}
          aviso={leitura.cliente ? undefined : "Escolha o cliente destes documentos"}
          onEscolher={(c) => c && acao(() => definirClienteDocumento(leitura.id, c.id))}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {itens.length > 0 && (
            <a
              href={`/automacoes/documentos/${leitura.tipo}/${leitura.id}/planilha`}
              className="flex h-10 items-center gap-2 rounded-full border border-borda px-4 text-sm font-semibold text-texto hover:bg-suave"
              title="Planilha (CSV) com os dados desta leitura, para abrir no Excel ou importar"
            >
              <Download className="size-4" /> Planilha
            </a>
          )}
          {confirmada ? (
            <button
              type="button"
              disabled={pendente}
              onClick={() => confirm("Reabrir desfaz o que foi lançado na confirmação. Continuar?") && acao(() => reabrirLeituraDocumento(leitura.id))}
              className="flex h-10 items-center gap-2 rounded-full border border-borda px-4 text-sm font-semibold text-texto hover:bg-suave"
            >
              <RotateCcw className="size-4" /> Reabrir
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={pendente}
                onClick={() => confirm("Ler de novo apaga as correções desta leitura. Continuar?") && acao(() => iniciarLeituraDocumento(leitura.id))}
                className="flex h-10 items-center gap-2 rounded-full border border-borda px-4 text-sm font-semibold text-texto hover:bg-suave"
              >
                <RotateCcw className="size-4" /> Ler de novo
              </button>
              <button
                type="button"
                disabled={pendente || conferidos < itens.length || !leitura.cliente}
                onClick={() => acao(() => confirmarLeituraDocumento(leitura.id))}
                title={!leitura.cliente ? "Escolha o cliente" : conferidos < itens.length ? "Confira todos os itens" : undefined}
                className="flex h-10 items-center gap-2 rounded-full bg-sucesso-forte px-5 text-sm font-bold text-white hover:bg-sucesso-forte-hover disabled:opacity-40"
              >
                <CheckCircle2 className="size-4" /> Confirmar ({conferidos}/{itens.length})
              </button>
              <button
                type="button"
                disabled={pendente}
                onClick={() => confirm("Excluir esta leitura e os arquivos enviados?") && executar(() => excluirLeituraDocumento(leitura.id))}
                className="flex size-10 items-center justify-center rounded-full text-texto-suave hover:bg-perigo-suave hover:text-perigo"
                aria-label="Excluir leitura"
                title="Excluir leitura"
              >
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      </section>

      {leitura.mensagem && (
        <p
          className={`flex items-start gap-2 rounded-bloco px-4 py-2.5 text-sm ${
            /Não lidas/.test(leitura.mensagem) ? "bg-alerta-suave font-semibold text-alerta" : "bg-suave text-texto-suave"
          }`}
        >
          {/Não lidas/.test(leitura.mensagem) && <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          {leitura.mensagem}
        </p>
      )}
      {(estado?.erro || estado?.ok) && (
        <p role="status" className={`rounded-bloco px-4 py-2.5 text-sm font-semibold ${estado?.erro ? "bg-perigo-suave text-perigo" : "bg-sucesso-suave text-sucesso"}`}>
          {estado?.erro ?? estado?.ok}
        </p>
      )}
      {confirmada && (
        <p className="flex items-center gap-2 rounded-bloco bg-sucesso-suave px-4 py-2.5 text-sm text-sucesso">
          <Lock className="size-4" /> Leitura confirmada{leitura.confirmada_por ? ` por ${leitura.confirmada_por.nome}` : ""}. Para corrigir, reabra.
        </p>
      )}

      {itens.length === 0 ? (
        <p className="rounded-card bg-superficie ring-1 ring-borda px-5 py-8 text-center text-sm text-texto-suave">Nenhum {tipo.item.singular} nesta leitura.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]">
          {/* Itens */}
          <nav className="h-fit overflow-hidden rounded-card bg-superficie ring-1 ring-borda lg:sticky lg:top-4">
            <p className="border-b border-borda px-4 py-3 text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">
              {tipo.item.plural} ({itens.length})
            </p>
            <ul className="max-h-[70vh] overflow-y-auto">
              {itens.map((i, n) => {
                const erros = alertas[i.id].filter((a) => a.tipo === "erro").length;
                const d = edicoes[i.id] ?? i.dados;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => setSel(n)}
                      className={`flex w-full items-center gap-2.5 border-l-[3px] px-4 py-2.5 text-left text-sm ${
                        n === sel ? "border-primaria bg-suave" : "border-transparent hover:bg-fundo"
                      }`}
                    >
                      {i.conferido ? (
                        <CheckCircle2 className="size-4 shrink-0 text-sucesso" />
                      ) : erros ? (
                        <AlertTriangle className="size-4 shrink-0 text-alerta" />
                      ) : (
                        <span className="size-4 shrink-0 rounded-full border-2 border-borda" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-texto">{tipo.tituloItem(d)}</span>
                        <span className="block truncate text-xs text-texto-suave">{tipo.resumoItem(d)}</span>
                      </span>
                      {i.id in edicoes && <span className="size-2 shrink-0 rounded-full bg-alerta-ponto" title="Alterações não salvas" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Formulário */}
          {item && (
            <section className="min-w-0 rounded-card bg-superficie ring-1 ring-borda">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-borda px-5 py-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-texto">{tipo.tituloItem(dados)}</h2>
                  <p className="text-sm text-texto-suave">{tipo.resumoItem(dados)}</p>
                </div>
                {tipo.funcionario && (
                  <span
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.funcionario_id ? "bg-sucesso-suave text-sucesso" : "bg-suave text-texto-suave"
                    }`}
                  >
                    {item.funcionario_id ? <UserCheck className="size-3.5" /> : <UserPlus className="size-3.5" />}
                    {item.funcionario_id ? "Funcionário já cadastrado" : "Será cadastrado ao confirmar"}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-6">
                {tipo.campos
                  .filter((c) => !c.quando || c.quando(dados))
                  .map((c) => (
                    <label key={c.chave} className={`flex flex-col gap-1 text-sm ${LARGURA[c.largura ?? "inteira"]}`}>
                      <span className="text-xs font-semibold text-texto-suave">{c.rotulo}</span>
                      <CampoEntrada campo={c} valor={dados[c.chave] ?? null} bloqueado={confirmada} onChange={(v) => mudar(c.chave, v)} />
                    </label>
                  ))}
              </div>

              {alertas[item.id].length > 0 && (
                <ul className="mx-5 mb-4 flex flex-col gap-1 rounded-bloco bg-fundo px-3 py-2.5">
                  {alertas[item.id].map((a, i) => (
                    <li key={i} className={`flex items-start gap-1.5 text-sm ${a.tipo === "erro" ? "font-semibold text-alerta" : "text-texto-suave"}`}>
                      {a.tipo === "erro" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> : <span className="mt-2 size-1.5 shrink-0 rounded-full bg-texto-suave/50" />}
                      {a.texto}
                    </li>
                  ))}
                  {dados.duvida && !confirmada && (
                    <li>
                      <button type="button" onClick={() => mudar("duvida", null)} className="text-xs font-semibold text-destaque hover:underline">
                        Conferi com o original: tirar o alerta de leitura incerta
                      </button>
                    </li>
                  )}
                </ul>
              )}

              {!confirmada && (
                <div className="flex flex-wrap items-center gap-2 rounded-b-card border-t border-borda px-5 py-3">
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => confirm(`Tirar este ${tipo.item.singular} da leitura?`) && acao(() => excluirItemDocumento(item.id))}
                    className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-texto-suave hover:bg-perigo-suave hover:text-perigo"
                  >
                    <X className="size-4" /> Não é {tipo.item.singular}
                  </button>
                  {alterado && <span className="text-sm font-semibold text-alerta">Alterações não salvas</span>}
                  <button
                    type="button"
                    disabled={pendente || !alterado}
                    onClick={() => salvar(item.conferido)}
                    className="ml-auto flex h-10 items-center gap-2 rounded-full border border-borda px-4 text-sm font-semibold text-texto hover:bg-suave disabled:opacity-40"
                  >
                    <Save className="size-4" /> Salvar
                  </button>
                  {item.conferido && !alterado ? (
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => salvar(false)}
                      className="flex h-10 items-center gap-2 rounded-full bg-sucesso-suave px-4 text-sm font-semibold text-sucesso hover:bg-sucesso-suave-hover"
                    >
                      <Check className="size-4" /> Conferido · desmarcar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => salvar(true)}
                      className="flex h-10 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover disabled:opacity-60"
                    >
                      {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Salvar e marcar conferido
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Original, lado a lado */}
          {urlArquivo && arquivo && (
            <section className="min-w-0 overflow-hidden rounded-card bg-superficie ring-1 ring-borda lg:col-span-2 xl:col-span-1">
              <a
                href={urlArquivo}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-1.5 border-b border-borda px-4 py-3 text-xs font-semibold text-texto hover:bg-fundo"
              >
                <FileText className="size-3.5 text-destaque" />
                <span className="truncate">
                  {arquivo.nome}
                  {item.origem && item.origem.pagina > 1 ? `, página ${item.origem.pagina}` : ""}
                </span>
                <span className="ml-auto text-destaque">abrir</span>
              </a>
              {arquivo.tipo === "application/pdf" ? (
                <iframe key={urlArquivo + item.origem?.pagina} src={`${urlArquivo}#page=${item.origem?.pagina ?? 1}`} title="Documento original" className="h-[70vh] w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- arquivo privado servido pela rota, sem otimização
                <img src={urlArquivo} alt="Documento original" className="max-h-[70vh] w-full object-contain" />
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function CampoEntrada({
  campo,
  valor,
  bloqueado,
  onChange,
}: {
  campo: Campo;
  valor: string | number | null;
  bloqueado: boolean;
  onChange: (v: string | number | null) => void;
}) {
  const classe =
    "h-10 w-full rounded-bloco border border-borda bg-superficie px-3 text-sm text-texto focus:border-primaria focus:outline-none disabled:bg-fundo";
  const v = valor === null || valor === undefined ? "" : String(valor);
  if (campo.tipo === "opcao") {
    return (
      <select value={v} disabled={bloqueado} onChange={(e) => onChange(e.target.value || null)} className={classe}>
        <option value="">—</option>
        {campo.opcoes?.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    );
  }
  if (campo.tipo === "texto_longo") {
    return (
      <textarea
        value={v}
        disabled={bloqueado}
        rows={2}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-bloco border border-borda bg-superficie px-3 py-2 text-sm text-texto focus:border-primaria focus:outline-none disabled:bg-fundo"
      />
    );
  }
  const numerico = campo.tipo === "numero" || campo.tipo === "moeda";
  const tipoHtml = { data: "date", mes: "month", hora: "time", numero: "number", moeda: "number" }[campo.tipo as string] ?? "text";
  const entrada = (
    <input
      type={tipoHtml}
      value={v}
      disabled={bloqueado}
      min={numerico ? 0 : undefined}
      step={campo.tipo === "moeda" ? "0.01" : campo.tipo === "numero" ? "any" : undefined}
      inputMode={campo.tipo === "cpf" || campo.tipo === "documento" ? "numeric" : campo.tipo === "moeda" ? "decimal" : undefined}
      onChange={(e) => onChange(e.target.value === "" ? null : numerico ? Number(e.target.value) : e.target.value)}
      className={`${classe}${campo.tipo === "moeda" ? " pl-9 text-right tabular-nums" : ""}`}
    />
  );
  if (campo.tipo !== "moeda") return entrada;
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs font-semibold text-texto-suave">R$</span>
      {entrada}
    </span>
  );
}
