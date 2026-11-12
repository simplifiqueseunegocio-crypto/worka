// UF e município opcionais no corpo das rotas do worker de CND
// (/api/integracoes/cnd/reservar e /pendentes): cada prefeitura tem a sua
// rotina, então a fila municipal é lida por cidade.

export type Lugar = { uf: string | null; municipio: string | null };

export function lerLugar(corpo: { uf?: unknown; municipio?: unknown } | null | undefined): Lugar | { erro: string } {
  const uf = corpo?.uf ?? null;
  const municipio = corpo?.municipio ?? null;
  if (uf !== null && !(typeof uf === "string" && /^[A-Za-z]{2}$/.test(uf))) return { erro: "uf deve ter 2 letras." };
  if (municipio !== null && !(typeof municipio === "string" && municipio.trim().length >= 2 && municipio.length <= 80)) {
    return { erro: "municipio deve ser o nome do município." };
  }
  if (municipio !== null && uf === null) return { erro: "Informe a uf junto com o municipio." };
  return { uf: uf === null ? null : uf.toUpperCase(), municipio: municipio === null ? null : municipio.trim() };
}
