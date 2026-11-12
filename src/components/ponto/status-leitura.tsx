import type { StatusLeitura as Status } from "@/lib/ponto";

const ROTULO: Record<Status, { texto: string; classe: string }> = {
  enviando: { texto: "Enviando", classe: "bg-suave text-texto-suave" },
  lendo: { texto: "Lendo", classe: "bg-info-suave text-destaque" },
  conferir: { texto: "Conferir", classe: "bg-alerta-suave text-alerta" },
  confirmada: { texto: "Confirmada", classe: "bg-sucesso-suave text-sucesso" },
  erro: { texto: "Falhou", classe: "bg-perigo-suave text-perigo" },
};

export function StatusLeitura({ status }: { status: Status }) {
  const r = ROTULO[status];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${r.classe}`}>{r.texto}</span>;
}
