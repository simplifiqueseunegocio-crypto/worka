"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FileImage, FileText, LoaderCircle, ScanLine, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { iniciarLeituraDocumento, prepararEnvioDocumento } from "@/lib/documentos/actions";
import { SeletorCliente, type ClienteEscolhido } from "@/components/documentos/seletor-cliente";

const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const tamanho = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

// Envio de documentos de um tipo: o cliente (opcional, mas ajuda a ligar os
// funcionários já cadastrados) e os arquivos.
export function EnvioDocumentos({ tipo, aceita, plural }: { tipo: string; aceita: string; plural: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, enviar] = useTransition();

  const adicionar = (lista: FileList | null) => {
    if (!lista) return;
    const novos = [...lista];
    const recusados = novos.filter((f) => !TIPOS.includes(f.type));
    setErro(recusados.length ? `Formato não aceito: ${recusados.map((f) => f.name).join(", ")}. Envie PDF, JPG, PNG ou WEBP.` : null);
    setArquivos((atual) => [...atual, ...novos.filter((f) => TIPOS.includes(f.type))].slice(0, 30));
  };

  const iniciar = () =>
    enviar(async () => {
      setErro(null);
      setEtapa("Preparando…");
      const r = await prepararEnvioDocumento({
        tipo,
        clienteId: cliente?.id ?? null,
        arquivos: arquivos.map((f) => ({ nome: f.name, tipo: f.type, bytes: f.size })),
      });
      if ("erro" in r) {
        setErro(r.erro);
        setEtapa(null);
        return;
      }
      const storage = createClient().storage.from("documentos");
      for (let i = 0; i < arquivos.length; i++) {
        setEtapa(`Enviando ${i + 1} de ${arquivos.length}…`);
        const { error } = await storage.uploadToSignedUrl(r.envios[i].path, r.envios[i].token, arquivos[i], { contentType: arquivos[i].type });
        if (error) {
          setErro(`Falha ao enviar ${arquivos[i].name}. Tente de novo.`);
          setEtapa(null);
          return;
        }
      }
      setEtapa("Começando a leitura…");
      const ini = await iniciarLeituraDocumento(r.leituraId);
      if (ini.erro) {
        setErro(ini.erro);
        setEtapa(null);
        return;
      }
      router.push(`/automacoes/documentos/${tipo}/${r.leituraId}`);
    });

  return (
    <section className="rounded-card bg-superficie p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-texto">
        <ScanLine className="size-5 text-destaque" /> Nova leitura
      </h2>

      <div className="mt-5">
        <div
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
          onClick={() => entrada.current?.click()}
          className={`flex min-h-52 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-bloco border-2 border-dashed px-6 py-12 text-center text-sm transition-colors ${
            arrastando ? "border-primaria bg-suave" : "border-borda hover:border-primaria/50 hover:bg-fundo"
          }`}
        >
          <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-suave">
            <Upload className="size-6 text-destaque" />
          </span>
          <span className="text-base font-semibold text-texto">Arraste os {plural} aqui ou clique para escolher</span>
          <span className="text-xs text-texto-suave">{aceita} · PDF, JPG, PNG ou WEBP · até 30 arquivos</span>
          <input
            ref={entrada}
            type="file"
            multiple
            accept=".pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              adicionar(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {arquivos.length > 0 && (
        <ul className="mt-4 divide-y divide-borda rounded-bloco border border-borda text-sm">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
              {f.type === "application/pdf" ? <FileText className="size-4 shrink-0 text-perigo" /> : <FileImage className="size-4 shrink-0 text-destaque" />}
              <span className="min-w-0 flex-1 truncate text-texto">{f.name}</span>
              <span className="text-xs text-texto-suave tabular-nums">{tamanho(f.size)}</span>
              <button
                type="button"
                disabled={enviando}
                onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))}
                className="rounded-full p-1 text-texto-suave hover:bg-suave hover:text-texto"
                aria-label={`Tirar ${f.name}`}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-1.5 text-sm sm:w-80">
          <span className="font-semibold text-texto">
            Cliente <span className="font-normal text-texto-suave">· opcional agora, obrigatório para confirmar</span>
          </span>
          <SeletorCliente tipo={tipo} valor={cliente} onEscolher={setCliente} bloqueado={enviando} />
        </div>
        <button
          type="button"
          disabled={enviando || !arquivos.length}
          onClick={iniciar}
          className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover disabled:opacity-50"
        >
          {enviando ? <LoaderCircle className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
          {enviando ? etapa : arquivos.length ? `Ler ${arquivos.length} ${arquivos.length === 1 ? "arquivo" : "arquivos"}` : "Ler arquivos"}
        </button>
        {erro && (
          <p role="alert" className="text-sm font-semibold text-perigo">
            {erro}
          </p>
        )}
      </div>
    </section>
  );
}
