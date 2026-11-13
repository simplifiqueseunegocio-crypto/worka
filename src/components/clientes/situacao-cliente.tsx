"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import type { StatusCliente } from "@/lib/clientes";
import { alterarStatusCliente, excluirCliente, type EstadoCliente } from "@/lib/clientes-actions";

type Impacto = {
  tarefas: number;
  contatos: number;
  consultasCnd: number;
  certidoes: number;
  envios: number;
  noDominio: boolean;
};

const rotulos: Record<StatusCliente, { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: "bg-sucesso-suave text-sucesso" },
  suspenso: { rotulo: "Suspenso", classe: "bg-alerta-suave text-alerta" },
  encerrado: { rotulo: "Encerrado", classe: "bg-suave text-texto-suave" },
};

const acoes: Record<StatusCliente, { para: StatusCliente; rotulo: string }[]> = {
  ativo: [
    { para: "suspenso", rotulo: "Suspender" },
    { para: "encerrado", rotulo: "Encerrar" },
  ],
  suspenso: [
    { para: "ativo", rotulo: "Reativar" },
    { para: "encerrado", rotulo: "Encerrar" },
  ],
  encerrado: [
    { para: "ativo", rotulo: "Reativar" },
    { para: "suspenso", rotulo: "Suspender" },
  ],
};

const n = (v: number, um: string, varios: string) => `${v.toLocaleString("pt-BR")} ${v === 1 ? um : varios}`;

// Situação do cliente na carteira: suspender, encerrar, reativar (admin e
// gestor) e excluir (admin, fora de atividade e fora da integração).
export function SituacaoCliente({
  clienteId,
  nome,
  status,
  statusManual,
  doDominio,
  podeAlterar,
  impacto,
}: {
  clienteId: string;
  nome: string;
  status: StatusCliente;
  statusManual: boolean;
  doDominio: boolean;
  podeAlterar: boolean;
  impacto: Impacto | null; // só para o admin, com o cliente fora de atividade
}) {
  const [aviso, setAviso] = useState<EstadoCliente | null>(null);
  const [confirmando, setConfirmando] = useState<StatusCliente | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [pendente, iniciar] = useTransition();
  const { rotulo, classe } = rotulos[status];

  const origem =
    status === "ativo"
      ? doDominio
        ? "Cadastro trazido da antiga integração com o Domínio."
        : "Cadastrado na plataforma."
      : statusManual
        ? "Definido pela equipe."
        : "Suspenso pela antiga sincronização com o Domínio.";

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${classe}`}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {rotulo}
        </span>
        <span className="text-xs text-texto-suave">{origem}</span>
        {podeAlterar && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {acoes[status].map((a) =>
              confirmando === a.para ? (
                <span key={a.para} className="flex items-center gap-1">
                  <button
                    type="button"
                    autoFocus
                    disabled={pendente}
                    onClick={() =>
                      iniciar(async () => {
                        setAviso(await alterarStatusCliente(clienteId, a.para));
                        setConfirmando(null);
                      })
                    }
                    className="flex h-9 items-center gap-2 rounded-full bg-primaria px-4 text-xs font-bold text-sobre-primaria hover:bg-primaria-hover"
                  >
                    {pendente && <LoaderCircle className="size-3.5 animate-spin" />}
                    {a.rotulo} o cliente?
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(null)}
                    className="h-9 rounded-full px-3 text-xs font-semibold text-texto-suave hover:bg-suave"
                  >
                    Cancelar
                  </button>
                </span>
              ) : (
                <button
                  key={a.para}
                  type="button"
                  disabled={pendente}
                  onClick={() => {
                    setAviso(null);
                    setExcluindo(false);
                    setConfirmando(a.para);
                  }}
                  className="h-9 rounded-full border border-borda bg-superficie px-4 text-xs font-semibold text-texto hover:bg-suave"
                >
                  {a.rotulo}
                </button>
              ),
            )}
            {impacto && (
              <button
                type="button"
                onClick={() => {
                  setAviso(null);
                  setConfirmando(null);
                  setExcluindo((v) => !v);
                }}
                aria-expanded={excluindo}
                className="flex h-9 items-center gap-1.5 rounded-full border border-perigo-borda bg-superficie px-4 text-xs font-semibold text-perigo hover:bg-perigo-suave"
              >
                <Trash2 className="size-3.5" /> Excluir cliente
              </button>
            )}
          </span>
        )}
      </div>

      {aviso && (
        <p role="status" className={`mt-2 text-xs font-semibold ${aviso.erro ? "text-perigo" : "text-sucesso"}`}>
          {aviso.erro ?? aviso.ok}
        </p>
      )}

      {excluindo && impacto && <ConfirmarExclusao clienteId={clienteId} nome={nome} impacto={impacto} />}
    </div>
  );
}

function ConfirmarExclusao({ clienteId, nome, impacto: i }: { clienteId: string; nome: string; impacto: Impacto }) {
  const [entendi, setEntendi] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (i.noDominio) {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-bloco bg-alerta-suave p-4 text-sm text-alerta">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong className="font-semibold">Não dá para excluir:</strong> o cliente veio na última sincronização com a
          Conta Azul e seria criado de novo, sem o histórico. Mantenha suspenso ou encerrado, ou inative o cliente na
          Conta Azul e exclua depois da próxima sincronização.
        </span>
      </div>
    );
  }

  const itens = [
    n(i.tarefas, "tarefa", "tarefas"),
    n(i.contatos, "contato", "contatos"),
    n(i.consultasCnd, "consulta de CND", "consultas de CND"),
    n(i.certidoes, "certidão lançada (com o PDF)", "certidões lançadas (com os PDFs)"),
    n(i.envios, "envio da folha de adiantamento", "envios da folha de adiantamento"),
  ];

  return (
    <div className="mt-3 rounded-bloco border border-perigo-borda bg-perigo-suave p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-perigo">
        <AlertTriangle className="size-4 shrink-0" /> Excluir {nome}?
      </p>
      <p className="mt-2 text-sm text-texto">Some junto, sem volta:</p>
      <ul className="mt-1 list-inside list-disc text-sm text-texto-suave">
        {itens.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {erro && <p className="mt-2 text-xs font-semibold text-perigo">{erro}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-texto">
          <input
            type="checkbox"
            checked={entendi}
            onChange={(e) => setEntendi(e.target.checked)}
            className="size-4 accent-perigo"
          />
          Entendo que a exclusão não pode ser desfeita
        </label>
        <button
          type="button"
          disabled={!entendi || pendente}
          onClick={() =>
            iniciar(async () => {
              // Com sucesso, a ação redireciona para a lista de clientes.
              const r = await excluirCliente(clienteId);
              if (r?.erro) setErro(r.erro);
            })
          }
          className="ml-auto flex h-10 items-center gap-2 rounded-full bg-perigo-forte px-5 text-sm font-bold text-white transition-opacity disabled:opacity-40"
        >
          {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          {pendente ? "Excluindo…" : "Excluir definitivamente"}
        </button>
      </div>
    </div>
  );
}
