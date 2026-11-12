import { AlertTriangle, CircleCheck, CircleDashed, CircleOff, CircleX, Minus } from "lucide-react";
import type { SituacaoCliente, StatusCndTela } from "@/lib/cnd";

export const SEM_COBERTURA = "Sem consulta automática para o estado ou município do cliente";
export const DISPENSADA = "O cliente não acompanha esta certidão (página do cliente → Certidões)";

export const situacoesCnd: Record<SituacaoCliente, { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Com pendência", classe: "bg-perigo-suave text-perigo" },
  regular: { rotulo: "Regular", classe: "bg-sucesso-suave text-sucesso" },
  erro: { rotulo: "Erro na consulta", classe: "bg-alerta-suave text-alerta" },
  sem_consulta: { rotulo: "Não consultado", classe: "bg-suave text-texto-suave" },
};

export function SituacaoClienteChip({ situacao }: { situacao: SituacaoCliente }) {
  const { rotulo, classe } = situacoesCnd[situacao];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${classe}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {rotulo}
    </span>
  );
}

const icones = {
  regular: { Icone: CircleCheck, classe: "text-sucesso", rotulo: "Regular" },
  pendente: { Icone: CircleX, classe: "text-perigo", rotulo: "Pendência" },
  erro: { Icone: AlertTriangle, classe: "text-alerta", rotulo: "Erro" },
  nenhum: { Icone: CircleDashed, classe: "text-texto-suave/50", rotulo: "Não consultado" },
  sem_cobertura: { Icone: Minus, classe: "text-texto-suave/40", rotulo: "Sem cobertura" },
  dispensada: { Icone: CircleOff, classe: "text-texto-suave/40", rotulo: "Não acompanha" },
};

// Ícone da situação de uma certidão; a mensagem da consulta vai no title.
export function StatusCndIcone({
  status,
  mensagem,
  comRotulo = false,
}: {
  status: StatusCndTela | null;
  mensagem?: string;
  comRotulo?: boolean;
}) {
  const { Icone, classe, rotulo } = icones[status ?? "nenhum"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${classe}`}
      title={mensagem ?? (status === "sem_cobertura" ? SEM_COBERTURA : status === "dispensada" ? DISPENSADA : rotulo)}
    >
      <Icone className="size-[18px]" strokeWidth={2} aria-hidden="true" />
      <span className={comRotulo ? "" : "sr-only"}>{rotulo}</span>
    </span>
  );
}
