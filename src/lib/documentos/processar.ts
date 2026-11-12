import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirPdf, linhasDaPagina, paginaComoImagem } from "@/lib/ponto-pdf";
import { extrairComIa, fornecedorIa, hojeSP, imagensPorPedido, nomeFornecedor, paraleloIa } from "@/lib/ia-extracao";
import { nomeComparavel } from "@/lib/ponto-regras";
import { tipoDocumento, type Dados } from "@/lib/documentos/tipos";
import { BUCKET_DOCUMENTOS, type ArquivoDocumento } from "@/lib/documentos/dados";

// Processa uma leitura de documentos (roda depois da resposta, em after()):
// arquivos → páginas como imagem (+ texto da página, quando o PDF tem) → IA
// com o schema do tipo → itens para conferência.

type Pagina = { arquivo: number; pagina: number; rotulo: string; imagem: () => Promise<Buffer>; texto: string };

async function paginasDoArquivo(a: ArquivoDocumento, indice: number, conteudo: Buffer): Promise<Pagina[]> {
  if (a.tipo === "application/pdf") {
    const doc = await abrirPdf(conteudo);
    const paginas: Pagina[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const texto = (await linhasDaPagina(doc, n)).map((l) => l.texto).join("\n");
      paginas.push({
        arquivo: indice,
        pagina: n,
        rotulo: doc.numPages > 1 ? `${a.nome}, página ${n}` : a.nome,
        imagem: () => paginaComoImagem(doc, n),
        texto,
      });
    }
    return paginas;
  }
  return [
    {
      arquivo: indice,
      pagina: 1,
      rotulo: a.nome,
      imagem: () => sharp(conteudo).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
      texto: "",
    },
  ];
}

export async function processarLeituraDocumento(leituraId: string) {
  const db = createAdminClient();
  const falhar = (mensagem: string) =>
    db.from("documentos_leituras").update({ status: "erro", mensagem: mensagem.slice(0, 2000) }).eq("id", leituraId);

  try {
    const { data: leitura, error } = await db.from("documentos_leituras").select("id, tipo, cliente_id, arquivos").eq("id", leituraId).single();
    if (error || !leitura) return;
    const tipo = tipoDocumento(leitura.tipo);
    if (!tipo) return void (await falhar(`Tipo de documento desconhecido: ${leitura.tipo}`));
    const fornecedor = fornecedorIa();
    if (!fornecedor) return void (await falhar("Nenhuma IA configurada no servidor (GROQ_API_KEY ou ANTHROPIC_API_KEY)."));

    // 1. Arquivos → páginas.
    const paginas: Pagina[] = [];
    const arquivos = leitura.arquivos as ArquivoDocumento[];
    for (const [i, a] of arquivos.entries()) {
      const { data: arq, error: e } = await db.storage.from(BUCKET_DOCUMENTOS).download(a.path);
      if (e || !arq) throw new Error(`Não foi possível abrir ${a.nome}`);
      try {
        paginas.push(...(await paginasDoArquivo(a, i, Buffer.from(await arq.arrayBuffer()))));
      } catch (err) {
        console.error("Documentos: arquivo", a.nome, err);
        throw new Error(`Não foi possível ler ${a.nome}: o arquivo está corrompido ou num formato não aceito`);
      }
    }
    await db.from("documentos_leituras").update({ paginas_total: paginas.length, paginas_lidas: 0, status: "lendo", mensagem: null }).eq("id", leituraId);

    // 2. IA: uma página por pedido (cada foto é um documento) ou páginas juntas.
    const porPedido = tipo.imagemPorPedido ? 1 : imagensPorPedido(fornecedor);
    const grupos: Pagina[][] = [];
    for (let i = 0; i < paginas.length; i += porPedido) grupos.push(paginas.slice(i, i + porPedido));
    const schema = z.object({ itens: z.array(tipo.schemaItem) });
    const itens: { dados: Dados; origem: { arquivo: number; pagina: number } }[] = [];
    const falhas: string[] = [];
    let lidas = 0;
    let proximo = 0;
    await Promise.all(
      Array.from({ length: Math.min(paraleloIa(fornecedor), grupos.length) }, async () => {
        while (proximo < grupos.length) {
          const g = grupos[proximo++];
          const rotulo = g.length > 1 ? `${g[0].rotulo} a ${g[g.length - 1].rotulo}` : g[0].rotulo;
          try {
            const textoPdf = g.map((p) => p.texto).join("\n").trim().slice(0, 4000);
            const r = await extrairComIa(fornecedor, {
              imagens: await Promise.all(g.map((p) => p.imagem())),
              instrucoes: tipo.instrucoes,
              texto: `Hoje é ${hojeSP()}.${textoPdf ? `\nTexto extraído do PDF (pode ajudar na leitura):\n${textoPdf}` : ""}\nExtraia os ${tipo.item.plural}.`,
              schema,
              nome: tipo.chave,
              rotulo,
            });
            for (const it of r.itens as Dados[]) {
              itens.push({ dados: tipo.normalizar ? tipo.normalizar(it) : it, origem: { arquivo: g[0].arquivo, pagina: g[0].pagina } });
            }
          } catch (e) {
            falhas.push(e instanceof Error ? e.message : `${rotulo}: falha na leitura`);
          }
          lidas += g.length;
          await db.from("documentos_leituras").update({ paginas_lidas: lidas }).eq("id", leituraId);
        }
      }),
    );
    if (!itens.length) {
      await falhar(falhas.length ? falhas.join(" · ") : `Nenhum ${tipo.item.singular} encontrado nos arquivos.`);
      return;
    }
    itens.sort((a, b) => a.origem.arquivo - b.origem.arquivo || a.origem.pagina - b.origem.pagina);

    // O mesmo documento lido mais de uma vez (nota em duas páginas, guia
    // enviada duas vezes) fica um item só: vale a primeira leitura, e o que
    // faltou nela vem das outras.
    let repetidos = 0;
    if (tipo.chaveUnica) {
      const vistos = new Map<string, Dados>();
      for (let i = 0; i < itens.length; i++) {
        const chave = tipo.chaveUnica(itens[i].dados);
        if (!chave) continue;
        const primeiro = vistos.get(chave);
        if (!primeiro) {
          vistos.set(chave, itens[i].dados);
          continue;
        }
        for (const [k, v] of Object.entries(itens[i].dados)) if ((primeiro[k] === null || primeiro[k] === "") && v !== null) primeiro[k] = v;
        itens.splice(i--, 1);
        repetidos++;
      }
    }

    // 3. Liga ao funcionário já cadastrado no cliente (CPF; senão nome igual).
    const funcionarios =
      leitura.cliente_id && tipo.funcionario
        ? ((await db.from("ponto_funcionarios").select("id, nome, cpf").eq("cliente_id", leitura.cliente_id)).data ?? [])
        : [];
    const vinculo = (d: Dados) => {
      const f = tipo.funcionario?.(d);
      if (!f) return null;
      return funcionarios.find((x) => f.cpf && x.cpf === f.cpf)?.id ?? funcionarios.find((x) => nomeComparavel(x.nome) === nomeComparavel(f.nome))?.id ?? null;
    };

    await db.from("documentos_itens").delete().eq("leitura_id", leituraId); // "ler de novo" substitui
    const { error: e2 } = await db
      .from("documentos_itens")
      .insert(itens.map((it, i) => ({ leitura_id: leituraId, ordem: i, dados: it.dados, origem: it.origem, funcionario_id: vinculo(it.dados) })));
    if (e2) throw new Error(`Falha ao salvar os itens: ${e2.message}`);

    const resumo = `${itens.length} ${itens.length === 1 ? tipo.item.singular : tipo.item.plural} em ${paginas.length} ${paginas.length === 1 ? "página" : "páginas"}${
      repetidos ? ` (${repetidos} ${repetidos === 1 ? "repetido juntado" : "repetidos juntados"})` : ""
    } · lido com IA (${nomeFornecedor(fornecedor)})`;
    await db
      .from("documentos_leituras")
      .update({
        status: "conferir",
        lida_em: new Date().toISOString(),
        mensagem: falhas.length ? `${resumo}. Não lidas: ${falhas.join(" · ")}` : resumo,
      })
      .eq("id", leituraId);
  } catch (e) {
    console.error("Leitura de documentos", leituraId, e);
    await falhar(e instanceof Error ? e.message : "Falha na leitura.");
  }
}
