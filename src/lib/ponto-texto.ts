import type { Linha } from "@/lib/ponto-pdf";
import type { DiaPonto, DiaSemana, JornadaDia, TotalOrigem } from "@/lib/ponto-regras";

// Leitor SEM IA para fichas em PDF com texto (gerado por sistema ou digitado):
// Secullum ("01/08/2026 - Sáb"), cartão digitado ("SÁB 01.08") e a Folha de
// Ponto da Domínio ("01/05 Sex"). Usa a posição dos textos na página para
// separar as colunas de marcação das de totais. Página que ele não reconhece
// (escaneada, foto, outro layout) vai para a IA.

export type PaginaLida = {
  empresa: string | null;
  documento_empresa: string | null;
  competencia: string | null;
  fichas: {
    nome: string;
    cpf: string | null;
    cargo: string | null;
    admissao: string | null;
    jornada: JornadaDia[];
    dias: DiaPonto[];
    totais_origem: TotalOrigem[];
    observacoes: string | null;
  }[];
};

const MESES = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const pad = (n: number | string) => String(n).padStart(2, "0");

const DIA_ABREV: Record<string, DiaSemana> = { SEG: "seg", TER: "ter", QUA: "qua", QUI: "qui", SEX: "sex", SAB: "sab", DOM: "dom" };
const DIA_EXTENSO: Record<string, DiaSemana> = { SEGUNDA: "seg", TERCA: "ter", QUARTA: "qua", QUINTA: "qui", SEXTA: "sex", SABADO: "sab", DOMINGO: "dom" };
const ORDEM: DiaSemana[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

// Começo de uma linha de dia, nos três formatos.
const DATA_COMPLETA = /^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*[A-Za-zÁá]{3}\b/; // 01/08/2026 - Sáb
const DATA_PONTO = /^(SEG|TER|QUA|QUI|SEX|S[AÁ]B|DOM)\s+(\d{2})[./](\d{2})\b/i; // SÁB 01.08
const DATA_BARRA = /^(\d{2})\/(\d{2})\s+(SEG|TER|QUA|QUI|SEX|S[AÁ]B|DOM)\b/i; // 01/05 Sex

const HORA = /^(\d{1,2}):(\d{2})(\*?)$/;
const FIM_MARCACOES = /^(NORMAIS|HORAS|RUBRICA|HORA\s*EXTRA|FALTAS|TOTAL|OBS)/i;

function competenciaDaPagina(texto: string, informada: string | null): string | null {
  const periodo = /Per[ií]odo:\s*\d{2}\/(\d{2})\/(\d{4})/i.exec(texto);
  if (periodo) return `${periodo[2]}-${periodo[1]}`;
  const t = semAcento(texto);
  const mesAno = /\((JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)-(\d{4})\)/.exec(t);
  if (mesAno) return `${mesAno[2]}-${pad(MESES.indexOf(mesAno[1]) + 1)}`;
  const mes = /M[EÊ]S:\s*(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)/.exec(t);
  if (mes) {
    const ano = informada?.slice(0, 4) ?? String(new Date().getFullYear());
    return `${ano}-${pad(MESES.indexOf(mes[1]) + 1)}`;
  }
  return informada;
}

// Valor depois de um rótulo ("NOME: Fulano") ou na linha de baixo (rótulo sozinho).
function valorDoRotulo(linhas: Linha[], rotulo: RegExp, desde = 0): { valor: string; indice: number } | null {
  for (let i = desde; i < linhas.length; i++) {
    const m = rotulo.exec(linhas[i].texto);
    if (!m) continue;
    const resto = linhas[i].texto.slice(m.index + m[0].length).trim();
    const valor = resto.split(/\s+(?:\||EMPRESA:|CPF\/CEI:|CPF:|M[EÊ]S:|N[º°]\s*FOLHA:)/i)[0].trim();
    if (valor && !/^[A-ZÇÃÉÍÓÚ./ ]+:$/i.test(valor)) return { valor, indice: i };
    // Rótulo sozinho: o valor é a próxima linha que não é só rótulos.
    const prox = linhas.slice(i + 1, i + 4).find((l) => !/:\s*$/.test(l.texto) && !/^[A-ZÇÃÉÍÓÚ.\s/]+:/.test(l.texto));
    if (prox) return { valor: prox.texto.trim(), indice: i };
  }
  return null;
}

function jornadaDaPagina(linhas: Linha[], ehLinhaDeDia: (l: Linha) => boolean): JornadaDia[] {
  const jornada = new Map<DiaSemana, JornadaDia>();
  const vazio = (dia: DiaSemana): JornadaDia => ({ dia, entrada: null, saida: null, intervalo_inicio: null, intervalo_fim: null, carga: null });
  for (const l of linhas) {
    if (ehLinhaDeDia(l)) continue;
    const t = semAcento(l.texto);
    // Secullum: "SEG 09:00" (carga diária)
    for (const m of t.matchAll(/\b(SEG|TER|QUA|QUI|SEX|SAB|DOM)\s+(\d{2}:\d{2})\b/g)) {
      jornada.set(DIA_ABREV[m[1]], { ...vazio(DIA_ABREV[m[1]]), carga: m[2] });
    }
    // Domínio: "Segunda 09:00 às 19:00 13:00 às 14:00" ou "Segunda à Sexta 10:00 às 16:00 ..."
    const m = /^(SEGUNDA|TERCA|QUARTA|QUINTA|SEXTA|SABADO|DOMINGO)(?:\s+A\s+(SEGUNDA|TERCA|QUARTA|QUINTA|SEXTA|SABADO|DOMINGO))?\s+(\d{2}:\d{2})\s+AS\s+(\d{2}:\d{2})(?:\s+(\d{2}:\d{2})\s+AS\s+(\d{2}:\d{2}))?/.exec(t);
    if (m) {
      const de = ORDEM.indexOf(DIA_EXTENSO[m[1]]);
      const ate = m[2] ? ORDEM.indexOf(DIA_EXTENSO[m[2]]) : de;
      for (let i = de; i <= ate; i++) {
        jornada.set(ORDEM[i], { dia: ORDEM[i], entrada: m[3], saida: m[4], intervalo_inicio: m[5] ?? null, intervalo_fim: m[6] ?? null, carga: null });
      }
    }
  }
  // Com jornada informada, os dias que faltam são folga.
  if (jornada.size) for (const d of ORDEM) if (!jornada.has(d)) jornada.set(d, { ...vazio(d), carga: "00:00" });
  return ORDEM.filter((d) => jornada.has(d)).map((d) => jornada.get(d)!);
}

export function lerPaginaSemIa(linhas: Linha[], competenciaInformada: string | null): PaginaLida | null {
  const texto = linhas.map((l) => l.texto).join("\n");
  const competencia = competenciaDaPagina(texto, competenciaInformada);
  const ano = competencia?.slice(0, 4) ?? String(new Date().getFullYear());

  const dataDaLinha = (l: Linha): { data: string; resto: number } | null => {
    let m = DATA_COMPLETA.exec(l.texto);
    if (m) return { data: `${m[3]}-${m[2]}-${m[1]}`, resto: m[0].length };
    m = DATA_PONTO.exec(l.texto);
    if (m) return { data: `${ano}-${m[3]}-${m[2]}`, resto: m[0].length };
    m = DATA_BARRA.exec(l.texto);
    if (m) return { data: `${ano}-${m[2]}-${m[1]}`, resto: m[0].length };
    return null;
  };
  const linhasDeDia = linhas.filter((l) => dataDaLinha(l));
  if (linhasDeDia.length < 7) return null; // não é uma ficha que este leitor conhece

  // Cabeçalho da tabela: onde começam as marcações e onde começam os totais.
  const cabecalho = linhas.find((l) => /\bENTRADA\b/i.test(l.texto) && l.y > linhasDeDia[0].y);
  const inicioEntrada = cabecalho?.pedacos.find((p) => /ENTRADA/i.test(p.texto));
  const fim = cabecalho?.pedacos.find((p) => inicioEntrada && p.x > inicioEntrada.x && FIM_MARCACOES.test(p.texto));
  const xFim = fim ? fim.x - 2 : Infinity;
  const colunasTotais = cabecalho ? cabecalho.pedacos.filter((p) => p.x >= xFim - 2).flatMap((p) => p.texto.split(/\s+/).map((t) => ({ rotulo: t, x: p.x }))) : [];

  // Dias. Linha sem data mas com horários (texto desalinhado no PDF) vai para
  // o dia mais próximo na altura.
  const dias = new Map<string, DiaPonto & { y: number }>();
  const orfas: Linha[] = [];
  const tokensDaLinha = (l: Linha, aPartirDe: number) => {
    const tokens: string[] = [];
    let usado = 0;
    for (const p of l.pedacos) {
      if (p.x >= xFim) continue;
      const ini = usado;
      usado += p.texto.length + 1;
      const t = ini < aPartirDe ? p.texto.slice(Math.max(0, aPartirDe - ini)) : p.texto;
      tokens.push(...t.split(/\s+/).filter(Boolean));
    }
    return tokens;
  };
  const aplicar = (dia: DiaPonto, tokens: string[]) => {
    const ocorr: string[] = [];
    for (const tk of tokens) {
      const h = HORA.exec(tk);
      if (h) dia.marcacoes.push({ hora: `${pad(h[1])}:${h[2]}`, manual: h[3] === "*" });
      else if (/^[—–-]+$/.test(tk) || /^(SEG|TER|QUA|QUI|SEX|S[AÁ]B|DOM)$/i.test(tk)) continue;
      else if (/[A-ZÁÉÍÓÚÇ]/i.test(tk) && !ocorr.includes(tk.toUpperCase())) ocorr.push(tk.toUpperCase());
    }
    if (ocorr.length) dia.ocorrencia = [dia.ocorrencia, ...ocorr].filter(Boolean).join(" ").slice(0, 60);
  };
  for (const l of linhas) {
    const d = dataDaLinha(l);
    if (d) {
      const dia: DiaPonto & { y: number } = { data: d.data, marcacoes: [], ocorrencia: null, observacao: null, duvida: null, y: l.y };
      aplicar(dia, tokensDaLinha(l, d.resto));
      if (!dias.has(d.data)) dias.set(d.data, dia);
    } else if (l.y < linhasDeDia[0].y + 3 && l.y > linhasDeDia[linhasDeDia.length - 1].y - 3 && /\d{1,2}:\d{2}/.test(l.texto) && !/^TOTA/i.test(l.texto)) {
      orfas.push(l);
    }
  }
  for (const o of orfas) {
    const alvo = [...dias.values()].reduce((a, b) => (Math.abs(b.y - o.y) < Math.abs(a.y - o.y) ? b : a));
    aplicar(alvo, tokensDaLinha(o, 0));
  }
  const listaDias: DiaPonto[] = [...dias.values()].sort((a, b) => a.data.localeCompare(b.data)).map((d) => ({ data: d.data, marcacoes: d.marcacoes, ocorrencia: d.ocorrencia, observacao: d.observacao, duvida: d.duvida }));

  // Observações de rodapé: "ATESTADO — DIA 14.08: 08:40 às 10:40".
  const observacoes: string[] = [];
  for (const l of linhas) {
    const m = /DIA\s+(\d{2})[./](\d{2})/i.exec(l.texto);
    if (m && !dataDaLinha(l)) {
      observacoes.push(l.texto);
      const dia = listaDias.find((d) => d.data.endsWith(`-${m[2]}-${m[1]}`));
      if (dia) dia.observacao = l.texto;
    }
  }

  // Ficha em branco (só o modelo impresso): nenhuma marcação nem ocorrência.
  if (!listaDias.some((d) => d.marcacoes.length || d.ocorrencia)) {
    return { empresa: null, documento_empresa: null, competencia, fichas: [] };
  }

  // Funcionário e empresa.
  const blocoEmpregado = linhas.findIndex((l) => /DADOS DO EMPREGADO\b/i.test(l.texto));
  const nomeBruto = valorDoRotulo(linhas, /\bNOME:\s*/i, Math.max(0, blocoEmpregado))?.valor ?? "";
  const nome = nomeBruto.replace(/^\d+\s*-\s*/, "").replace(/\s*\|.*$/, "").trim();
  const empresa =
    (blocoEmpregado > 0 ? valorDoRotulo(linhas, /\bNOME:\s*/i)?.valor : valorDoRotulo(linhas, /\bEMPRESA:\s*/i)?.valor)?.replace(/\s*CPF\/CEI:.*$/i, "").trim() ?? null;
  const cnpj = /\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/.exec(texto)?.[1] ?? null;
  const linhaCpf = linhas.find((l) => /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(l.texto));
  const cpf = linhaCpf ? /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/.exec(linhaCpf.texto)![1].replace(/\D/g, "") : null;
  const adm = linhaCpf ? /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(linhaCpf.texto) : null;
  const cargo = valorDoRotulo(linhas, /\bCargo:\s*/i)?.valor ?? null;

  // Totais impressos pelo sistema (linha TOTAIS), por coluna.
  const totais: TotalOrigem[] = [];
  const linhaTotais = linhas.find((l) => /^TOTAIS\b/i.test(l.texto));
  if (linhaTotais) {
    for (const p of linhaTotais.pedacos.filter((x) => /-?\d+:\d{2}/.test(x.texto))) {
      for (const valor of p.texto.split(/\s+/).filter((t) => /-?\d+:\d{2}/.test(t))) {
        const col = colunasTotais.reduce<{ rotulo: string; x: number } | null>((a, c) => (!a || Math.abs(c.x - p.x) < Math.abs(a.x - p.x) ? c : a), null);
        totais.push({ rotulo: col?.rotulo ?? `Total ${totais.length + 1}`, valor });
      }
    }
  }

  if (!nome) return null;
  return {
    empresa,
    documento_empresa: cnpj?.replace(/\D/g, "") ?? null,
    competencia,
    fichas: [
      {
        nome,
        cpf,
        cargo,
        admissao: adm ? `${adm[3]}-${adm[2]}-${adm[1]}` : null,
        jornada: jornadaDaPagina(linhas, (l) => Boolean(dataDaLinha(l))),
        dias: listaDias,
        totais_origem: totais,
        observacoes: observacoes.join("\n") || null,
      },
    ],
  };
}
