import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigurado, enviarEmail, type EmailNovo } from "@/lib/email";
import { origemDaRequisicao, tokenValido } from "@/lib/integracoes/execucoes";
import { hojeISO, somarDias } from "@/lib/tarefas";

// Peças comuns das automações agendadas: rota protegida pelo CRON_SECRET,
// registro em automacao_execucoes, envio de e-mails no ritmo do Resend e
// cálculo de dias úteis (fim de semana e feriados nacionais).

export type StatusExecucao = "sucesso" | "parcial" | "erro" | "ignorado";
export type ResultadoAutomacao = { status: StatusExecucao; enviados: number; falhas: number; mensagem: string; detalhes?: unknown };

export const ignorado = (mensagem: string): ResultadoAutomacao => ({ status: "ignorado", enviados: 0, falhas: 0, mensagem });

export type Contexto = { supabase: SupabaseClient; hoje: string; base: string; origem: string; forcar: boolean };

// Executa a automação, captura erros e grava uma linha no histórico.
export async function executarAutomacao(
  automacao: string,
  ctx: Omit<Contexto, "supabase" | "hoje">,
  executar: (c: Contexto) => Promise<ResultadoAutomacao>,
  { precisaEmail = true } = {},
): Promise<ResultadoAutomacao> {
  const supabase = createAdminClient();
  const hoje = hojeISO();
  const inicio = Date.now();

  let r: ResultadoAutomacao;
  try {
    r =
      precisaEmail && !emailConfigurado()
        ? { status: "erro", enviados: 0, falhas: 0, mensagem: "Envio de e-mail não configurado (RESEND_API_KEY e EMAIL_REMETENTE)." }
        : await executar({ ...ctx, supabase, hoje });
  } catch (e) {
    console.error(`Automação ${automacao} falhou`, e);
    r = { status: "erro", enviados: 0, falhas: 0, mensagem: e instanceof Error ? e.message : "Falha inesperada." };
  }

  const { error } = await supabase.from("automacao_execucoes").insert({
    automacao,
    referencia: hoje,
    status: r.status,
    origem: ctx.origem,
    duracao_ms: Date.now() - inicio,
    enviados: r.enviados,
    falhas: r.falhas,
    mensagem: r.mensagem,
    detalhes: r.detalhes ?? null,
  });
  if (error) console.error(`Falha ao registrar a execução de ${automacao}`, error);
  return r;
}

// Handler GET das rotas /api/automacoes/*, chamadas pelo Vercel Cron.
export function rotaAgendada(
  automacao: string,
  executar: (c: Contexto) => Promise<ResultadoAutomacao>,
  opcoes?: { precisaEmail?: boolean },
) {
  return async function GET(request: Request) {
    const json = (status: number, corpo: unknown) => Response.json(corpo, { status });
    if (!tokenValido(request, "CRON_SECRET")) return json(401, { erro: "Token inválido." });
    if (!process.env.SUPABASE_SECRET_KEY) return json(503, { erro: "Automação não configurada no servidor." });

    const url = new URL(request.url);
    const base = process.env.APP_URL?.replace(/\/+$/, "") || url.origin;
    const forcar = url.searchParams.get("forcar") === "1";
    const origem = request.headers.get("user-agent")?.startsWith("vercel-cron") ? "agendada" : origemDaRequisicao(request);

    const r = await executarAutomacao(automacao, { base, origem, forcar }, executar, opcoes);
    return json(r.status === "erro" ? 500 : 200, { ...r, detalhes: undefined });
  };
}

// ---------------------------------------------------------------------------
// Envio

const PAUSA_ENTRE_ENVIOS_MS = 550; // limite padrão do Resend: 2 envios por segundo

// Envia um e-mail por item, em sequência. Devolve os itens entregues.
export async function enviarEmSequencia<T>(itens: { item: T; email: EmailNovo }[]) {
  const entregues: T[] = [];
  const erros: { para: string; erro: string }[] = [];
  for (const [i, { item, email }] of itens.entries()) {
    if (i > 0) await new Promise((ok) => setTimeout(ok, PAUSA_ENTRE_ENVIOS_MS));
    const r = await enviarEmail(email);
    if (r.erro) erros.push({ para: String(email.para), erro: r.erro });
    else entregues.push(item);
  }
  return { entregues, erros };
}

// Resultado padrão de uma rodada de envios.
export function resultadoEnvio(total: number, enviados: number, erros: { para: string; erro: string }[], mensagem: string): ResultadoAutomacao {
  const falhas = erros.length;
  return {
    status: falhas === 0 ? "sucesso" : enviados === 0 && total > 0 ? "erro" : "parcial",
    enviados,
    falhas,
    mensagem,
    detalhes: falhas ? { erros } : undefined,
  };
}

// Já houve envio com sucesso hoje? Evita repetir quando o agendador chama duas vezes.
export async function jaEnviadoHoje({ supabase, hoje }: Contexto, automacao: string) {
  const { count } = await supabase
    .from("automacao_execucoes")
    .select("id", { count: "exact", head: true })
    .eq("automacao", automacao)
    .eq("referencia", hoje)
    .in("status", ["sucesso", "parcial"]);
  return Boolean(count);
}

// ---------------------------------------------------------------------------
// Destinatários

export type Pessoa = { id: string; nome: string; email: string };

export async function gestoresEAdmins(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, email, papel")
    .eq("ativo", true)
    .in("papel", ["admin", "gestor"]);
  if (error) throw new Error(`Falha ao ler a equipe: ${error.message}`);
  return (data ?? []) as (Pessoa & { papel: "admin" | "gestor" })[];
}

// Responsáveis ativos (qualquer departamento) de cada cliente.
export async function responsaveisPorCliente(supabase: SupabaseClient, clientes: string[]) {
  const mapa = new Map<string, Pessoa[]>();
  if (clientes.length === 0) return mapa;
  const { data, error } = await supabase
    .from("cliente_responsaveis")
    .select("cliente_id, profile:profiles!inner(id, nome, email, ativo)")
    .in("cliente_id", clientes)
    .overrideTypes<{ cliente_id: string; profile: Pessoa & { ativo: boolean } }[], { merge: false }>();
  if (error) throw new Error(`Falha ao ler os responsáveis: ${error.message}`);
  for (const r of data ?? []) {
    if (!r.profile.ativo) continue;
    const lista = mapa.get(r.cliente_id) ?? [];
    if (!lista.some((p) => p.id === r.profile.id)) lista.push(r.profile);
    mapa.set(r.cliente_id, lista);
  }
  return mapa;
}

// Distribui itens por cliente: gestores e admins recebem todos; os responsáveis
// de cada cliente, só os dos seus clientes.
export async function distribuirPorCliente<T extends { clienteId: string }>(supabase: SupabaseClient, itens: T[]) {
  const [chefes, responsaveis] = await Promise.all([
    gestoresEAdmins(supabase),
    responsaveisPorCliente(supabase, [...new Set(itens.map((i) => i.clienteId))]),
  ]);
  const destinos = new Map<string, { pessoa: Pessoa; itens: T[] }>();
  for (const p of chefes) destinos.set(p.id, { pessoa: p, itens });
  for (const item of itens) {
    for (const p of responsaveis.get(item.clienteId) ?? []) {
      if (chefes.some((c) => c.id === p.id)) continue; // já recebe todos
      const d = destinos.get(p.id) ?? { pessoa: p, itens: [] };
      d.itens.push(item);
      destinos.set(p.id, d);
    }
  }
  return [...destinos.values()].filter((d) => d.itens.length && d.pessoa.email);
}

// ---------------------------------------------------------------------------
// Dias úteis

export async function feriadosNacionais(supabase: SupabaseClient, de: string, ate: string) {
  const { data } = await supabase
    .from("feriados")
    .select("data, descricao")
    .is("uf", null)
    .is("municipio", null)
    .gte("data", de)
    .lte("data", ate);
  return new Map((data ?? []).map((f) => [f.data as string, f.descricao as string]));
}

export function ehDiaUtil(iso: string, feriados: Map<string, string>) {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dia !== 0 && dia !== 6 && !feriados.has(iso);
}

// Dias úteis depois de "de" até "ate" (inclusive). Ex.: sexta → segunda = 1.
export function diasUteisEntre(de: string, ate: string, feriados: Map<string, string>) {
  let n = 0;
  for (let d = somarDias(de, 1); d <= ate; d = somarDias(d, 1)) if (ehDiaUtil(d, feriados)) n++;
  return n;
}

// Motivo para não rodar hoje (fim de semana ou feriado nacional), ou null.
export async function motivoNaoUtil({ supabase, hoje }: Contexto) {
  const dia = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  if (dia === 0 || dia === 6) return "Fim de semana.";
  const feriados = await feriadosNacionais(supabase, hoje, hoje);
  return feriados.has(hoje) ? `Feriado: ${feriados.get(hoje)}.` : null;
}
