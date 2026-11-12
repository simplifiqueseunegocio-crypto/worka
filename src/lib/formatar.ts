// CNPJ 00.000.000/0000-00 · CAEPF 000.000.000/000-00 · CPF 000.000.000-00
export function formatarDocumento(doc: string, tipoInscricao?: number | null) {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14 && tipoInscricao === 6) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
}

export function rotuloDocumento(doc: string, tipoInscricao?: number | null) {
  if (tipoInscricao === 6) return "CAEPF";
  return doc.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ";
}

// SAO JOSE DO RIO PRETO + SP → SAO JOSE DO RIO PRETO/SP; sem município, só a UF.
export function formatarMunicipio(municipio: string | null, uf: string | null) {
  return [municipio, uf].filter(Boolean).join("/") || null;
}

// 6920601 → 6920-6/01
export function formatarCnae(cnae: string | null) {
  if (!cnae) return null;
  const d = cnae.replace(/\D/g, "");
  return d.length === 7 ? d.replace(/(\d{4})(\d)(\d{2})/, "$1-$2/$3") : cnae;
}
