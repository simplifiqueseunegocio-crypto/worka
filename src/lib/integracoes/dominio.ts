// Validação e normalização das empresas enviadas pelo Domínio, no formato
// da consulta integracoes/dominio/empresas-ativas.sql.

export type EmpresaDominio = {
  codigo_dominio: number;
  tipo_inscricao: number | null;
  documento: string;
  razao_social: string;
  nome_fantasia: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  cnae: string | null;
  ramo_atividade: string | null;
  data_inicio_atividade: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  codigo_municipio: number | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  responsavel_legal: string | null;
  /** rfed_par da vigência atual (1 = Real, 2 = Simples, 5 = Presumido). */
  regime_federal: number | null;
  regime_vigencia: string | null;
};

export const LIMITE_EMPRESAS = 10_000;

type Resultado = { ok: true; empresas: EmpresaDominio[] } | { ok: false; erros: string[] };

const texto = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const digitos = (v: unknown) => texto(v)?.replace(/\D/g, "") || null;
const inteiro = (v: unknown) => {
  const s = texto(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
};
const data = (v: unknown) => {
  const s = texto(v)?.slice(0, 10) ?? null;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export function normalizarEmpresas(entrada: unknown): Resultado {
  const lista = Array.isArray(entrada)
    ? entrada
    : (entrada as { empresas?: unknown })?.empresas;

  if (!Array.isArray(lista)) {
    return { ok: false, erros: ["Envie um array de empresas ou { \"empresas\": [...] }."] };
  }
  if (lista.length === 0) return { ok: false, erros: ["A lista de empresas está vazia."] };
  if (lista.length > LIMITE_EMPRESAS) {
    return { ok: false, erros: [`Máximo de ${LIMITE_EMPRESAS} empresas por envio.`] };
  }

  const erros: string[] = [];
  const vistos = new Set<number>();
  const empresas: EmpresaDominio[] = [];

  lista.forEach((bruto, i) => {
    const e = (bruto ?? {}) as Record<string, unknown>;
    const linha = `empresa ${i + 1}`;
    const codigo = inteiro(e.codigo_dominio);
    const documento = digitos(e.documento);
    const razao = texto(e.razao_social);

    if (codigo === null || codigo <= 0) return void erros.push(`${linha}: codigo_dominio inválido.`);
    if (vistos.has(codigo)) return void erros.push(`${linha}: codigo_dominio ${codigo} repetido.`);
    if (!documento || !/^(\d{11}|\d{14})$/.test(documento)) {
      return void erros.push(`${linha} (código ${codigo}): documento deve ter 11 ou 14 dígitos.`);
    }
    if (!razao) return void erros.push(`${linha} (código ${codigo}): razao_social obrigatória.`);
    vistos.add(codigo);

    const uf = texto(e.uf)?.toUpperCase() ?? null;
    empresas.push({
      codigo_dominio: codigo,
      tipo_inscricao: inteiro(e.tipo_inscricao),
      documento,
      razao_social: razao,
      nome_fantasia: texto(e.nome_fantasia),
      inscricao_estadual: texto(e.inscricao_estadual),
      inscricao_municipal: texto(e.inscricao_municipal),
      cnae: digitos(e.cnae),
      ramo_atividade: texto(e.ramo_atividade),
      data_inicio_atividade: data(e.data_inicio_atividade),
      logradouro: texto(e.logradouro),
      numero: texto(e.numero),
      complemento: texto(e.complemento),
      bairro: texto(e.bairro),
      codigo_municipio: inteiro(e.codigo_municipio),
      municipio: texto(e.municipio),
      uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : null,
      cep: digitos(e.cep),
      telefone: [digitos(e.ddd), digitos(e.telefone)].filter(Boolean).join("") || null,
      email: texto(e.email)?.toLowerCase() ?? null,
      responsavel_legal: texto(e.responsavel_legal),
      regime_federal: inteiro(e.regime_federal),
      regime_vigencia: data(e.regime_vigencia),
    });
  });

  return erros.length ? { ok: false, erros: erros.slice(0, 50) } : { ok: true, empresas };
}
