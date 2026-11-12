"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { enviarCertificado, excluirCertificado, type EstadoCertificado } from "@/lib/certificados-actions";

const campo =
  "h-10 w-full rounded-bloco border border-borda bg-superficie px-3 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";

function Aviso({ estado }: { estado: EstadoCertificado | null }) {
  if (!estado) return null;
  return (
    <p role="status" className={`text-sm font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
      {estado.erro ?? estado.ok}
    </p>
  );
}

// Envio de um certificado novo (admin). O novo passa a ser o atual.
export function EnvioCertificado({ temAtual }: { temAtual: boolean }) {
  const [aberto, setAberto] = useState(!temAtual);
  const [estado, setEstado] = useState<EstadoCertificado | null>(null);
  const [pendente, iniciar] = useTransition();

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setEstado(null);
            setAberto(true);
          }}
          className="flex h-10 items-center gap-2 rounded-full border border-borda bg-superficie px-4 text-sm font-semibold text-texto hover:bg-suave"
        >
          <Upload className="size-4" /> Enviar certificado novo
        </button>
        <Aviso estado={estado} />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        const form = e.currentTarget;
        iniciar(async () => {
          const r = await enviarCertificado(dados);
          setEstado(r);
          if (r.ok) {
            form.reset();
            setAberto(false);
          }
        });
      }}
      className="rounded-card bg-superficie ring-1 ring-borda p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-texto">{temAtual ? "Enviar certificado novo" : "Enviar o certificado"}</h2>
        {temAtual && (
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-suave"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_170px_1fr]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
          Nome
          <input name="nome" required maxLength={120} placeholder="Ex.: A1 Empresa 2026/2027" className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
          Válido até
          <input type="date" name="validoAte" required className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave sm:col-span-2 lg:col-span-1">
          Arquivo (.pfx ou .p12)
          <input
            type="file"
            name="arquivo"
            required
            accept=".pfx,.p12,application/x-pkcs12"
            className="text-sm text-texto file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-suave file:px-4 file:text-sm file:font-semibold file:text-texto hover:file:bg-borda"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave sm:col-span-2 lg:col-span-3">
          Observação (opcional)
          <input name="observacao" maxLength={500} placeholder="Ex.: com quem pedir a senha" className={campo} />
        </label>
      </div>
      <p className="mt-3 text-xs text-texto-suave">Não escreva a senha em nenhum campo: ela não fica guardada na plataforma.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="flex h-10 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover disabled:opacity-60"
        >
          {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Enviar
        </button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function ExcluirCertificado({ id, nome }: { id: string; nome: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, setEstado] = useState<EstadoCertificado | null>(null);
  const [pendente, iniciar] = useTransition();

  if (!confirmando) {
    return (
      <span className="flex items-center gap-2">
        {estado?.erro && <span className="text-xs text-perigo">{estado.erro}</span>}
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-suave hover:text-perigo"
          aria-label={`Excluir ${nome}`}
        >
          <Trash2 className="size-4" />
        </button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setEstado(await excluirCertificado(id));
            setConfirmando(false);
          })
        }
        className="flex h-8 items-center gap-1 rounded-full bg-perigo-forte px-3 text-xs font-bold text-white hover:bg-perigo-forte disabled:opacity-60"
      >
        {pendente && <LoaderCircle className="size-3 animate-spin" />} Excluir
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-suave"
        aria-label="Cancelar"
      >
        <X className="size-4" />
      </button>
    </span>
  );
}
