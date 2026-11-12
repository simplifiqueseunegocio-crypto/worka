"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { AlertCircle, Check, Copy, KeyRound, LoaderCircle, Mail, UserPlus, X } from "lucide-react";
import type { Papel } from "@/lib/auth";
import {
  alterarAtivo,
  alterarDepartamento,
  alterarPapel,
  convidarPessoa,
  redefinirSenha,
  type EstadoConvite,
  type EstadoEquipe,
} from "@/lib/equipe-actions";
import { rotulosPapel } from "@/lib/papeis";

type Dep = { id: number; nome: string; cor: string };

const campo =
  "h-11 w-full rounded-bloco border border-borda bg-superficie px-4 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";

function Aviso({ estado }: { estado: EstadoEquipe | null }) {
  if (!estado) return null;
  return (
    <span role="status" className={`text-xs font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
      {estado.erro ?? estado.ok}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Resultado do envio do link de senha. Se o e-mail não saiu, mostra o link
// uma única vez, para o admin repassar à pessoa.

function LinkEnviado({ estado, aoFechar }: { estado: EstadoConvite; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div role="status" className="animate-surgir rounded-bloco bg-escuro p-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">
          {estado.ok} {estado.nome && <span className="text-texto-inverso-suave">· {estado.nome}</span>}
        </p>
        <button
          type="button"
          onClick={aoFechar}
          className="grid size-8 shrink-0 place-items-center rounded-full text-texto-inverso-suave hover:bg-white/10 hover:text-white"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>
      </div>
      {estado.enviado ? (
        <p className="mt-3 flex items-center gap-2 text-sm">
          <Mail className="size-4 shrink-0 text-realce" />
          <span>
            Enviamos para <strong className="break-all">{estado.email}</strong> o link para definir a senha. Ele vale por
            24 horas.
          </span>
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-texto-inverso-suave">
            O e-mail não saiu (confira Configurações → E-mail). Repasse este link para{" "}
            <strong className="break-all text-white">{estado.email}</strong>: ele vale por 24 horas, só pode ser usado
            uma vez e não aparece de novo.
          </p>
          <p className="mt-3 rounded-bloco bg-white/10 px-3 py-2 font-mono text-xs break-all">{estado.link}</p>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(estado.link!);
              setCopiado(true);
            }}
            className="mt-3 flex h-9 items-center gap-2 rounded-full bg-realce px-4 text-xs font-bold text-texto hover:bg-superficie"
          >
            {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copiado ? "Copiado" : "Copiar link"}
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cadastro de pessoa

export function CadastrarPessoa({ departamentos }: { departamentos: Dep[] }) {
  const [aberto, setAberto] = useState(false);
  const [versao, setVersao] = useState(0);
  const [estado, acao, enviando] = useActionState<EstadoConvite, FormData>(async (anterior, form) => {
    const r = await convidarPessoa(anterior, form);
    if (r.ok) setVersao((v) => v + 1); // limpa o formulário para o próximo cadastro
    return r;
  }, {});
  const [fechado, setFechado] = useState<EstadoConvite | null>(null);
  const resultadoVisivel = Boolean(estado.ok) && estado !== fechado;

  return (
    <section className="mt-8 animate-surgir rounded-card bg-superficie ring-1 ring-borda p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-texto">Cadastrar pessoa</h2>
          <p className="text-sm text-texto-suave">
            Não há cadastro público: só o administrador dá acesso. A pessoa recebe um e-mail para definir a própria senha.
          </p>
        </div>
        {!aberto && (
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover"
          >
            <UserPlus className="size-4" strokeWidth={2.2} /> Nova pessoa
          </button>
        )}
      </div>

      {resultadoVisivel && (
        <div className="mt-5">
          <LinkEnviado estado={estado} aoFechar={() => setFechado(estado)} />
        </div>
      )}

      {aberto && (
        <form key={versao} action={acao} className="mt-5 grid gap-5 border-t border-borda pt-5 lg:grid-cols-2">
          {estado.erro && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo lg:col-span-2"
            >
              <AlertCircle className="size-4 shrink-0" />
              {estado.erro}
            </p>
          )}

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">Nome</span>
            <input name="nome" required autoComplete="off" defaultValue={estado.erro ? estado.nome : ""} className={campo} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">E-mail</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="nome@empresa.com.br"
              defaultValue={estado.erro ? estado.email : ""}
              className={campo}
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-texto">Papel</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(rotulosPapel) as Papel[]).map((p) => (
                <label
                  key={p}
                  className="flex cursor-pointer flex-col gap-1 rounded-bloco border border-borda p-3 transition has-checked:border-primaria has-checked:bg-suave"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-texto">
                    <input type="radio" name="papel" value={p} defaultChecked={p === "colaborador"} className="accent-primaria" />
                    {rotulosPapel[p].rotulo}
                  </span>
                  <span className="text-xs text-texto-suave">{rotulosPapel[p].descricao}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-texto">Departamentos</legend>
            <div className="flex flex-wrap gap-2">
              {departamentos.map((d) => (
                <label
                  key={d.id}
                  className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-borda px-4 text-sm font-medium text-texto-suave transition has-checked:border-primaria has-checked:bg-suave has-checked:text-texto"
                >
                  <input type="checkbox" name="departamento" value={d.id} className="sr-only" />
                  <span className="size-2.5 rounded-full" style={{ background: d.cor }} aria-hidden="true" />
                  {d.nome}
                </label>
              ))}
            </div>
            <span className="text-xs text-texto-suave">O gestor só gere as tarefas dos departamentos marcados.</span>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
            <button
              type="submit"
              disabled={enviando}
              className="flex h-11 items-center gap-2 rounded-full bg-primaria px-6 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:opacity-70"
            >
              {enviando ? <LoaderCircle className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              {enviando ? "Cadastrando…" : "Cadastrar e enviar e-mail"}
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="h-11 rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave hover:text-texto"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Controles de cada pessoa na lista

export function PapelMembro({ id, papel, proprio }: { id: string; papel: Papel; proprio: boolean }) {
  const [estado, setEstado] = useState<EstadoEquipe | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <span className="flex flex-col gap-1">
      <span className="relative flex items-center">
        <select
          defaultValue={papel}
          disabled={proprio || pendente}
          title={proprio ? "Você não pode alterar o seu próprio papel" : undefined}
          aria-label="Papel"
          onChange={(e) => {
            const select = e.currentTarget;
            iniciar(async () => {
              const r = await alterarPapel(id, select.value as Papel);
              if (r.erro) select.value = papel;
              setEstado(r.erro ? r : null);
            });
          }}
          className="h-9 cursor-pointer rounded-full border border-borda bg-superficie pr-8 pl-3 text-sm font-medium text-texto outline-none focus:border-primaria focus:ring-4 focus:ring-primaria/15 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {(Object.keys(rotulosPapel) as Papel[]).map((p) => (
            <option key={p} value={p}>
              {rotulosPapel[p].rotulo}
            </option>
          ))}
        </select>
        {pendente && <LoaderCircle className="absolute right-3 size-3.5 animate-spin text-destaque" />}
      </span>
      <Aviso estado={estado} />
    </span>
  );
}

export function DepartamentosMembro({ id, marcados, departamentos }: { id: string; marcados: number[]; departamentos: Dep[] }) {
  const [estado, setEstado] = useState<EstadoEquipe | null>(null);
  const [, iniciar] = useTransition();
  const [otimista, alternar] = useOptimistic(marcados, (atual: number[], dep: number) =>
    atual.includes(dep) ? atual.filter((d) => d !== dep) : [...atual, dep],
  );

  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap gap-1.5">
        {departamentos.map((d) => {
          const ligado = otimista.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={ligado}
              onClick={() =>
                iniciar(async () => {
                  alternar(d.id);
                  const r = await alterarDepartamento(id, d.id, !ligado);
                  setEstado(r.erro ? r : null);
                })
              }
              className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition ${
                ligado
                  ? "border-primaria/30 bg-suave text-texto"
                  : "border-dashed border-borda text-texto-suave/70 hover:border-texto-suave/40 hover:text-texto"
              }`}
            >
              <span
                className={`size-2 rounded-full ${ligado ? "" : "opacity-40"}`}
                style={{ background: d.cor }}
                aria-hidden="true"
              />
              {d.nome}
            </button>
          );
        })}
      </span>
      <Aviso estado={estado} />
    </span>
  );
}

export function AcessoMembro({ id, ativo, proprio }: { id: string; ativo: boolean; proprio: boolean }) {
  const [estado, setEstado] = useState<EstadoEquipe | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={ativo}
          aria-label="Acesso à plataforma"
          disabled={proprio || pendente}
          title={proprio ? "Você não pode desativar o seu próprio acesso" : undefined}
          onClick={() => iniciar(async () => setEstado(await alterarAtivo(id, !ativo)))}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
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
        <span className={`text-sm font-semibold ${ativo ? "text-sucesso" : "text-texto-suave"}`}>
          {ativo ? "Ativo" : "Desativado"}
        </span>
      </span>
      {estado?.erro && <Aviso estado={estado} />}
    </span>
  );
}

export function RedefinirSenha({ id, nome }: { id: string; nome: string }) {
  const [estado, setEstado] = useState<EstadoConvite | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();

  if (estado?.ok) {
    return (
      <div className="w-[340px] max-w-[80vw] text-left">
        <LinkEnviado estado={estado} aoFechar={() => setEstado(null)} />
      </div>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1">
        {confirmando && !pendente && (
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="h-9 rounded-full px-3 text-xs font-semibold text-texto-suave hover:bg-suave"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          disabled={pendente}
          aria-label={confirmando ? `Confirmar envio do link de senha para ${nome}` : `Redefinir senha de ${nome}`}
          onClick={() => {
            if (!confirmando) return setConfirmando(true);
            iniciar(async () => {
              setEstado(await redefinirSenha(id));
              setConfirmando(false);
            });
          }}
          className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition-colors disabled:opacity-60 ${
            confirmando ? "bg-primaria text-sobre-primaria hover:bg-primaria-hover" : "text-destaque hover:bg-suave"
          }`}
        >
          {pendente ? <LoaderCircle className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
          {confirmando ? "Enviar link de senha?" : "Redefinir senha"}
        </button>
      </span>
      <Aviso estado={estado} />
    </span>
  );
}
