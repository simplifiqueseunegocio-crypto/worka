import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { podeUsarDocumento, type ArquivoDocumento } from "@/lib/documentos/dados";
import { dataBR, documentoBR, mesBR, tipoDocumento, valor, type Campo, type Dados } from "@/lib/documentos/tipos";

// Planilha (CSV) de uma leitura de documentos: uma linha por item, uma coluna
// por campo do tipo. Separador ";", vírgula decimal e BOM: abre direto no
// Excel em português e serve para importar.

const celula = (campo: Campo, v: Dados[string]) => {
  if (v === null || v === undefined || v === "") return "";
  switch (campo.tipo) {
    case "moeda": {
      const n = valor(v);
      return n === null ? "" : n.toFixed(2).replace(".", ",");
    }
    case "numero":
      return String(v).replace(".", ",");
    case "data":
      return dataBR(v) || String(v);
    case "mes":
      return mesBR(v) || String(v);
    case "documento":
    case "cpf":
      return documentoBR(v);
    case "opcao":
      return campo.opcoes?.find((o) => o.valor === v)?.rotulo ?? String(v);
    default:
      return String(v);
  }
};

// Aspas quando preciso; texto que começa com = + - @ não vira fórmula.
const csv = (s: string) => {
  const seguro = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

export async function GET(_request: Request, { params }: { params: Promise<{ tipo: string; id: string }> }) {
  const { tipo: chave, id } = await params;
  const tipo = tipoDocumento(chave);
  if (!tipo || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Leitura inválida.", { status: 400 });
  const usuario = await getUsuario();
  if (!(await podeUsarDocumento(usuario, chave))) return new Response("Sem acesso.", { status: 403 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("documentos_leituras")
    .select("tipo, arquivos, enviada_em, cliente:clientes(razao_social), itens:documentos_itens(ordem, dados, origem, conferido)")
    .eq("id", id)
    .order("ordem", { referencedTable: "documentos_itens" })
    .maybeSingle()
    .overrideTypes<
      {
        tipo: string;
        arquivos: ArquivoDocumento[];
        enviada_em: string;
        cliente: { razao_social: string } | null;
        itens: { dados: Dados; origem: { arquivo: number; pagina: number } | null; conferido: boolean }[];
      },
      { merge: false }
    >();
  if (!data || data.tipo !== chave) return new Response("Leitura não encontrada.", { status: 404 });

  const cabecalho = ["Cliente", ...tipo.campos.map((c) => c.rotulo), "Conferido", "Arquivo", "Página"];
  const linhas = data.itens.map((it) => [
    data.cliente?.razao_social ?? "",
    ...tipo.campos.map((c) => celula(c, it.dados[c.chave])),
    it.conferido ? "Sim" : "Não",
    it.origem ? (data.arquivos[it.origem.arquivo]?.nome ?? "") : "",
    it.origem ? String(it.origem.pagina) : "",
  ]);
  const corpo = "﻿" + [cabecalho, ...linhas].map((l) => l.map(csv).join(";")).join("\r\n") + "\r\n";

  const nome = `${tipo.item.plural}-${(data.cliente?.razao_social ?? "leitura").normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).toLowerCase()}-${data.enviada_em.slice(0, 10)}.csv`;
  return new Response(corpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "no-store, private",
    },
  });
}
