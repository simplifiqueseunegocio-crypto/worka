import "server-only";

// PDF da ficha ponto com o pdf.js: o texto de cada página com a posição de cada
// pedaço (para o leitor sem IA) e a página como imagem (para a IA, quando a
// página é escaneada e não tem texto).

export type Pedaco = { texto: string; x: number; y: number; largura: number };
export type Linha = { y: number; pedacos: Pedaco[]; texto: string };

type DocPdf = Awaited<ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs").getDocument>["promise"]>;

export async function abrirPdf(conteudo: Buffer): Promise<DocPdf> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({ data: new Uint8Array(conteudo), useSystemFonts: true, verbosity: 0 }).promise;
}

// Linhas da página, de cima para baixo; pedaços da esquerda para a direita.
export async function linhasDaPagina(doc: DocPdf, numero: number): Promise<Linha[]> {
  const pagina = await doc.getPage(numero);
  const { items } = await pagina.getTextContent();
  const pedacos: Pedaco[] = [];
  for (const it of items) {
    if (!("str" in it) || !it.str.trim()) continue;
    pedacos.push({ texto: it.str.trim(), x: it.transform[4], y: it.transform[5], largura: it.width });
  }
  // Mesma linha: diferença de altura pequena (o y do PDF cresce para cima).
  pedacos.sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: Linha[] = [];
  for (const p of pedacos) {
    const l = linhas.find((x) => Math.abs(x.y - p.y) < 3);
    if (l) l.pedacos.push(p);
    else linhas.push({ y: p.y, pedacos: [p], texto: "" });
  }
  for (const l of linhas) {
    l.pedacos.sort((a, b) => a.x - b.x);
    l.texto = l.pedacos.map((p) => p.texto).join(" ");
  }
  return linhas.sort((a, b) => b.y - a.y);
}

// Página como JPEG (largura em pixels), para mandar à IA.
export async function paginaComoImagem(doc: DocPdf, numero: number, largura = 1600): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const pagina = await doc.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  const viewport = pagina.getViewport({ scale: largura / base.width });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
  return canvas.toBuffer("image/jpeg", 85);
}
