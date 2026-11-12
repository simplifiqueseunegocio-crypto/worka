"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Check, FileText, LoaderCircle, Search, Send, UploadCloud, X } from "lucide-react";
import {
  buscarClientesAdiantamento,
  enviarFolhaAdiantamento,
  identificarArquivos,
  type ClienteAdiantamento,
  type ResultadoEnvio,
} from "@/lib/adiantamento-actions";

const LIMITE_PDF = 4 * 1024 * 1024; // igual a lib/adiantamento.ts

type Estado = "identificando" | "pronto" | "enviando" | "enviado" | "erro";
type Linha = {
  chave: string;
  arquivo: File;
  cliente: ClienteAdiantamento | null;
  estado: Estado;
  mensagem?: string;
};

const tamanho = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const nomeCliente = (c: ClienteAdiantamento) => c.fantasia || c.razao_social;

export function EnvioFolhas({
  competencia,
  rotulo,
  jaEnviados,
}: {
  competencia: string; // "AAAA-MM"
  rotulo: string; // "11/2026"
  jaEnviados: string[]; // clientes com folha já enviada nesta competência
}) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const contador = useRef(0);

  const mudar = (chave: string, m: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...m } : l)));

  async function adicionar(lista: FileList | File[]) {
    const novas: Linha[] = [...lista].map((arquivo) => {
      const chave = `a${++contador.current}`;
      const pdf = arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name);
      if (!pdf) return { chave, arquivo, cliente: null, estado: "erro", mensagem: "Não é um PDF." };
      if (arquivo.size > LIMITE_PDF)
        return { chave, arquivo, cliente: null, estado: "erro", mensagem: "Maior que 4 MB." };
      return { chave, arquivo, cliente: null, estado: "identificando" };
    });
    if (!novas.length) return;
    setLinhas((ls) => [...ls, ...novas]);

    const aIdentificar = novas.filter((l) => l.estado === "identificando");
    if (!aIdentificar.length) return;
    const clientes = await identificarArquivos(aIdentificar.map((l) => l.arquivo.name)).catch(() => null);
    setLinhas((ls) =>
      ls.map((l) => {
        const i = aIdentificar.findIndex((x) => x.chave === l.chave);
        return i < 0 ? l : { ...l, cliente: clientes?.[i] ?? null, estado: "pronto" };
      }),
    );
  }

  const prontas = linhas.filter(
    (l) => (l.estado === "pronto" || (l.estado === "erro" && l.cliente)) && l.cliente?.destinatarios.length,
  );
  const semCliente = linhas.filter((l) => l.estado === "pronto" && !l.cliente).length;
  const repetidos = prontas.filter((l) => jaEnviados.includes(l.cliente!.id)).length;
  const enviadas = linhas.filter((l) => l.estado === "enviado").length;

  async function enviarTodas() {
    setEnviando(true);
    // Um por vez: cada PDF vai numa requisição (limite de tamanho) e o
    // progresso aparece linha a linha.
    for (const l of prontas) {
      mudar(l.chave, { estado: "enviando", mensagem: undefined });
      const form = new FormData();
      form.set("arquivo", l.arquivo);
      form.set("clienteId", l.cliente!.id);
      form.set("competencia", competencia);
      const r: ResultadoEnvio = await enviarFolhaAdiantamento(form).catch(() => ({
        erro: "Falha de conexão. Tente de novo.",
      }));
      mudar(l.chave, r.erro ? { estado: "erro", mensagem: r.erro } : { estado: "enviado", mensagem: r.ok });
    }
    setEnviando(false);
  }

  return (
    <section className="rounded-card bg-superficie ring-1 ring-borda p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-texto">Enviar folhas de {rotulo}</h2>
          <p className="text-sm text-texto-suave">
            Solte os PDFs gerados no Domínio Folha. Com o código da empresa ou o CNPJ no nome do arquivo, o cliente é
            reconhecido sozinho.
          </p>
        </div>
        {linhas.length > 0 && !enviando && (
          <button
            type="button"
            onClick={() => setLinhas([])}
            className="h-9 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave"
          >
            Limpar lista
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => entrada.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          adicionar(e.dataTransfer.files);
        }}
        className={`mt-5 flex w-full flex-col items-center gap-2 rounded-bloco border-2 border-dashed px-6 text-center transition ${
          linhas.length ? "py-6" : "py-12"
        } ${arrastando ? "border-primaria bg-primaria/5" : "border-borda bg-fundo hover:border-primaria/40 hover:bg-suave/60"}`}
      >
        <span className="grid size-11 place-items-center rounded-full bg-superficie text-destaque shadow-sm">
          <UploadCloud className="size-5" strokeWidth={2} />
        </span>
        <span className="text-sm font-semibold text-texto">
          {arrastando ? "Solte para adicionar" : "Arraste os PDFs aqui ou clique para escolher"}
        </span>
        <span className="text-xs text-texto-suave">Um PDF por cliente · até 4 MB cada</span>
      </button>
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) adicionar(e.target.files);
          e.target.value = "";
        }}
      />

      {linhas.length > 0 && (
        <>
          <ul className="mt-5 divide-y divide-borda border-y border-borda">
            {linhas.map((l) => (
              <LinhaArquivo
                key={l.chave}
                linha={l}
                jaEnviado={Boolean(l.cliente && jaEnviados.includes(l.cliente.id))}
                bloqueada={enviando}
                aoEscolher={(c) => mudar(l.chave, { cliente: c, estado: "pronto", mensagem: undefined })}
                aoRemover={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
              />
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-texto-suave" aria-live="polite">
              {enviando ? (
                "Enviando…"
              ) : (
                <>
                  <strong className="text-texto">{prontas.length}</strong> pronta{prontas.length === 1 ? "" : "s"} para
                  enviar
                  {enviadas > 0 && (
                    <>
                      {" "}
                      · {enviadas} enviada{enviadas === 1 ? "" : "s"}
                    </>
                  )}
                  {semCliente > 0 && <> · {semCliente} sem cliente</>}
                  {repetidos > 0 && (
                    <span className="text-alerta">
                      {" "}
                      · {repetidos} já recebe{repetidos === 1 ? "u" : "ram"} nesta competência
                    </span>
                  )}
                </>
              )}
            </p>
            <button
              type="button"
              disabled={enviando || !prontas.length}
              onClick={enviarTodas}
              className="flex h-11 items-center gap-2 rounded-full bg-primaria px-6 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:opacity-50"
            >
              {enviando ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" strokeWidth={2.2} />
              )}
              {enviando ? "Enviando…" : `Enviar ${prontas.length || ""} ${prontas.length === 1 ? "folha" : "folhas"}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function LinhaArquivo({
  linha: l,
  jaEnviado,
  bloqueada,
  aoEscolher,
  aoRemover,
}: {
  linha: Linha;
  jaEnviado: boolean;
  bloqueada: boolean;
  aoEscolher: (c: ClienteAdiantamento | null) => void;
  aoRemover: () => void;
}) {
  const fixa = bloqueada || l.estado === "enviando" || l.estado === "enviado";
  const arquivoInvalido = l.estado === "erro" && !l.cliente && l.mensagem;

  return (
    <li className="grid animate-surgir items-center gap-3 py-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-perigo-suave text-perigo">
          <FileText className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-texto" title={l.arquivo.name}>
            {l.arquivo.name}
          </span>
          <span className="text-xs text-texto-suave">{tamanho(l.arquivo.size)}</span>
        </span>
      </span>

      <span className="min-w-0">
        {arquivoInvalido ? (
          <span className="text-sm text-texto-suave">—</span>
        ) : l.estado === "identificando" ? (
          <span className="flex items-center gap-2 text-sm text-texto-suave">
            <LoaderCircle className="size-4 animate-spin text-destaque" /> Identificando o cliente…
          </span>
        ) : l.cliente ? (
          <span className="block min-w-0">
            <span className="flex items-center gap-2 text-sm">
              <span className="min-w-0 truncate font-semibold text-texto">
                {l.cliente.codigo_dominio !== null && (
                  <span className="font-medium text-texto-suave tabular-nums">{l.cliente.codigo_dominio} · </span>
                )}
                {nomeCliente(l.cliente)}
              </span>
              {!fixa && (
                <button
                  type="button"
                  onClick={() => aoEscolher(null)}
                  className="shrink-0 text-xs font-semibold text-destaque hover:underline"
                >
                  Trocar
                </button>
              )}
            </span>
            {l.cliente.destinatarios.length ? (
              <span className="block truncate text-xs text-texto-suave" title={l.cliente.destinatarios.join(", ")}>
                Para {l.cliente.destinatarios.join(", ")}
                {l.cliente.origem === "cadastro" && " (e-mail do cadastro)"}
              </span>
            ) : (
              <span className="block text-xs font-semibold text-alerta">
                Sem e-mail.{" "}
                <Link href={`/clientes/${l.cliente.id}#contatos`} target="_blank" className="underline">
                  Cadastrar contato
                </Link>
              </span>
            )}
          </span>
        ) : (
          <EscolherCliente aoEscolher={aoEscolher} />
        )}
      </span>

      <span className="flex items-center justify-end gap-2">
        <Situacao linha={l} jaEnviado={jaEnviado} />
        {!fixa && (
          <button
            type="button"
            onClick={aoRemover}
            className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-suave hover:text-texto"
            aria-label={`Remover ${l.arquivo.name}`}
          >
            <X className="size-4" />
          </button>
        )}
      </span>
    </li>
  );
}

function Situacao({ linha: l, jaEnviado }: { linha: Linha; jaEnviado: boolean }) {
  const chip = "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap";
  if (l.estado === "enviando")
    return (
      <span className={`${chip} bg-suave text-destaque`}>
        <LoaderCircle className="size-3.5 animate-spin" /> Enviando
      </span>
    );
  if (l.estado === "enviado")
    return (
      <span className={`${chip} bg-sucesso-suave text-sucesso`}>
        <Check className="size-3.5" strokeWidth={2.6} /> Enviada
      </span>
    );
  if (l.estado === "erro")
    return (
      <span className={`${chip} max-w-[260px] bg-perigo-suave text-perigo`} title={l.mensagem}>
        <AlertCircle className="size-3.5 shrink-0" /> <span className="truncate">{l.mensagem}</span>
      </span>
    );
  if (jaEnviado) return <span className={`${chip} bg-alerta-suave text-alerta`}>Já enviada · reenviar</span>;
  return null;
}

// Busca de cliente para um arquivo que não foi reconhecido.
function EscolherCliente({ aoEscolher }: { aoEscolher: (c: ClienteAdiantamento) => void }) {
  const lista = useId();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ClienteAdiantamento[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const ultima = useRef(0);
  const mostrar = termo.trim().length >= 2;

  useEffect(() => {
    if (termo.trim().length < 2) return;
    const id = ++ultima.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      const r = await buscarClientesAdiantamento(termo).catch(() => []);
      if (id !== ultima.current) return; // chegou uma busca mais nova
      setResultados(r);
      setAtivo(0);
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [termo]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-alerta" />
      <input
        value={termo}
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
        role="combobox"
        aria-expanded={mostrar && resultados.length > 0}
        aria-controls={lista}
        aria-autocomplete="list"
        aria-label="Cliente do arquivo"
        autoComplete="off"
        placeholder="Cliente não reconhecido: buscar"
        className="h-10 w-full rounded-full border border-dashed border-alerta-borda bg-superficie pr-9 pl-10 text-sm text-texto outline-none placeholder:font-semibold placeholder:text-alerta focus:border-primaria focus:ring-4 focus:ring-primaria/15"
      />
      {buscando && (
        <LoaderCircle className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-destaque" />
      )}
      {mostrar && !buscando && (
        <ul
          id={lista}
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
                  {nomeCliente(c)}
                </span>
                <span className="block truncate text-xs text-texto-suave">
                  {c.destinatarios.length ? c.destinatarios.join(", ") : "Sem e-mail cadastrado"}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
