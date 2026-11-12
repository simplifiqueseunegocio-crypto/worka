import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// Extração de dados de documentos (imagens) por IA, com a resposta num formato
// fixo (schema zod). Usada pelos leitores de documentos (ficha ponto,
// atestados...). Fornecedor escolhido no .env:
//   PONTO_IA=groq    (GROQ_API_KEY; modelo em GROQ_MODELO, padrão qwen/qwen3.8-27b)
//   PONTO_IA=claude  (ANTHROPIC_API_KEY; Claude Opus 5.5)
// Sem PONTO_IA: Groq se houver GROQ_API_KEY, senão Claude se houver ANTHROPIC_API_KEY.

export type FornecedorIa = "groq" | "claude";

export function fornecedorIa(): FornecedorIa | null {
  const pedido = process.env.PONTO_IA?.toLowerCase();
  if (pedido === "groq") return process.env.GROQ_API_KEY ? "groq" : null;
  if (pedido === "claude") return process.env.ANTHROPIC_API_KEY ? "claude" : null;
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

export const nomeFornecedor = (f: FornecedorIa) => (f === "groq" ? "Groq" : "Claude");

// Pedidos ao mesmo tempo (a camada grátis da Groq limita por minuto) e quantas
// imagens cabem num pedido (a Groq aceita até 3).
export const paraleloIa = (f: FornecedorIa) => (f === "groq" ? 1 : 4);
export const imagensPorPedido = (f: FornecedorIa) => (f === "groq" ? 3 : 5);

export const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

type Pedido<T extends z.ZodType> = {
  imagens: Buffer[];
  instrucoes: string; // system
  texto: string; // pedido do usuário (contexto: competência, texto extraído do PDF...)
  schema: T;
  nome: string; // nome do schema, ex.: "ficha_ponto"
  rotulo: string; // para as mensagens de erro, ex.: "foto.jpg, página 2"
};

// ---------------------------------------------------------------------------
// JSON Schema estrito (Groq) a partir do zod: tira o $schema, troca
// anyOf [X, null] por type [X, "null"] e os limites de inteiro "seguro".

type Json = Record<string, unknown>;
function estrito(no: unknown): unknown {
  if (Array.isArray(no)) return no.map(estrito);
  if (!no || typeof no !== "object") return no;
  const o = { ...(no as Json) };
  delete o.$schema;
  if (o.type === "integer" && o.minimum === Number.MIN_SAFE_INTEGER) delete o.minimum;
  if (o.type === "integer" && o.maximum === Number.MAX_SAFE_INTEGER) delete o.maximum;
  const anyOf = o.anyOf as Json[] | undefined;
  if (anyOf?.length === 2 && anyOf.some((x) => x.type === "null")) {
    const outro = estrito(anyOf.find((x) => x.type !== "null")) as Json;
    delete o.anyOf;
    const tipo = outro.type;
    Object.assign(o, outro, { type: Array.isArray(tipo) ? [...tipo, "null"] : [tipo, "null"] });
    if (Array.isArray(outro.enum)) o.enum = [...outro.enum, null];
    return o;
  }
  for (const k of Object.keys(o)) o[k] = estrito(o[k]);
  return o;
}
export const schemaEstrito = (schema: z.ZodType) => estrito(z.toJSONSchema(schema)) as Json;

// ---------------------------------------------------------------------------
// Claude (Anthropic SDK, saída estruturada)

let anthropic: Anthropic | null = null;

async function comClaude<T extends z.ZodType>(p: Pedido<T>): Promise<z.infer<T>> {
  anthropic ??= new Anthropic();
  const stream = anthropic.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(p.schema) },
    system: p.instrucoes,
    messages: [
      {
        role: "user",
        content: [
          ...p.imagens.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: img.toString("base64") } })),
          { type: "text", text: p.texto },
        ],
      },
    ],
  });
  const r = await stream.finalMessage();
  if (r.stop_reason === "refusal") throw new Error(`${p.rotulo}: a IA recusou a leitura`);
  if (r.stop_reason === "max_tokens") throw new Error(`${p.rotulo}: documento longo demais para uma leitura`);
  if (!r.parsed_output) throw new Error(`${p.rotulo}: resposta da IA fora do formato`);
  return r.parsed_output as z.infer<T>;
}

// ---------------------------------------------------------------------------
// Groq (API compatível com OpenAI, JSON Schema estrito)

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function comGroq<T extends z.ZodType>(p: Pedido<T>): Promise<z.infer<T>> {
  const corpo = {
    model: process.env.GROQ_MODELO || "qwen/qwen3.8-27b",
    temperature: 0,
    max_completion_tokens: 16000,
    response_format: { type: "json_schema", json_schema: { name: p.nome, strict: true, schema: schemaEstrito(p.schema) } },
    messages: [
      { role: "system", content: p.instrucoes },
      {
        role: "user",
        content: [
          { type: "text", text: p.texto },
          ...p.imagens.map((img) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img.toString("base64")}` } })),
        ],
      },
    ],
  };
  for (let tentativa = 1; ; tentativa++) {
    const resposta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(180_000),
    });
    if (resposta.status === 429 && tentativa < 7) {
      // Limite da camada grátis (por minuto): espera o que a Groq pedir e tenta
      // de novo, por até ~4 minutos no total.
      const s = Number(resposta.headers.get("retry-after")) || 20 * tentativa;
      await espera(Math.min(60, Math.max(5, s)) * 1000);
      continue;
    }
    const json = (await resposta.json().catch(() => null)) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      error?: { message?: string };
    } | null;
    if (resposta.status === 401) throw new Error("A chave da Groq (GROQ_API_KEY) não foi aceita.");
    if (resposta.status === 429) throw new Error("Limite de uso da Groq atingido. Tente de novo em alguns minutos.");
    if (!resposta.ok) {
      if (resposta.status >= 500 && tentativa < 3) {
        await espera(3000 * tentativa);
        continue;
      }
      throw new Error(`${p.rotulo}: Groq respondeu ${resposta.status} (${json?.error?.message ?? "sem detalhes"})`);
    }
    const escolha = json?.choices?.[0];
    if (escolha?.finish_reason === "length") throw new Error(`${p.rotulo}: documento longo demais para uma leitura`);
    const texto = (escolha?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    try {
      return p.schema.parse(JSON.parse(texto));
    } catch {
      if (tentativa < 2) continue;
      throw new Error(`${p.rotulo}: resposta da IA fora do formato`);
    }
  }
}

export async function extrairComIa<T extends z.ZodType>(fornecedor: FornecedorIa, pedido: Pedido<T>): Promise<z.infer<T>> {
  try {
    return fornecedor === "groq" ? await comGroq(pedido) : await comClaude(pedido);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("A chave do Claude (ANTHROPIC_API_KEY) não foi aceita.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Limite de uso do Claude atingido. Tente de novo em alguns minutos.");
    throw e;
  }
}
