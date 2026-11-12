import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escaparHtml, modeloEmail } from "@/lib/email";
import { somarDias } from "@/lib/tarefas";
import {
  enviarEmSequencia,
  ignorado,
  jaEnviadoHoje,
  motivoNaoUtil,
  resultadoEnvio,
  type Contexto,
  type ResultadoAutomacao,
} from "@/lib/automacao-execucao";

// Automação "Resumo diário por e-mail": de manhã, cada pessoa ativa recebe as
// tarefas sob sua responsabilidade que estão atrasadas, vencem hoje ou vencem
// nos próximos 7 dias, além das suas tarefas pessoais nesse intervalo.
// Quem não tem nada no período não recebe e-mail.

export const AUTOMACAO_RESUMO = "resumo_diario";
const DIAS_A_FRENTE = 7;
const LIMITE_POR_SECAO = 15;
const ABERTAS = ["pendente", "em_andamento", "aguardando_cliente"];

type ItemResumo = { titulo: string; detalhe: string; prazo: string; aguardando: boolean };

export type ResumoPessoa = {
  id: string;
  nome: string;
  email: string;
  atrasadas: ItemResumo[];
  hoje: ItemResumo[];
  proximas: ItemResumo[];
  pessoais: ItemResumo[];
};

type LinhaTarefa = {
  prazo_legal: string;
  status: string;
  responsavel_id: string;
  cliente: { razao_social: string; fantasia: string | null } | null;
  obrigacao: { nome: string } | null;
};

type LinhaPessoal = { dono_id: string; titulo: string; prazo: string; cliente: { razao_social: string } | null };

async function todasAsPaginas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const linhas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) return linhas;
  }
}

// Monta o resumo de cada pessoa (ou só de uma, para a prévia).
export async function coletarResumos(
  supabase: SupabaseClient,
  hoje: string,
  apenas?: string,
): Promise<ResumoPessoa[]> {
  const limite = somarDias(hoje, DIAS_A_FRENTE);

  let perfis = supabase.from("profiles").select("id, nome, email").eq("ativo", true);
  if (apenas) perfis = perfis.eq("id", apenas);
  const { data: pessoas, error } = await perfis;
  if (error) throw new Error(`Falha ao ler a equipe: ${error.message}`);

  const tarefas = await todasAsPaginas<LinhaTarefa>((de, ate) => {
    let q = supabase
      .from("tarefas")
      .select("prazo_legal, status, responsavel_id, cliente:clientes!inner(razao_social, fantasia), obrigacao:obrigacoes(nome)")
      .in("status", ABERTAS)
      .not("responsavel_id", "is", null)
      .lte("prazo_legal", limite)
      .order("prazo_legal")
      .order("id");
    if (apenas) q = q.eq("responsavel_id", apenas);
    return q.range(de, ate).overrideTypes<LinhaTarefa[], { merge: false }>();
  });

  const pessoais = await todasAsPaginas<LinhaPessoal>((de, ate) => {
    let q = supabase
      .from("tarefas_pessoais")
      .select("dono_id, titulo, prazo, cliente:clientes(razao_social)")
      .is("concluida_em", null)
      .lte("prazo", limite)
      .order("prazo")
      .order("id");
    if (apenas) q = q.eq("dono_id", apenas);
    return q.range(de, ate).overrideTypes<LinhaPessoal[], { merge: false }>();
  });

  const porPessoa = new Map<string, ResumoPessoa>(
    (pessoas ?? []).map((p) => [
      p.id as string,
      { id: p.id, nome: p.nome, email: p.email, atrasadas: [], hoje: [], proximas: [], pessoais: [] },
    ]),
  );

  for (const t of tarefas) {
    const r = porPessoa.get(t.responsavel_id);
    if (!r) continue; // responsável inativo
    const item: ItemResumo = {
      titulo: t.obrigacao?.nome ?? "Tarefa",
      detalhe: t.cliente?.fantasia || t.cliente?.razao_social || "",
      prazo: t.prazo_legal,
      aguardando: t.status === "aguardando_cliente",
    };
    if (t.prazo_legal < hoje) r.atrasadas.push(item);
    else if (t.prazo_legal === hoje) r.hoje.push(item);
    else r.proximas.push(item);
  }
  for (const p of pessoais) {
    porPessoa.get(p.dono_id)?.pessoais.push({
      titulo: p.titulo,
      detalhe: p.cliente?.razao_social ?? "",
      prazo: p.prazo,
      aguardando: false,
    });
  }
  return [...porPessoa.values()];
}

export const temConteudo = (r: ResumoPessoa) =>
  r.atrasadas.length + r.hoje.length + r.proximas.length + r.pessoais.length > 0;

// ---------------------------------------------------------------------------
// E-mail

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dataLonga = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

function secaoHtml(titulo: string, cor: string, itens: ItemResumo[], link: string) {
  if (itens.length === 0) return "";
  const linhas = itens
    .slice(0, LIMITE_POR_SECAO)
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #DCE3EB;font-size:14px">
          <strong>${escaparHtml(i.titulo)}</strong>${i.detalhe ? ` · ${escaparHtml(i.detalhe)}` : ""}
          ${i.aguardando ? '<span style="color:#7A4E00;font-size:12px"> · aguardando cliente</span>' : ""}
        </td>
        <td style="padding:8px 0 8px 12px;border-bottom:1px solid #DCE3EB;font-size:13px;color:#4A5868;text-align:right;white-space:nowrap">${dataCurta(i.prazo)}</td>
      </tr>`,
    )
    .join("");
  const mais =
    itens.length > LIMITE_POR_SECAO
      ? `<p style="margin:8px 0 0;font-size:13px"><a href="${link}" style="color:#003064">e mais ${itens.length - LIMITE_POR_SECAO} na plataforma</a></p>`
      : "";
  return `<h2 style="margin:24px 0 4px;font-size:15px;color:${cor}">${escaparHtml(titulo)} (${itens.length})</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>${mais}`;
}

function secaoTexto(titulo: string, itens: ItemResumo[]) {
  if (itens.length === 0) return "";
  const linhas = itens
    .slice(0, LIMITE_POR_SECAO)
    .map((i) => `- ${dataCurta(i.prazo)} ${i.titulo}${i.detalhe ? ` · ${i.detalhe}` : ""}${i.aguardando ? " (aguardando cliente)" : ""}`);
  if (itens.length > LIMITE_POR_SECAO) linhas.push(`  e mais ${itens.length - LIMITE_POR_SECAO}`);
  return `\n${titulo} (${itens.length})\n${linhas.join("\n")}\n`;
}

export function montarEmailResumo(r: ResumoPessoa, hoje: string, base: string) {
  const primeiroNome = r.nome.split(/\s+/)[0];
  const minhas = `${base}/minhas-tarefas`;
  const partes = [
    r.atrasadas.length && `${r.atrasadas.length} atrasada${r.atrasadas.length > 1 ? "s" : ""}`,
    r.hoje.length && `${r.hoje.length} para hoje`,
  ].filter(Boolean);
  const assunto = partes.length
    ? `Seu dia: ${partes.join(" e ")}`
    : `Seu resumo de ${dataCurta(hoje)}: ${r.proximas.length + r.pessoais.length} na semana`;

  const corpo = `<p>Bom dia, ${escaparHtml(primeiroNome)}. Este é o resumo de ${escaparHtml(dataLonga(hoje))}.</p>
    ${secaoHtml("Atrasadas", "#A4231A", r.atrasadas, `${minhas}?visao=atrasadas`)}
    ${secaoHtml("Vencem hoje", "#B54708", r.hoje, minhas)}
    ${secaoHtml(`Próximos ${DIAS_A_FRENTE} dias`, "#003064", r.proximas, `${minhas}?visao=semana`)}
    ${secaoHtml("Tarefas pessoais", "#1F3A5A", r.pessoais, minhas)}
    <p style="margin:28px 0 0"><a href="${minhas}" style="display:inline-block;background:#003064;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Abrir minhas tarefas</a></p>`;

  const texto = `Bom dia, ${primeiroNome}. Este é o resumo de ${dataLonga(hoje)}.
${secaoTexto("Atrasadas", r.atrasadas)}${secaoTexto("Vencem hoje", r.hoje)}${secaoTexto(`Próximos ${DIAS_A_FRENTE} dias`, r.proximas)}${secaoTexto("Tarefas pessoais", r.pessoais)}
Abrir minhas tarefas: ${minhas}`;

  return { assunto, html: modeloEmail({ titulo: "Seu resumo do dia", corpo }), texto };
}

// ---------------------------------------------------------------------------
// Execução agendada: não envia em fim de semana, feriado nacional nem duas
// vezes no mesmo dia (salvo ?forcar=1).

export async function executarResumoDiario(ctx: Contexto): Promise<ResultadoAutomacao> {
  if (!ctx.forcar) {
    const motivo = await motivoNaoUtil(ctx);
    if (motivo) return ignorado(motivo);
    if (await jaEnviadoHoje(ctx, AUTOMACAO_RESUMO)) return ignorado("O resumo de hoje já foi enviado.");
  }

  const resumos = (await coletarResumos(ctx.supabase, ctx.hoje)).filter(temConteudo);
  const { entregues, erros } = await enviarEmSequencia(
    resumos.map((r) => ({ item: r, email: { para: r.email, ...montarEmailResumo(r, ctx.hoje, ctx.base) } })),
  );
  return resultadoEnvio(
    resumos.length,
    entregues.length,
    erros,
    resumos.length === 0 ? "Ninguém tinha tarefas no período." : `${entregues.length} de ${resumos.length} resumos enviados.`,
  );
}
