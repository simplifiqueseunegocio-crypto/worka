// Cálculo de prazos das obrigações, igual ao do banco (calcula_prazo_legal,
// ajusta_dia_util e gerar_tarefas_interno na migration fase1). Sem dependências
// de servidor: serve à página e à prévia do editor no navegador.
// Datas como "AAAA-MM-DD"; feriados são os nacionais (uf nulo), como no banco.

export type Periodicidade = "mensal" | "trimestral" | "anual";
export type Ajuste = "antecipa" | "posterga" | "nenhum";
export type RegimeObrigacao = "mei" | "simples" | "presumido" | "real";

export type RegraObrigacao = {
  periodicidade: Periodicidade;
  dia_vencimento: number;
  meses_apos: number;
  ajuste: Ajuste;
  meta_dias_antes: number;
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const tempo = (d: string) => Date.parse(`${d}T00:00:00Z`);

function diaUtil(d: string, feriados: Set<string>) {
  const semana = new Date(tempo(d)).getUTCDay();
  return semana !== 0 && semana !== 6 && !feriados.has(d);
}

function somar(d: string, dias: number) {
  return iso(tempo(d) + dias * 86_400_000);
}

export function ajustarDiaUtil(d: string, modo: Ajuste, feriados: Set<string>) {
  if (modo === "nenhum") return d;
  while (!diaUtil(d, feriados)) d = somar(d, modo === "antecipa" ? -1 : 1);
  return d;
}

// Competência "AAAA-MM-01" → vencimento legal.
export function prazoLegal(r: RegraObrigacao, competencia: string, feriados: Set<string>) {
  const [a, m] = competencia.split("-").map(Number);
  const mes = m - 1 + r.meses_apos;
  const ultimo = new Date(Date.UTC(a, mes + 1, 0)).getUTCDate();
  const d = iso(Date.UTC(a, mes, Math.min(r.dia_vencimento, ultimo)));
  return ajustarDiaUtil(d, r.ajuste, feriados);
}

export function prazoMeta(r: RegraObrigacao, legal: string, feriados: Set<string>) {
  return ajustarDiaUtil(somar(legal, -r.meta_dias_antes), "antecipa", feriados);
}

// Trimestrais nas competências 03, 06, 09 e 12; anuais na 12 (ano-base).
export function geraNaCompetencia(p: Periodicidade, mes: number) {
  return p === "mensal" || (p === "trimestral" ? mes % 3 === 0 : mes === 12);
}

// Próximos vencimentos a partir de hoje (inclusive), com a competência de origem.
export function proximosVencimentos(r: RegraObrigacao, hoje: string, feriados: Set<string>, quantos = 1) {
  const [a, m] = hoje.split("-").map(Number);
  const lista: { competencia: string; legal: string; meta: string }[] = [];
  for (let i = -14; i <= 60 && lista.length < quantos; i++) {
    const comp = iso(Date.UTC(a, m - 1 + i, 1));
    if (!geraNaCompetencia(r.periodicidade, Number(comp.slice(5, 7)))) continue;
    const legal = prazoLegal(r, comp, feriados);
    if (legal >= hoje) lista.push({ competencia: comp, legal, meta: prazoMeta(r, legal, feriados) });
  }
  return lista;
}

// ---------------------------------------------------------------------------
// Textos

export const rotulosPeriodicidade: Record<Periodicidade, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

export const rotulosAjuste: Record<Ajuste, string> = {
  antecipa: "Antecipa para o dia útil anterior",
  posterga: "Posterga para o próximo dia útil",
  nenhum: "Mantém a data, mesmo sem dia útil",
};

export const rotulosRegime: Record<RegimeObrigacao, string> = {
  simples: "Simples",
  presumido: "Presumido",
  real: "Real",
  mei: "MEI",
};

// Ex.: "Dia 20 do mês seguinte à competência" ou "Dia 31 de março do ano seguinte ao ano-base".
export function descreverVencimento(r: RegraObrigacao) {
  const dia = r.dia_vencimento >= 31 ? "Último dia" : `Dia ${r.dia_vencimento}`;
  if (r.periodicidade === "anual") {
    const mes = (11 + r.meses_apos) % 12;
    const ano = r.meses_apos === 0 ? "do próprio ano-base" : r.meses_apos <= 12 ? "do ano seguinte ao ano-base" : "";
    return `${dia} de ${MESES[mes]} ${ano}`.trim();
  }
  const base = r.periodicidade === "trimestral" ? "ao fim do trimestre" : "à competência";
  if (r.meses_apos === 0) {
    return `${dia} do próprio mês ${r.periodicidade === "trimestral" ? "de fim do trimestre" : "da competência"}`;
  }
  if (r.meses_apos === 1) return `${dia} do mês seguinte ${base}`;
  return `${dia} do ${r.meses_apos}º mês após ${r.periodicidade === "trimestral" ? "o fim do trimestre" : "a competência"}`;
}

export function descreverMeta(dias: number) {
  if (dias === 0) return "No próprio prazo legal";
  return `${dias} ${dias === 1 ? "dia" : "dias"} antes do prazo legal`;
}
