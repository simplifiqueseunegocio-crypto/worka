import { z } from "zod";

// Tipos de documento do pipeline de leitura. Cada tipo é:
//   - o formato da extração (schema zod) e as instruções para a IA;
//   - os campos da tela de conferência;
//   - as regras de validação (alertas);
//   - como o item aparece na lista (título e resumo).
// O que a confirmação grava fica no servidor (documentos/confirmar.ts).
// Sem dependências de servidor: a tela de conferência usa o mesmo arquivo.
//
// Tipo novo: definição aqui, regra de acesso em pode_documento (migration) e
// a ação de confirmação em confirmar.ts.

export type Alerta = { tipo: "erro" | "aviso"; texto: string };

export type Campo = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "data" | "mes" | "numero" | "moeda" | "hora" | "cpf" | "documento" | "opcao" | "texto_longo";
  opcoes?: { valor: string; rotulo: string }[];
  largura?: "inteira" | "meia" | "terco";
  // Mostra o campo só quando a condição vale (ex.: dias só no atestado de dias).
  quando?: (d: Dados) => boolean;
};

export type Dados = Record<string, string | number | null>;

// O que as regras sabem além do item: a data de hoje e o CPF/CNPJ do cliente
// da leitura (para apontar documento que não é dele).
export type ContextoValidacao = { hoje: string; clienteDocumento?: string | null };

export type TipoDocumento = {
  chave: string;
  titulo: string; // "Leitor de atestados"
  item: { singular: string; plural: string }; // "atestado", "atestados"
  departamento: string;
  // Departamentos que usam a leitura, além de gestores e admins.
  // Igual à função pode_documento do banco.
  departamentos: string[];
  descricao: string;
  aceita: string; // texto do envio
  schemaItem: z.ZodObject;
  instrucoes: string;
  campos: Campo[];
  validar: (d: Dados, ctx: ContextoValidacao) => Alerta[];
  tituloItem: (d: Dados) => string;
  resumoItem: (d: Dados) => string;
  // Funcionário do item (para ligar ao cadastro), quando o tipo tem um.
  funcionario?: (d: Dados) => { nome: string; cpf: string | null } | null;
  // Ajustes depois da extração (formatos, dados que não devem ser guardados).
  normalizar?: (d: Dados) => Dados;
  // Uma imagem por pedido à IA (cada foto é um documento) ou páginas juntas.
  imagemPorPedido?: boolean;
  // O mesmo documento lido duas vezes na leitura (ex.: nota em duas páginas)
  // vira um item só.
  chaveUnica?: (d: Dados) => string | null;
};

// ---------------------------------------------------------------------------
// Utilidades

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;
export const dataBR = (iso: string | number | null | undefined) =>
  typeof iso === "string" && DATA.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
export const mesBR = (m: string | number | null | undefined) => (typeof m === "string" && MES.test(m) ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : "");
export const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

export function cpfValido(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(cnpj: string) {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    let peso = n - 7;
    for (let i = 0; i < n; i++) {
      s += Number(d[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export const digitos = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : typeof v === "number" ? String(v) : "");
// CPF (11) ou CNPJ (14) com dígitos certos.
export const documentoValido = (v: unknown) => {
  const d = digitos(v);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
};
// Mesma empresa (matriz e filiais têm a mesma raiz de 8 dígitos).
export const mesmaEmpresa = (a: unknown, b: unknown) => {
  const x = digitos(a);
  const y = digitos(b);
  if (!x || !y) return false;
  if (x.length === 14 && y.length === 14) return x.slice(0, 8) === y.slice(0, 8);
  return x === y;
};
export const documentoBR = (v: unknown) => {
  const d = digitos(v);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
};

// Valor em reais: aceita número ou texto "1.234,56".
export const valor = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.replace(/[R$\s]/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const moedaBR = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const real = (v: unknown) => {
  const n = valor(v);
  return n === null ? "" : moedaBR.format(n);
};
// Diferença tolerável de arredondamento (1 centavo por parcela somada).
const bate = (a: number, b: number, tolerancia = 0.05) => Math.abs(a - b) <= tolerancia;

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// Mês "AAAA-MM" (aceita "AAAA-MM-DD" e "MM/AAAA").
const mes = (v: unknown) => {
  const s = texto(v);
  const iso = s.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}`;
  const br = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[2]}-${br[1].padStart(2, "0")}`;
  return s || null;
};
const mesDe = (iso: string) => iso.slice(0, 7);

// --- Código de barras (FEBRABAN) -------------------------------------------
// Boleto bancário: 44 dígitos no código, 47 na linha digitável.
// Arrecadação (DAS, DARF, GPS, FGTS, tributos, concessionárias): começa com 8;
// 44 no código, 48 na linha (4 blocos de 11 + dígito).

const mod10 = (s: string) => {
  let soma = 0;
  let peso = 2;
  for (let i = s.length - 1; i >= 0; i--) {
    const p = Number(s[i]) * peso;
    soma += p > 9 ? p - 9 : p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
};
const resto11 = (s: string) => {
  let soma = 0;
  let peso = 2;
  for (let i = s.length - 1; i >= 0; i--) {
    soma += Number(s[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  return soma % 11;
};
const dvArrecadacao11 = (s: string) => {
  const dv = 11 - resto11(s);
  return dv >= 10 ? 0 : dv;
};
const dvBoleto = (s: string) => {
  const dv = 11 - resto11(s);
  return dv >= 10 ? 1 : dv;
};
// Identificador de valor da arrecadação: 6/7 módulo 10, 8/9 módulo 11.
const dvDoBloco = (barra: string) => (barra[2] === "6" || barra[2] === "7" ? mod10 : dvArrecadacao11);

function barraValida(b: string) {
  if (!/^\d{44}$/.test(b)) return false;
  if (b[0] === "8") return dvDoBloco(b)(b.slice(0, 3) + b.slice(4)) === Number(b[3]);
  return dvBoleto(b.slice(0, 4) + b.slice(5)) === Number(b[4]);
}

// Código de barras (44 dígitos) a partir do código ou da linha digitável,
// e se os dígitos verificadores batem.
export function lerCodigoBarras(entrada: unknown): { barra: string; valido: boolean } | null {
  const l = digitos(entrada);
  if (!l) return null;
  if (l.length === 44) return { barra: l, valido: barraValida(l) };
  if (l.length === 48 && l[0] === "8") {
    const blocos = [0, 1, 2, 3].map((i) => l.slice(i * 12, i * 12 + 12));
    const barra = blocos.map((b) => b.slice(0, 11)).join("");
    const dv = dvDoBloco(barra);
    return { barra, valido: blocos.every((b) => dv(b.slice(0, 11)) === Number(b[11])) && barraValida(barra) };
  }
  if (l.length === 47) {
    const campos = mod10(l.slice(0, 9)) === Number(l[9]) && mod10(l.slice(10, 20)) === Number(l[20]) && mod10(l.slice(21, 31)) === Number(l[31]);
    const barra = l.slice(0, 4) + l[32] + l.slice(33, 47) + l.slice(4, 9) + l.slice(10, 20) + l.slice(21, 31);
    return { barra, valido: campos && barraValida(barra) };
  }
  return { barra: l, valido: false };
}

// Valor gravado no código (null quando o código não traz valor fixo).
export function valorDoCodigo(barra: string): number | null {
  if (!/^\d{44}$/.test(barra)) return null;
  if (barra[0] === "8") return barra[2] === "6" || barra[2] === "8" ? Number(barra.slice(4, 15)) / 100 || null : null;
  return Number(barra.slice(9, 19)) / 100 || null;
}

// Alertas comuns do código de barras.
function alertasCodigo(codigo: unknown, total: number | null, rotuloTotal: string, rigido: boolean): Alerta[] {
  const c = lerCodigoBarras(codigo);
  if (!c) return [];
  if (!c.valido) return [{ tipo: "erro", texto: "Código de barras inválido: confira os dígitos com o original" }];
  const v = valorDoCodigo(c.barra);
  if (v !== null && total !== null && !bate(v, total, 0.009)) {
    return [{ tipo: rigido ? "erro" : "aviso", texto: `O código de barras é de ${real(v)}, diferente do ${rotuloTotal} (${real(total)})` }];
  }
  return [];
}

// Documento que não é do cliente da leitura.
function alertaCliente(ctx: ContextoValidacao, docs: unknown[], texto: string): Alerta[] {
  if (!ctx.clienteDocumento) return [];
  const presentes = docs.filter((d) => digitos(d));
  if (!presentes.length || presentes.some((d) => mesmaEmpresa(d, ctx.clienteDocumento))) return [];
  return [{ tipo: "aviso", texto }];
}

const alertaDocumento = (v: unknown, rotulo: string, obrigatorio: boolean): Alerta[] => {
  if (!digitos(v)) return obrigatorio ? [{ tipo: "erro", texto: `Falta o CPF/CNPJ do ${rotulo}` }] : [];
  return documentoValido(v) ? [] : [{ tipo: "erro", texto: `CPF/CNPJ do ${rotulo} inválido` }];
};

// ---------------------------------------------------------------------------
// Atestado médico / declaração de comparecimento (Departamento Pessoal)

const atestado: TipoDocumento = {
  chave: "atestado",
  titulo: "Leitor de atestados",
  item: { singular: "atestado", plural: "atestados" },
  departamento: "Pessoal",
  departamentos: ["Pessoal"],
  descricao:
    "Envie as fotos ou PDFs dos atestados de um cliente. A IA lê funcionário, datas, dias de afastamento, médico e CRM; o DP confere e confirma, e o afastamento fica lançado. CID e diagnóstico não são lidos nem guardados.",
  aceita: "Fotos ou PDFs de atestados e declarações de comparecimento",
  imagemPorPedido: true,
  schemaItem: z.object({
    funcionario_nome: z.string(),
    funcionario_cpf: z.string().nullable(),
    tipo_afastamento: z.enum(["dias", "horas"]),
    data_emissao: z.string().nullable(),
    data_inicio: z.string().nullable(),
    dias: z.number().int().nullable(),
    hora_inicio: z.string().nullable(),
    hora_fim: z.string().nullable(),
    medico_nome: z.string().nullable(),
    crm: z.string().nullable(),
    estabelecimento: z.string().nullable(),
    observacao: z.string().nullable(),
    duvida: z.string().nullable(),
  }),
  instrucoes: `Você lê atestados médicos e declarações de comparecimento de funcionários de empresas brasileiras para o Departamento Pessoal de um escritório de contabilidade. O DP vai conferir depois: transcreva com fidelidade e marque o que for incerto.

Regras:
- Um item em "itens" para cada atestado ou declaração na imagem. Se não houver atestado, devolva "itens" vazia.
- NUNCA transcreva CID, código de doença, diagnóstico, sintomas ou exames, nem em "observacao". Esses dados não podem ser guardados.
- "funcionario_nome": o paciente, como escrito. "funcionario_cpf": só dígitos, se aparecer.
- "tipo_afastamento": "dias" para afastamento de um ou mais dias; "horas" para declaração de comparecimento ou atestado de algumas horas no mesmo dia.
- Datas em "AAAA-MM-DD". "data_emissao": data em que o documento foi assinado. "data_inicio": primeiro dia do afastamento (se não estiver escrito, a data de emissão).
- "dias": quantidade de dias de afastamento (por extenso ou número), só quando o tipo é "dias".
- "hora_inicio" e "hora_fim": "HH:MM", só quando o tipo é "horas".
- "medico_nome" e "crm": como escritos no carimbo (ex.: "123456/SP"). "estabelecimento": clínica ou hospital.
- "observacao": outra informação administrativa útil (ex.: "acompanhante de menor"); senão null.
- "duvida": quando algo estiver ilegível, rasurado ou incerto, explique em poucas palavras; senão null.`,
  campos: [
    { chave: "funcionario_nome", rotulo: "Funcionário", tipo: "texto", largura: "inteira" },
    { chave: "funcionario_cpf", rotulo: "CPF", tipo: "cpf", largura: "meia" },
    {
      chave: "tipo_afastamento",
      rotulo: "Tipo",
      tipo: "opcao",
      largura: "meia",
      opcoes: [
        { valor: "dias", rotulo: "Atestado de dias" },
        { valor: "horas", rotulo: "Comparecimento (horas)" },
      ],
    },
    { chave: "data_inicio", rotulo: "Início do afastamento", tipo: "data", largura: "meia" },
    { chave: "dias", rotulo: "Dias", tipo: "numero", largura: "meia", quando: (d) => d.tipo_afastamento !== "horas" },
    { chave: "hora_inicio", rotulo: "Das", tipo: "hora", largura: "terco", quando: (d) => d.tipo_afastamento === "horas" },
    { chave: "hora_fim", rotulo: "Às", tipo: "hora", largura: "terco", quando: (d) => d.tipo_afastamento === "horas" },
    { chave: "data_emissao", rotulo: "Emitido em", tipo: "data", largura: "meia" },
    { chave: "medico_nome", rotulo: "Médico", tipo: "texto", largura: "meia" },
    { chave: "crm", rotulo: "CRM", tipo: "texto", largura: "meia" },
    { chave: "estabelecimento", rotulo: "Clínica / hospital", tipo: "texto", largura: "inteira" },
    { chave: "observacao", rotulo: "Observação", tipo: "texto_longo", largura: "inteira" },
  ],
  validar: (d, { hoje }) => {
    const a: Alerta[] = [];
    const inicio = texto(d.data_inicio);
    const emissao = texto(d.data_emissao);
    if (!texto(d.funcionario_nome)) a.push({ tipo: "erro", texto: "Falta o nome do funcionário" });
    if (texto(d.funcionario_cpf) && !cpfValido(texto(d.funcionario_cpf))) a.push({ tipo: "erro", texto: "CPF inválido" });
    if (!DATA.test(inicio)) a.push({ tipo: "erro", texto: "Falta a data de início" });
    if (d.tipo_afastamento === "horas") {
      const hi = texto(d.hora_inicio);
      const hf = texto(d.hora_fim);
      if (!HORA.test(hi) || !HORA.test(hf)) a.push({ tipo: "erro", texto: "Falta o horário do comparecimento" });
      else if (hf <= hi) a.push({ tipo: "erro", texto: "Horário final antes do inicial" });
    } else {
      const dias = Number(d.dias);
      if (!dias || dias < 1) a.push({ tipo: "erro", texto: "Falta a quantidade de dias" });
      else if (dias > 15) a.push({ tipo: "aviso", texto: "Mais de 15 dias: a partir do 16º o afastamento é pago pelo INSS" });
    }
    if (!texto(d.crm)) a.push({ tipo: "erro", texto: "Sem CRM: o atestado pode não ser aceito" });
    if (DATA.test(inicio) && inicio > somarDias(hoje, 30)) a.push({ tipo: "aviso", texto: "Início mais de 30 dias no futuro" });
    if (DATA.test(emissao) && diasEntre(emissao, hoje) > 30) a.push({ tipo: "aviso", texto: "Atestado emitido há mais de 30 dias" });
    if (DATA.test(emissao) && DATA.test(inicio) && inicio < emissao) a.push({ tipo: "aviso", texto: "Início antes da emissão (atestado retroativo)" });
    if (d.duvida) a.push({ tipo: "erro", texto: `Leitura incerta: ${d.duvida}` });
    return a;
  },
  tituloItem: (d) => texto(d.funcionario_nome) || "Sem nome",
  resumoItem: (d) => {
    const inicio = dataBR(d.data_inicio);
    if (d.tipo_afastamento === "horas") return `${inicio || "sem data"} · ${d.hora_inicio ?? "?"} às ${d.hora_fim ?? "?"}`;
    const dias = Number(d.dias) || 0;
    const fim = dias && DATA.test(texto(d.data_inicio)) ? dataBR(somarDias(texto(d.data_inicio), dias - 1)) : "";
    return dias ? `${dias} ${dias === 1 ? "dia" : "dias"} · ${inicio}${fim && fim !== inicio ? ` a ${fim}` : ""}` : inicio || "sem data";
  },
  funcionario: (d) => (texto(d.funcionario_nome) ? { nome: texto(d.funcionario_nome), cpf: texto(d.funcionario_cpf).replace(/\D/g, "") || null } : null),
  normalizar: (d) => {
    // Rede de segurança da LGPD: tira qualquer CID que tenha escapado.
    const semCid = (s: unknown) =>
      typeof s === "string" ? s.replace(/\bCID(?:[-\s:]*10)?[\s:.-]*[A-Z]\d{2}(?:\.\d{1,2})?/gi, "").replace(/\s{2,}/g, " ").trim() || null : (s as null);
    const hora = (h: unknown) => (typeof h === "string" && HORA.test(h.trim()) ? h.trim().padStart(5, "0") : (h as string | null));
    return {
      ...d,
      funcionario_cpf: texto(d.funcionario_cpf).replace(/\D/g, "") || null,
      observacao: semCid(d.observacao),
      duvida: semCid(d.duvida),
      hora_inicio: hora(d.hora_inicio),
      hora_fim: hora(d.hora_fim),
      data_inicio: texto(d.data_inicio) || (texto(d.data_emissao) || null),
    };
  },
};

// ---------------------------------------------------------------------------
// NFS-e em PDF / imagem (Fiscal): para as prefeituras que não mandam XML.

const RETENCOES_FEDERAIS = ["valor_pis", "valor_cofins", "valor_csll", "valor_irrf", "valor_inss"] as const;
const CAMPOS_VALOR_NFSE = ["valor_servicos", "deducoes", "desconto_incondicionado", "base_calculo", "valor_iss", ...RETENCOES_FEDERAIS, "valor_liquido"];

const nfse: TipoDocumento = {
  chave: "nfse",
  titulo: "Leitor de NFS-e",
  item: { singular: "nota", plural: "notas" },
  departamento: "Fiscal",
  departamentos: ["Fiscal"],
  descricao:
    "Para as prefeituras que não mandam XML: envie os PDFs ou fotos das notas de serviço de um cliente. A IA lê prestador, tomador, valores, ISS e retenções; as regras conferem as contas e a confirmação grava a nota como prestada ou tomada.",
  aceita: "PDFs ou fotos de NFS-e (uma ou várias por arquivo)",
  imagemPorPedido: true,
  chaveUnica: (d) => (texto(d.numero) && digitos(d.prestador_documento) ? `${digitos(d.prestador_documento)}|${texto(d.numero).replace(/^0+/, "")}` : null),
  schemaItem: z.object({
    numero: z.string(),
    codigo_verificacao: z.string().nullable(),
    data_emissao: z.string().nullable(),
    competencia: z.string().nullable(),
    municipio: z.string().nullable(),
    prestador_documento: z.string().nullable(),
    prestador_nome: z.string().nullable(),
    tomador_documento: z.string().nullable(),
    tomador_nome: z.string().nullable(),
    codigo_servico: z.string().nullable(),
    discriminacao: z.string().nullable(),
    valor_servicos: z.number().nullable(),
    deducoes: z.number().nullable(),
    desconto_incondicionado: z.number().nullable(),
    base_calculo: z.number().nullable(),
    aliquota_iss: z.number().nullable(),
    valor_iss: z.number().nullable(),
    iss_retido: z.enum(["sim", "nao"]).nullable(),
    valor_pis: z.number().nullable(),
    valor_cofins: z.number().nullable(),
    valor_csll: z.number().nullable(),
    valor_irrf: z.number().nullable(),
    valor_inss: z.number().nullable(),
    valor_liquido: z.number().nullable(),
    duvida: z.string().nullable(),
  }),
  instrucoes: `Você lê Notas Fiscais de Serviço eletrônicas (NFS-e) de prefeituras brasileiras para o setor fiscal de um escritório de contabilidade. O fiscal vai conferir depois: transcreva com fidelidade e marque o que for incerto.

Regras:
- Um item em "itens" para cada nota na imagem. Se a página não for uma NFS-e (ex.: boleto, recibo, continuação sem dados), devolva "itens" vazia. Nota cancelada: transcreva e escreva "nota cancelada" em "duvida".
- "numero": número da nota como impresso (sem o RPS). "codigo_verificacao": código de verificação/autenticidade.
- Datas em "AAAA-MM-DD". "competencia": mês de competência em "AAAA-MM" (se não houver, o mês da emissão).
- "municipio": município da prefeitura que emitiu a nota.
- CPF/CNPJ só com dígitos. "prestador_*": quem prestou o serviço (emitente). "tomador_*": quem contratou.
- "codigo_servico": item da lista de serviços (LC 116) ou código do município, como impresso. "discriminacao": resumo da descrição do serviço em até 200 caracteres.
- Valores em reais como número com ponto decimal (ex.: 1234.56). Campo que não aparece ou está zerado: null (zero explícito pode ser 0).
- "aliquota_iss": em porcentagem (ex.: 2 para 2%, 3.5 para 3,5%).
- "iss_retido": "sim" se o ISS foi retido pelo tomador, "nao" se não foi; null se não estiver indicado.
- "valor_irrf" é o IR retido; "valor_inss" é o INSS retido.
- "duvida": algo ilegível, cortado ou incoerente, em poucas palavras; senão null.`,
  campos: [
    { chave: "numero", rotulo: "Número", tipo: "texto", largura: "terco" },
    { chave: "data_emissao", rotulo: "Emissão", tipo: "data", largura: "terco" },
    { chave: "competencia", rotulo: "Competência", tipo: "mes", largura: "terco" },
    { chave: "codigo_verificacao", rotulo: "Código de verificação", tipo: "texto", largura: "meia" },
    { chave: "municipio", rotulo: "Município", tipo: "texto", largura: "meia" },
    { chave: "prestador_nome", rotulo: "Prestador", tipo: "texto", largura: "meia" },
    { chave: "prestador_documento", rotulo: "CNPJ/CPF do prestador", tipo: "documento", largura: "meia" },
    { chave: "tomador_nome", rotulo: "Tomador", tipo: "texto", largura: "meia" },
    { chave: "tomador_documento", rotulo: "CNPJ/CPF do tomador", tipo: "documento", largura: "meia" },
    { chave: "codigo_servico", rotulo: "Código do serviço", tipo: "texto", largura: "meia" },
    { chave: "discriminacao", rotulo: "Discriminação", tipo: "texto_longo", largura: "inteira" },
    { chave: "valor_servicos", rotulo: "Valor dos serviços", tipo: "moeda", largura: "terco" },
    { chave: "deducoes", rotulo: "Deduções", tipo: "moeda", largura: "terco" },
    { chave: "desconto_incondicionado", rotulo: "Desconto incondicionado", tipo: "moeda", largura: "terco" },
    { chave: "base_calculo", rotulo: "Base de cálculo", tipo: "moeda", largura: "terco" },
    { chave: "aliquota_iss", rotulo: "Alíquota ISS (%)", tipo: "numero", largura: "terco" },
    { chave: "valor_iss", rotulo: "Valor do ISS", tipo: "moeda", largura: "terco" },
    {
      chave: "iss_retido",
      rotulo: "ISS retido?",
      tipo: "opcao",
      largura: "terco",
      opcoes: [
        { valor: "nao", rotulo: "Não" },
        { valor: "sim", rotulo: "Sim, pelo tomador" },
      ],
    },
    { chave: "valor_pis", rotulo: "PIS retido", tipo: "moeda", largura: "terco" },
    { chave: "valor_cofins", rotulo: "COFINS retida", tipo: "moeda", largura: "terco" },
    { chave: "valor_csll", rotulo: "CSLL retida", tipo: "moeda", largura: "terco" },
    { chave: "valor_irrf", rotulo: "IR retido", tipo: "moeda", largura: "terco" },
    { chave: "valor_inss", rotulo: "INSS retido", tipo: "moeda", largura: "terco" },
    { chave: "valor_liquido", rotulo: "Valor líquido", tipo: "moeda", largura: "terco" },
  ],
  validar: (d, ctx) => {
    const a: Alerta[] = [];
    const emissao = texto(d.data_emissao);
    const servicos = valor(d.valor_servicos);
    if (!texto(d.numero)) a.push({ tipo: "erro", texto: "Falta o número da nota" });
    if (!DATA.test(emissao)) a.push({ tipo: "erro", texto: "Falta a data de emissão" });
    else if (emissao > ctx.hoje) a.push({ tipo: "erro", texto: "Emissão no futuro" });
    if (texto(d.competencia) && !MES.test(texto(d.competencia))) a.push({ tipo: "erro", texto: "Competência inválida (use mês/ano)" });
    else if (MES.test(texto(d.competencia)) && texto(d.competencia) > mesDe(ctx.hoje)) a.push({ tipo: "aviso", texto: "Competência no futuro" });
    a.push(...alertaDocumento(d.prestador_documento, "prestador", true));
    a.push(...alertaDocumento(d.tomador_documento, "tomador", false));
    if (!servicos || servicos <= 0) a.push({ tipo: "erro", texto: "Falta o valor dos serviços" });

    const base = valor(d.base_calculo);
    const aliquota = valor(d.aliquota_iss);
    const iss = valor(d.valor_iss);
    if (aliquota !== null && (aliquota < 0 || aliquota > 10)) a.push({ tipo: "erro", texto: "Alíquota do ISS fora do normal (0 a 10%)" });
    else if (base !== null && aliquota !== null && iss !== null && !bate((base * aliquota) / 100, iss, Math.max(0.05, iss * 0.005))) {
      a.push({ tipo: "aviso", texto: `ISS não bate: ${real(base)} × ${aliquota}% = ${real((base * aliquota) / 100)}, na nota ${real(iss)}` });
    }
    if (servicos && base !== null && base > servicos + 0.01) a.push({ tipo: "aviso", texto: "Base de cálculo maior que o valor dos serviços" });

    const liquido = valor(d.valor_liquido);
    if (servicos && liquido !== null) {
      const retido = RETENCOES_FEDERAIS.reduce((s, c) => s + (valor(d[c]) ?? 0), 0) + (d.iss_retido === "sim" ? (iss ?? 0) : 0);
      const esperado = servicos - retido - (valor(d.desconto_incondicionado) ?? 0);
      if (!bate(esperado, liquido)) a.push({ tipo: "aviso", texto: `Líquido não bate: serviços − retenções = ${real(esperado)}, na nota ${real(liquido)}` });
    }
    if (d.iss_retido === "sim" && !digitos(d.tomador_documento)) a.push({ tipo: "aviso", texto: "ISS retido sem tomador identificado" });
    a.push(
      ...alertaCliente(
        ctx,
        [d.prestador_documento, d.tomador_documento],
        "O cliente não é o prestador nem o tomador desta nota: confira o cliente ou os CNPJs",
      ),
    );
    if (d.duvida) a.push({ tipo: "erro", texto: `Leitura incerta: ${d.duvida}` });
    return a;
  },
  tituloItem: (d) => `Nº ${texto(d.numero) || "?"} · ${texto(d.prestador_nome) || documentoBR(d.prestador_documento) || "prestador?"}`,
  resumoItem: (d) => [dataBR(d.data_emissao) || "sem data", real(d.valor_servicos) || "sem valor", texto(d.tomador_nome)].filter(Boolean).join(" · "),
  normalizar: (d) => {
    const n: Dados = { ...d };
    for (const c of CAMPOS_VALOR_NFSE) n[c] = valor(d[c]);
    const aliquota = valor(d.aliquota_iss);
    // "0,02" lido como fração: vira porcentagem.
    n.aliquota_iss = aliquota !== null && aliquota > 0 && aliquota < 0.2 ? Math.round(aliquota * 10000) / 100 : aliquota;
    n.prestador_documento = digitos(d.prestador_documento) || null;
    n.tomador_documento = digitos(d.tomador_documento) || null;
    n.competencia = mes(d.competencia) ?? (DATA.test(texto(d.data_emissao)) ? mesDe(texto(d.data_emissao)) : null);
    n.numero = texto(d.numero) || null;
    n.discriminacao = texto(d.discriminacao).slice(0, 500) || null;
    if (n.iss_retido !== "sim" && n.iss_retido !== "nao") n.iss_retido = null;
    return n;
  },
};

// ---------------------------------------------------------------------------
// Guias de recolhimento (DAS, DARF, GPS, FGTS, DAE, GARE, boleto)

const TIPOS_GUIA = [
  { valor: "das", rotulo: "DAS (Simples Nacional)" },
  { valor: "darf", rotulo: "DARF" },
  { valor: "gps", rotulo: "GPS (INSS)" },
  { valor: "fgts", rotulo: "FGTS (GFD / GRF)" },
  { valor: "dae", rotulo: "DAE / guia estadual" },
  { valor: "gare", rotulo: "GARE (ICMS-SP)" },
  { valor: "boleto", rotulo: "Boleto / taxa" },
  { valor: "outro", rotulo: "Outra" },
];
export const ROTULO_GUIA = Object.fromEntries(TIPOS_GUIA.map((t) => [t.valor, t.rotulo.replace(/ \(.*\)$/, "")]));

const guia: TipoDocumento = {
  chave: "guia",
  titulo: "Leitor de guias",
  item: { singular: "guia", plural: "guias" },
  departamento: "Fiscal",
  departamentos: ["Fiscal", "Contábil", "Pessoal"],
  descricao:
    "Envie as guias de um cliente (DAS, DARF, GPS, FGTS, estaduais ou boletos). A IA lê contribuinte, período, vencimento, valores e código de barras; a plataforma confere os dígitos do código e o valor gravado nele, e a confirmação registra a guia para a baixa pelo comprovante.",
  aceita: "PDFs ou fotos de guias e boletos",
  imagemPorPedido: true,
  chaveUnica: (d) => lerCodigoBarras(d.codigo_barras)?.barra ?? null,
  schemaItem: z.object({
    tipo_guia: z.enum(["das", "darf", "gps", "fgts", "dae", "gare", "boleto", "outro"]),
    contribuinte_nome: z.string().nullable(),
    contribuinte_documento: z.string().nullable(),
    codigo_receita: z.string().nullable(),
    periodo_apuracao: z.string().nullable(),
    vencimento: z.string().nullable(),
    valor_principal: z.number().nullable(),
    valor_multa: z.number().nullable(),
    valor_juros: z.number().nullable(),
    valor_total: z.number().nullable(),
    codigo_barras: z.string().nullable(),
    numero_documento: z.string().nullable(),
    duvida: z.string().nullable(),
  }),
  instrucoes: `Você lê guias de recolhimento de tributos e boletos brasileiros para um escritório de contabilidade. Alguém vai conferir depois: transcreva com fidelidade e marque o que for incerto.

Regras:
- Um item em "itens" para cada guia na imagem. Se não houver guia (ex.: página de instruções, comprovante de pagamento), devolva "itens" vazia.
- "tipo_guia": "das" (Documento de Arrecadação do Simples Nacional), "darf", "gps", "fgts" (GFD, GRF, guia do FGTS Digital), "dae" (guia estadual ou municipal), "gare" (GARE-SP), "boleto" (boleto bancário, taxa, conselho), "outro".
- "contribuinte_*": a empresa ou pessoa que deve pagar. CPF/CNPJ só com dígitos.
- "codigo_receita": código da receita ou do tributo, como impresso (ex.: "2089", "1099").
- "periodo_apuracao": mês de competência/período de apuração em "AAAA-MM".
- "vencimento": data de vencimento ("pagar até") em "AAAA-MM-DD".
- Valores em reais como número com ponto decimal. "valor_total": o total a pagar. Multa e juros só quando aparecerem; senão null.
- "codigo_barras": a linha digitável (ou o código numérico abaixo das barras) com TODOS os dígitos, sem espaços nem pontos. Copie dígito por dígito; se algum estiver ilegível, escreva em "duvida".
- "numero_documento": número do documento/da guia, se houver.
- "duvida": algo ilegível, cortado ou incoerente, em poucas palavras; senão null.`,
  campos: [
    { chave: "tipo_guia", rotulo: "Guia", tipo: "opcao", largura: "meia", opcoes: TIPOS_GUIA },
    { chave: "codigo_receita", rotulo: "Código da receita", tipo: "texto", largura: "meia" },
    { chave: "contribuinte_nome", rotulo: "Contribuinte", tipo: "texto", largura: "meia" },
    { chave: "contribuinte_documento", rotulo: "CNPJ/CPF", tipo: "documento", largura: "meia" },
    { chave: "periodo_apuracao", rotulo: "Período de apuração", tipo: "mes", largura: "meia" },
    { chave: "vencimento", rotulo: "Vencimento", tipo: "data", largura: "meia" },
    { chave: "valor_principal", rotulo: "Principal", tipo: "moeda", largura: "terco" },
    { chave: "valor_multa", rotulo: "Multa", tipo: "moeda", largura: "terco" },
    { chave: "valor_juros", rotulo: "Juros", tipo: "moeda", largura: "terco" },
    { chave: "valor_total", rotulo: "Total a pagar", tipo: "moeda", largura: "meia" },
    { chave: "numero_documento", rotulo: "Nº do documento", tipo: "texto", largura: "meia" },
    { chave: "codigo_barras", rotulo: "Código de barras / linha digitável", tipo: "texto", largura: "inteira" },
  ],
  validar: (d, ctx) => {
    const a: Alerta[] = [];
    const venc = texto(d.vencimento);
    const total = valor(d.valor_total);
    if (!total || total <= 0) a.push({ tipo: "erro", texto: "Falta o valor total" });
    if (!DATA.test(venc)) a.push({ tipo: "erro", texto: "Falta o vencimento" });
    else if (venc < ctx.hoje) a.push({ tipo: "aviso", texto: `Vencida em ${dataBR(venc)}: pode precisar de recálculo` });
    a.push(...alertaDocumento(d.contribuinte_documento, "contribuinte", false));
    const periodo = texto(d.periodo_apuracao);
    if (periodo && !MES.test(periodo)) a.push({ tipo: "erro", texto: "Período de apuração inválido (use mês/ano)" });
    else if (!periodo && ["das", "darf", "gps", "fgts"].includes(String(d.tipo_guia))) a.push({ tipo: "aviso", texto: "Sem período de apuração" });
    const principal = valor(d.valor_principal);
    if (principal !== null && total) {
      const soma = principal + (valor(d.valor_multa) ?? 0) + (valor(d.valor_juros) ?? 0);
      if (!bate(soma, total)) a.push({ tipo: "aviso", texto: `Principal + multa + juros = ${real(soma)}, diferente do total ${real(total)}` });
    }
    if (!digitos(d.codigo_barras)) a.push({ tipo: "aviso", texto: "Sem código de barras: a baixa pelo comprovante será pelo valor" });
    a.push(...alertasCodigo(d.codigo_barras, total, "total", true));
    a.push(...alertaCliente(ctx, [d.contribuinte_documento], "O contribuinte da guia não é o cliente da leitura"));
    if (d.duvida) a.push({ tipo: "erro", texto: `Leitura incerta: ${d.duvida}` });
    return a;
  },
  tituloItem: (d) => {
    const rotulo = ROTULO_GUIA[String(d.tipo_guia)] ?? "Guia";
    return `${rotulo}${mesBR(d.periodo_apuracao) ? ` ${mesBR(d.periodo_apuracao)}` : ""}${texto(d.codigo_receita) ? ` · ${texto(d.codigo_receita)}` : ""}`;
  },
  resumoItem: (d) => [real(d.valor_total) || "sem valor", d.vencimento ? `vence ${dataBR(d.vencimento)}` : "sem vencimento", texto(d.contribuinte_nome)].filter(Boolean).join(" · "),
  normalizar: (d) => ({
    ...d,
    contribuinte_documento: digitos(d.contribuinte_documento) || null,
    codigo_barras: digitos(d.codigo_barras) || null,
    periodo_apuracao: mes(d.periodo_apuracao),
    valor_principal: valor(d.valor_principal),
    valor_multa: valor(d.valor_multa),
    valor_juros: valor(d.valor_juros),
    valor_total: valor(d.valor_total),
  }),
};

// ---------------------------------------------------------------------------
// Comprovantes de pagamento (Contábil): a confirmação liga o comprovante à
// guia lida (pelo código de barras ou pelo valor) e dá a baixa.

const FORMAS = [
  { valor: "pix", rotulo: "PIX" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "tributo", rotulo: "Tributo / guia" },
  { valor: "ted", rotulo: "TED" },
  { valor: "transferencia", rotulo: "Transferência entre contas" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "outro", rotulo: "Outro" },
];
export const ROTULO_FORMA = Object.fromEntries(FORMAS.map((f) => [f.valor, f.rotulo]));

const comprovante: TipoDocumento = {
  chave: "comprovante",
  titulo: "Leitor de comprovantes",
  item: { singular: "comprovante", plural: "comprovantes" },
  departamento: "Contábil",
  departamentos: ["Contábil", "Financeiro"],
  descricao:
    "Envie os comprovantes de pagamento de um cliente (PIX, boleto, tributo, TED). A IA lê data, valor, quem pagou e quem recebeu; a confirmação registra o pagamento e dá baixa na guia correspondente lida no Leitor de guias.",
  aceita: "PDFs, prints ou fotos de comprovantes",
  imagemPorPedido: true,
  chaveUnica: (d) => (texto(d.autenticacao) ? texto(d.autenticacao).replace(/\s/g, "").toUpperCase() : null),
  schemaItem: z.object({
    data_pagamento: z.string().nullable(),
    valor: z.number().nullable(),
    forma: z.enum(["pix", "boleto", "tributo", "ted", "transferencia", "cartao", "outro"]),
    beneficiario_nome: z.string().nullable(),
    beneficiario_documento: z.string().nullable(),
    pagador_nome: z.string().nullable(),
    pagador_documento: z.string().nullable(),
    banco: z.string().nullable(),
    autenticacao: z.string().nullable(),
    codigo_barras: z.string().nullable(),
    descricao: z.string().nullable(),
    duvida: z.string().nullable(),
  }),
  instrucoes: `Você lê comprovantes de pagamento de bancos brasileiros (PIX, boleto, tributos, TED, transferências) para o setor contábil de um escritório de contabilidade. Alguém vai conferir depois: transcreva com fidelidade e marque o que for incerto.

Regras:
- Um item em "itens" para cada comprovante na imagem. Se não houver comprovante de pagamento efetivado (ex.: agendamento não realizado, boleto em aberto), devolva "itens" vazia; agendamento: escreva "agendamento" em "duvida".
- "data_pagamento": data em que o pagamento foi efetivado, "AAAA-MM-DD".
- "valor": valor pago em reais, número com ponto decimal (com multa/juros, se houver).
- "forma": "pix", "boleto" (pagamento de título bancário), "tributo" (DAS, DARF, GPS, FGTS, convênio/arrecadação), "ted", "transferencia" (entre contas do mesmo banco), "cartao", "outro".
- "beneficiario_*": quem recebeu (favorecido, cedente, órgão). "pagador_*": quem pagou (titular da conta debitada). CPF/CNPJ só com dígitos; se aparecer mascarado (***), null.
- "banco": banco ou instituição de onde saiu o pagamento.
- "autenticacao": identificador único do pagamento (ID/E2E do PIX, autenticação bancária, número de controle). Copie sem espaços.
- "codigo_barras": linha digitável ou código de barras pago, com todos os dígitos, quando aparecer; senão null.
- "descricao": descrição/mensagem do pagamento, até 200 caracteres; senão null.
- "duvida": algo ilegível, cortado ou incoerente, em poucas palavras; senão null.`,
  campos: [
    { chave: "data_pagamento", rotulo: "Pago em", tipo: "data", largura: "terco" },
    { chave: "valor", rotulo: "Valor pago", tipo: "moeda", largura: "terco" },
    { chave: "forma", rotulo: "Forma", tipo: "opcao", largura: "terco", opcoes: FORMAS },
    { chave: "beneficiario_nome", rotulo: "Beneficiário", tipo: "texto", largura: "meia" },
    { chave: "beneficiario_documento", rotulo: "CNPJ/CPF do beneficiário", tipo: "documento", largura: "meia" },
    { chave: "pagador_nome", rotulo: "Pagador", tipo: "texto", largura: "meia" },
    { chave: "pagador_documento", rotulo: "CNPJ/CPF do pagador", tipo: "documento", largura: "meia" },
    { chave: "banco", rotulo: "Banco", tipo: "texto", largura: "meia" },
    { chave: "autenticacao", rotulo: "Autenticação / ID", tipo: "texto", largura: "meia" },
    { chave: "codigo_barras", rotulo: "Código de barras pago", tipo: "texto", largura: "inteira", quando: (d) => d.forma === "boleto" || d.forma === "tributo" || Boolean(d.codigo_barras) },
    { chave: "descricao", rotulo: "Descrição", tipo: "texto_longo", largura: "inteira" },
  ],
  validar: (d, ctx) => {
    const a: Alerta[] = [];
    const data = texto(d.data_pagamento);
    const pago = valor(d.valor);
    if (!DATA.test(data)) a.push({ tipo: "erro", texto: "Falta a data do pagamento" });
    else if (data > ctx.hoje) a.push({ tipo: "erro", texto: "Pagamento no futuro: é agendamento?" });
    if (!pago || pago <= 0) a.push({ tipo: "erro", texto: "Falta o valor pago" });
    if (!texto(d.beneficiario_nome)) a.push({ tipo: "erro", texto: "Falta o beneficiário" });
    a.push(...alertaDocumento(d.beneficiario_documento, "beneficiário", false));
    a.push(...alertaDocumento(d.pagador_documento, "pagador", false));
    if (!texto(d.autenticacao)) a.push({ tipo: "aviso", texto: "Sem autenticação/ID: o mesmo comprovante pode ser lançado duas vezes" });
    // Boleto pago com atraso tem juros: o valor diferente é só aviso.
    a.push(...alertasCodigo(d.codigo_barras, pago, "valor pago", false));
    a.push(...alertaCliente(ctx, [d.pagador_documento], "O pagador não é o cliente da leitura"));
    if (d.duvida) a.push({ tipo: "erro", texto: `Leitura incerta: ${d.duvida}` });
    return a;
  },
  tituloItem: (d) => texto(d.beneficiario_nome) || "Beneficiário?",
  resumoItem: (d) => [dataBR(d.data_pagamento) || "sem data", real(d.valor) || "sem valor", ROTULO_FORMA[String(d.forma)]].filter(Boolean).join(" · "),
  normalizar: (d) => ({
    ...d,
    valor: valor(d.valor),
    beneficiario_documento: digitos(d.beneficiario_documento) || null,
    pagador_documento: digitos(d.pagador_documento) || null,
    autenticacao: texto(d.autenticacao).replace(/\s/g, "").slice(0, 200) || null,
    codigo_barras: digitos(d.codigo_barras) || null,
    descricao: texto(d.descricao).slice(0, 500) || null,
  }),
};

// ---------------------------------------------------------------------------

export const TIPOS_DOCUMENTO: Record<string, TipoDocumento> = { atestado, nfse, guia, comprovante };

export const tipoDocumento = (chave: string): TipoDocumento | null => TIPOS_DOCUMENTO[chave] ?? null;
