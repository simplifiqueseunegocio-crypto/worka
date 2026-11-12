// Regras da ficha ponto que valem no servidor e na tela de conferência (sem
// dependências de servidor). A IA só transcreve; o que é conferido e calculado
// sai daqui.

export type Marcacao = { hora: string; manual: boolean };

export type DiaPonto = {
  data: string; // AAAA-MM-DD
  marcacoes: Marcacao[];
  ocorrencia: string | null; // FÉRIAS, AT/MED, ABONO, FOLGA... como veio na ficha
  observacao: string | null;
  duvida: string | null; // o que a leitura achou incerto
};

export type DiaSemana = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export type JornadaDia = {
  dia: DiaSemana;
  entrada: string | null;
  saida: string | null;
  intervalo_inicio: string | null;
  intervalo_fim: string | null;
  carga: string | null; // "09:00" quando a ficha traz só a carga diária
};

export type TotalOrigem = { rotulo: string; valor: string };

export type Alerta = { tipo: "erro" | "aviso"; texto: string };

export const DIAS_SEMANA: DiaSemana[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
export const NOME_DIA: Record<DiaSemana, string> = {
  dom: "Dom",
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
  sab: "Sáb",
};

const HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const horaValida = (h: string) => HORA.test(h.trim());

// "07:05" → 425 (minutos); inválida → null.
export function minutos(h: string | null | undefined): number | null {
  const m = HORA.exec((h ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 425 → "07:05"; negativo vira "-00:30".
export function hhmm(min: number): string {
  const s = min < 0 ? "-" : "";
  const a = Math.abs(Math.round(min));
  return `${s}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

export const diaDaSemana = (data: string): DiaSemana => DIAS_SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()];

// Minutos previstos no dia pela jornada da ficha (null = a ficha não informa).
export function previstoNoDia(jornada: JornadaDia[], data: string): number | null {
  const j = jornada.find((x) => x.dia === diaDaSemana(data));
  if (!j) return jornada.length ? 0 : null;
  const carga = minutos(j.carga);
  if (carga !== null) return carga;
  const e = minutos(j.entrada);
  const s = minutos(j.saida);
  if (e === null || s === null) return null;
  const ii = minutos(j.intervalo_inicio);
  const fi = minutos(j.intervalo_fim);
  const total = (s < e ? s + 1440 : s) - e;
  return total - (ii !== null && fi !== null ? Math.max(0, fi - ii) : 0);
}

// Minutos trabalhados: soma dos pares (entrada, saída). Saída menor que a
// entrada passa da meia-noite. Par incompleto não conta.
// Minutos entre entrada e saída. Saída menor que a entrada só vale como virada
// da meia-noite (turno da noite) se o trecho tiver até 12h; senão é erro de
// marcação (ex.: 15:00 → 13:20) e não conta.
export const VIRADA_MAXIMA = 12 * 60;
function trecho(entrada: number, saida: number): number | null {
  if (saida >= entrada) return saida - entrada;
  const virada = saida + 1440 - entrada;
  return virada <= VIRADA_MAXIMA ? virada : null;
}

export function trabalhadoNoDia(dia: Pick<DiaPonto, "marcacoes">): number {
  const h = dia.marcacoes.map((m) => minutos(m.hora)).filter((x): x is number => x !== null);
  let total = 0;
  for (let i = 0; i + 1 < h.length; i += 2) total += trecho(h[i], h[i + 1]) ?? 0;
  return total;
}

// Alertas de um dia para a conferência.
export function alertasDoDia(dia: DiaPonto, jornada: JornadaDia[], competencia: string | null): Alerta[] {
  const alertas: Alerta[] = [];
  if (competencia && !dia.data.startsWith(competencia.slice(0, 7))) alertas.push({ tipo: "erro", texto: "Data fora do mês" });
  const invalidas = dia.marcacoes.filter((m) => !horaValida(m.hora));
  if (invalidas.length) alertas.push({ tipo: "erro", texto: `Horário inválido: ${invalidas.map((m) => m.hora || "vazio").join(", ")}` });
  const qtd = dia.marcacoes.length;
  if (qtd % 2 === 1) alertas.push({ tipo: "erro", texto: "Número ímpar de marcações (falta entrada ou saída)" });
  const h = dia.marcacoes.map((m) => minutos(m.hora));
  for (let i = 1; i < h.length; i++) {
    const a = h[i - 1];
    const b = h[i];
    // Só a última pode passar da meia-noite.
    if (a !== null && b !== null && b < a && (i < h.length - 1 || (i % 2 === 1 && trecho(a, b) === null))) {
      alertas.push({ tipo: "erro", texto: "Horários fora de ordem" });
      break;
    }
  }
  const previsto = previstoNoDia(jornada, dia.data);
  if (!qtd && !dia.ocorrencia && previsto) alertas.push({ tipo: "erro", texto: "Dia de trabalho sem marcação nem ocorrência" });
  if (dia.marcacoes.some((m) => m.manual)) alertas.push({ tipo: "aviso", texto: "Batida lançada manualmente" });
  // Marcação idêntica ao horário da jornada: na ficha escrita à mão ou
  // escaneada, a leitura pode ter "arredondado" (18:09 lido como 18:00).
  const j = jornada.find((x) => x.dia === diaDaSemana(dia.data));
  if (j) {
    const contratuais = new Set([j.entrada, j.saida, j.intervalo_inicio, j.intervalo_fim].filter(Boolean).map((h) => minutos(h)));
    const iguais = dia.marcacoes.filter((m) => contratuais.has(minutos(m.hora)) && minutos(m.hora) !== null);
    if (iguais.length) {
      alertas.push({ tipo: "aviso", texto: `${iguais.map((m) => m.hora).join(", ")} igual ao horário da jornada: confira os minutos no original` });
    }
  }
  if (dia.duvida) alertas.push({ tipo: "erro", texto: `Leitura incerta: ${dia.duvida}` });
  return alertas;
}

export function resumoFicha(dias: DiaPonto[], jornada: JornadaDia[], competencia: string | null) {
  let trabalhado = 0;
  let previsto = 0;
  let semPrevisto = false;
  let erros = 0;
  let avisos = 0;
  for (const d of dias) {
    trabalhado += trabalhadoNoDia(d);
    const p = previstoNoDia(jornada, d.data);
    if (p === null) semPrevisto = true;
    else if (!d.ocorrencia) previsto += p;
    for (const a of alertasDoDia(d, jornada, competencia)) {
      if (a.tipo === "erro") erros++;
      else avisos++;
    }
  }
  return { trabalhado, previsto: semPrevisto ? null : previsto, erros, avisos };
}

// Nome para comparar: sem acento, maiúsculo, espaços simples.
export const nomeComparavel = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
