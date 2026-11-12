"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { AlertCircle, HandCoins, LoaderCircle, Mail, Phone, Plus, Trash2, UserRound } from "lucide-react";
import type { Contato } from "@/lib/clientes";
import { marcarRecebeAdiantamento, removerContato, salvarContato, type EstadoContato } from "@/lib/contatos-actions";

const campo =
  "h-11 w-full rounded-bloco border border-borda bg-superficie px-4 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";

export function Contatos({
  clienteId,
  contatos,
  emailCadastro,
  podeAlterar,
}: {
  clienteId: string;
  contatos: Contato[];
  emailCadastro: string | null;
  podeAlterar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<EstadoContato | null>(null);
  const [estado, acao, salvando] = useActionState<EstadoContato, FormData>(async (_, form) => {
    const r = await salvarContato(form);
    if (r.ok) {
      setAberto(false);
      setVersao((v) => v + 1);
      setAviso(r);
    }
    return r;
  }, {});
  const recebem = contatos.filter((c) => c.recebe_adiantamento && c.email);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-texto">Contatos</h2>
          <p className="text-sm text-texto-suave">
            {recebem.length
              ? `Folha de adiantamento vai para ${recebem.map((c) => c.email).join(", ")}.`
              : emailCadastro
                ? `Nenhum contato marcado: a folha de adiantamento vai para o e-mail do cadastro (${emailCadastro}).`
                : "Nenhum contato recebe a folha de adiantamento, e o cadastro não tem e-mail."}
          </p>
        </div>
        {podeAlterar && !aberto && (
          <button
            type="button"
            onClick={() => {
              setAviso(null);
              setAberto(true);
            }}
            className="flex h-10 items-center gap-2 rounded-full border-2 border-primaria px-4 text-sm font-bold text-destaque transition-colors hover:bg-primaria hover:text-sobre-primaria"
          >
            <Plus className="size-4" strokeWidth={2.4} /> Novo contato
          </button>
        )}
      </div>

      {aviso && <Aviso estado={aviso} />}

      {aberto && (
        <form key={versao} action={acao} className="mt-5 grid gap-4 rounded-bloco bg-fundo p-4 sm:grid-cols-2">
          <input type="hidden" name="clienteId" value={clienteId} />
          {estado.erro && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-bloco bg-perigo-suave px-4 py-3 text-sm font-medium text-perigo sm:col-span-2"
            >
              <AlertCircle className="size-4 shrink-0" />
              {estado.erro}
            </p>
          )}
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">Nome</span>
            <input name="nome" required autoFocus autoComplete="off" className={campo} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">Cargo</span>
            <input name="cargo" autoComplete="off" placeholder="Ex.: RH, sócio" className={campo} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">E-mail</span>
            <input name="email" type="email" autoComplete="off" className={campo} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-texto">Telefone</span>
            <input name="telefone" type="tel" autoComplete="off" className={campo} />
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-texto sm:col-span-2">
            <input
              type="checkbox"
              name="recebe_adiantamento"
              defaultChecked={!recebem.length}
              className="size-4 accent-primaria"
            />
            Recebe a folha de adiantamento
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={salvando}
              className="flex h-11 items-center gap-2 rounded-full bg-primaria px-6 text-sm font-bold text-sobre-primaria transition-colors hover:bg-primaria-hover disabled:opacity-70"
            >
              {salvando && <LoaderCircle className="size-4 animate-spin" />}
              {salvando ? "Salvando…" : "Adicionar contato"}
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="h-11 rounded-full px-5 text-sm font-semibold text-texto-suave hover:bg-suave"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {contatos.length === 0 ? (
        !aberto && (
          <p className="mt-5 rounded-bloco bg-fundo px-4 py-6 text-center text-sm text-texto-suave">
            Nenhum contato cadastrado.
          </p>
        )
      ) : (
        <ul className="mt-5 divide-y divide-borda">
          {contatos.map((c) => (
            <LinhaContato key={c.id} contato={c} podeAlterar={podeAlterar} aoAvisar={setAviso} />
          ))}
        </ul>
      )}
    </>
  );
}

function LinhaContato({
  contato: c,
  podeAlterar,
  aoAvisar,
}: {
  contato: Contato;
  podeAlterar: boolean;
  aoAvisar: (e: EstadoContato) => void;
}) {
  const [recebe, setRecebe] = useOptimistic(c.recebe_adiantamento);
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3.5">
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-suave text-destaque">
          <UserRound className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-texto">
            {c.nome}
            {c.cargo && <span className="font-normal text-texto-suave"> · {c.cargo}</span>}
          </span>
          <span className="flex flex-wrap gap-x-4 text-xs text-texto-suave">
            {c.email && (
              <span className="flex items-center gap-1">
                <Mail className="size-3" /> {c.email}
              </span>
            )}
            {c.telefone && (
              <span className="flex items-center gap-1">
                <Phone className="size-3" /> {c.telefone}
              </span>
            )}
          </span>
        </span>
      </span>

      <span className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={recebe}
          disabled={!podeAlterar || pendente || (!c.email && !recebe)}
          title={!c.email ? "Cadastre um e-mail para receber a folha" : undefined}
          onClick={() =>
            iniciar(async () => {
              setRecebe(!recebe);
              aoAvisar(await marcarRecebeAdiantamento(c.id, !recebe));
            })
          }
          className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            recebe ? "bg-primaria text-sobre-primaria" : "border border-borda text-texto-suave hover:bg-suave"
          }`}
        >
          <HandCoins className="size-3.5" /> {recebe ? "Recebe a folha" : "Não recebe a folha"}
        </button>
        {podeAlterar &&
          (confirmando ? (
            <button
              type="button"
              disabled={pendente}
              onClick={() => iniciar(async () => aoAvisar(await removerContato(c.id)))}
              onBlur={() => setConfirmando(false)}
              autoFocus
              className="h-8 rounded-full bg-perigo-forte px-3 text-xs font-bold text-white"
            >
              {pendente ? "Removendo…" : "Remover?"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-perigo-suave hover:text-perigo"
              aria-label={`Remover ${c.nome}`}
            >
              <Trash2 className="size-4" />
            </button>
          ))}
      </span>
    </li>
  );
}

function Aviso({ estado }: { estado: EstadoContato }) {
  return (
    <p role="status" className={`mt-4 text-xs font-semibold ${estado.erro ? "text-perigo" : "text-sucesso"}`}>
      {estado.erro ?? estado.ok}
    </p>
  );
}
