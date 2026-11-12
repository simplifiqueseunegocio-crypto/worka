// Status do banco, mais "atrasada" (aberta com o prazo legal vencido), só para exibição.
export type StatusTarefa =
  | "pendente"
  | "em_andamento"
  | "aguardando_cliente"
  | "concluida"
  | "dispensada"
  | "atrasada";

const estilos: Record<StatusTarefa, { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Pendente", classe: "bg-suave text-texto-suave" },
  em_andamento: { rotulo: "Em andamento", classe: "bg-info-suave text-info" },
  aguardando_cliente: { rotulo: "Aguardando cliente", classe: "bg-alerta-suave text-alerta" },
  concluida: { rotulo: "Concluída", classe: "bg-sucesso-suave text-sucesso" },
  atrasada: { rotulo: "Atrasada", classe: "bg-perigo-suave text-perigo" },
  dispensada: { rotulo: "Dispensada", classe: "bg-superficie text-texto-suave ring-1 ring-borda" },
};

export function StatusTarefaChip({ status }: { status: StatusTarefa }) {
  const { rotulo, classe } = estilos[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${classe}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {rotulo}
    </span>
  );
}
