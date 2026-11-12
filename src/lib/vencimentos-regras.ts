// Regras do Monitor de vencimentos (servidor e tela).
//
// Marcos de aviso, em dias antes do vencimento: o "avisar_dias" do item, 15,
// 7, 1, o próprio dia (0) e depois de vencido (-1). Cada marco é avisado uma
// vez; dia sem aviso (fim de semana) não perde o marco: ele sai na próxima
// execução, porque vale o menor marco já alcançado e ainda não avisado.

export const TIPOS_VENCIMENTO = {
  certificado_digital: "Certificado digital",
  alvara: "Alvará",
  licenca: "Licença",
  procuracao: "Procuração",
  contrato: "Contrato",
  outro: "Outro",
} as const;
export type TipoVencimento = keyof typeof TIPOS_VENCIMENTO;

export const diasAte = (venceEm: string, hoje: string) =>
  Math.round((Date.parse(`${venceEm}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);

export function marcos(avisarDias: number) {
  return [...new Set([avisarDias, 15, 7, 1, 0, -1])].filter((m) => m <= avisarDias).sort((a, b) => b - a);
}

// Marco a avisar hoje (ou null): o menor marco já alcançado (dias <= marco),
// desde que seja menor que o último avisado.
export function marcoDevido(dias: number, avisarDias: number, ultimoMarco: number | null): number | null {
  const alcancados = marcos(avisarDias).filter((m) => (m === -1 ? dias < 0 : dias <= m));
  if (!alcancados.length) return null;
  const marco = alcancados[alcancados.length - 1];
  return ultimoMarco === null || marco < ultimoMarco ? marco : null;
}

export type Situacao = "vencido" | "vencendo" | "em_dia";
export function situacao(dias: number, avisarDias: number): Situacao {
  if (dias < 0) return "vencido";
  return dias <= avisarDias ? "vencendo" : "em_dia";
}

export function quando(dias: number) {
  if (dias < -1) return `venceu há ${-dias} dias`;
  if (dias === -1) return "venceu ontem";
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `vence em ${dias} dias`;
}
