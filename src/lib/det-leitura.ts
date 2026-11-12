import ExcelJS from "exceljs";

// Leitura da planilha de empresas do Robô do DET (Fechamento Mensal ou outra):
// em cada aba, acha o cabeçalho com a coluna de CNPJ/CPF e lê AP, Empresa e
// documento. Sem dependência de servidor (testável isolado).

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

function cnpjValido(d: string) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string, pesos: number[]) => {
    const s = pesos.reduce((t, p, i) => t + Number(base[i]) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return dv(d, p1) === Number(d[12]) && dv(d, [6, ...p1]) === Number(d[13]);
}

function cpfValido(d: string) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    const s = [...d.slice(0, n)].reduce((t, c, i) => t + Number(c) * (n + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

// Documento da célula → só dígitos. Número no Excel perde o zero à esquerda:
// tenta completar como CNPJ (14) e depois como CPF (11).
function documentoDaCelula(celula: ExcelJS.Cell): { digitos: string; problema: string | null } {
  let d = celula.text.replace(/\D/g, "");
  if (!d) return { digitos: "", problema: "Sem CNPJ/CPF na planilha" };
  if (celula.type === ExcelJS.ValueType.Number && d.length < 14) {
    if (cnpjValido(d.padStart(14, "0"))) d = d.padStart(14, "0");
    else if (d.length < 11 && cpfValido(d.padStart(11, "0"))) d = d.padStart(11, "0");
  }
  if (d.length === 14) return { digitos: d, problema: cnpjValido(d) ? null : "CNPJ inválido (dígitos verificadores não conferem)" };
  if (d.length === 11) return { digitos: d, problema: cpfValido(d) ? null : "CPF inválido (dígitos verificadores não conferem)" };
  return { digitos: d, problema: "CNPJ incompleto na planilha (faltam dígitos)" };
}

export type Linha = { aba_origem: string; codigo: string | null; empresa: string; documento: string; problema: string | null };

// Em cada aba, acha a linha de cabeçalho (até a 15ª) com a coluna de CNPJ.
export function lerAbas(livro: ExcelJS.Workbook) {
  const linhas: Linha[] = [];
  for (const aba of livro.worksheets) {
    let cab = 0;
    const col = { doc: 0, empresa: 0, codigo: 0 };
    for (let r = 1; r <= Math.min(15, aba.rowCount) && !cab; r++) {
      aba.getRow(r).eachCell((c, i) => {
        const t = normalizar(c.text);
        if (!col.doc && /(cnpj|cpf|documento|inscricao)/.test(t)) col.doc = i;
        if (!col.empresa && /(empresa|razao|cliente|nome)/.test(t)) col.empresa = i;
        if (!col.codigo && (t === "ap" || /^(codigo|cod\.?|cod dominio)/.test(t))) col.codigo = i;
      });
      if (col.doc) cab = r;
      else Object.assign(col, { empresa: 0, codigo: 0 });
    }
    if (!cab) continue; // aba sem coluna de CNPJ (ex.: resumo)

    for (let r = cab + 1; r <= aba.rowCount; r++) {
      const row = aba.getRow(r);
      const empresa = col.empresa ? row.getCell(col.empresa).text.trim() : "";
      const docCel = row.getCell(col.doc);
      if (!empresa && !docCel.text.trim()) continue; // linha vazia
      const { digitos, problema } = documentoDaCelula(docCel);
      linhas.push({
        aba_origem: aba.name.slice(0, 60),
        codigo: col.codigo ? row.getCell(col.codigo).text.trim().slice(0, 20) || null : null,
        empresa: (empresa || "(sem nome)").slice(0, 200),
        documento: digitos.slice(0, 20),
        problema,
      });
    }
  }
  return linhas;
}

