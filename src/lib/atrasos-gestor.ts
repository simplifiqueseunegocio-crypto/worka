import "server-only";
import { escaparHtml, modeloEmail } from "@/lib/email";
import { botaoHtml, dataBR, linhaHtml, maisHtml, nomeCliente, primeiroNome, secaoHtml } from "@/lib/email-blocos";
import {
  enviarEmSequencia,
  ignorado,
  jaEnviadoHoje,
  motivoNaoUtil,
  resultadoEnvio,
  type Contexto,
  type Pessoa,
  type ResultadoAutomacao,
} from "@/lib/automacao-execucao";

// Automação "Alerta de atraso para o gestor": nos dias úteis, cada gestor
// recebe as tarefas abertas dos seus departamentos que passaram da meta
// interna, separando as que já venceram o prazo legal. Admins recebem todas.

export const AUTOMACAO_ATRASOS = "atrasos_gestor";
const LIMITE_POR_SECAO = 25;

type Tarefa = {
  id: string;
  prazo_legal: string;
  prazo_meta: string;
  departamento_id: number;
  cliente: { razao_social: string; fantasia: string | null };
  obrigacao: { nome: string } | null;
  responsavel: { nome: string } | null;
  departamento: { nome: string } | null;
};

async function tarefasAtrasadas({ supabase, hoje }: Contexto) {
  const linhas: Tarefa[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("tarefas")
      .select(
        "id, prazo_legal, prazo_meta, departamento_id, cliente:clientes!inner(razao_social, fantasia), obrigacao:obrigacoes(nome), responsavel:profiles!responsavel_id(nome), departamento:departamentos(nome)",
      )
      .in("status", ["pendente", "em_andamento", "aguardando_cliente"])
      .lt("prazo_meta", hoje)
      .order("prazo_legal")
      .order("id")
      .range(de, de + 999)
      .overrideTypes<Tarefa[], { merge: false }>();
    if (error) throw new Error(`Falha ao ler as tarefas: ${error.message}`);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) return linhas;
  }
}

// Gestores com os departamentos que gerem; admins com null (todos).
async function destinatarios({ supabase }: Contexto) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, email, papel, departamentos:profile_departamentos(departamento_id)")
    .eq("ativo", true)
    .in("papel", ["admin", "gestor"])
    .overrideTypes<(Pessoa & { papel: string; departamentos: { departamento_id: number }[] })[], { merge: false }>();
  if (error) throw new Error(`Falha ao ler os gestores: ${error.message}`);
  return (data ?? []).map((p) => ({
    pessoa: { id: p.id, nome: p.nome, email: p.email },
    departamentos: p.papel === "admin" ? null : new Set(p.departamentos.map((d) => d.departamento_id)),
  }));
}

function montarEmail(p: Pessoa, tarefas: Tarefa[], hoje: string, base: string) {
  const vencidas = tarefas.filter((t) => t.prazo_legal < hoje);
  const meta = tarefas.filter((t) => t.prazo_legal >= hoje);

  const porResponsavel = new Map<string, number>();
  for (const t of tarefas) {
    const nome = t.responsavel?.nome ?? "Sem responsável";
    porResponsavel.set(nome, (porResponsavel.get(nome) ?? 0) + 1);
  }
  const ranking = [...porResponsavel].sort((a, b) => b[1] - a[1]);

  const linha = (t: Tarefa, prazo: string) =>
    linhaHtml(
      `<strong>${escaparHtml(t.obrigacao?.nome ?? "Tarefa")}</strong> · ${escaparHtml(nomeCliente(t.cliente))}`,
      prazo,
      escaparHtml(`${t.responsavel?.nome ?? "Sem responsável"}${t.departamento ? ` · ${t.departamento.nome}` : ""}`),
    );

  const corpo = `<p>Olá, ${escaparHtml(primeiroNome(p.nome))}. Estas tarefas dos seus departamentos passaram da meta interna e ainda estão abertas.</p>
    <p style="font-size:13px;color:#4A5868">Por responsável: ${ranking.map(([n, q]) => `${escaparHtml(n)} <strong>${q}</strong>`).join(" · ")}</p>
    ${secaoHtml(
      `Prazo legal vencido (${vencidas.length})`,
      "#A4231A",
      vencidas.slice(0, LIMITE_POR_SECAO).map((t) => linha(t, `venceu ${dataBR(t.prazo_legal).slice(0, 5)}`)),
      maisHtml(`${base}/tarefas?status=atrasada`, vencidas.length - LIMITE_POR_SECAO),
    )}
    ${secaoHtml(
      `Passaram da meta interna (${meta.length})`,
      "#B54708",
      meta.slice(0, LIMITE_POR_SECAO).map((t) => linha(t, `vence ${dataBR(t.prazo_legal).slice(0, 5)}`)),
      maisHtml(`${base}/tarefas?prazo=7d`, meta.length - LIMITE_POR_SECAO),
    )}
    ${botaoHtml(`${base}/tarefas?status=atrasada`, "Abrir tarefas atrasadas")}`;

  const texto = [
    `Olá, ${primeiroNome(p.nome)}. Estas tarefas dos seus departamentos passaram da meta interna e ainda estão abertas.`,
    `Por responsável: ${ranking.map(([n, q]) => `${n} ${q}`).join(" · ")}`,
    vencidas.length ? `\nPrazo legal vencido (${vencidas.length})` : "",
    ...vencidas.slice(0, LIMITE_POR_SECAO).map((t) => `- ${t.obrigacao?.nome ?? "Tarefa"} · ${nomeCliente(t.cliente)} · ${t.responsavel?.nome ?? "sem responsável"} · venceu ${dataBR(t.prazo_legal)}`),
    meta.length ? `\nPassaram da meta interna (${meta.length})` : "",
    ...meta.slice(0, LIMITE_POR_SECAO).map((t) => `- ${t.obrigacao?.nome ?? "Tarefa"} · ${nomeCliente(t.cliente)} · ${t.responsavel?.nome ?? "sem responsável"} · vence ${dataBR(t.prazo_legal)}`),
    `\nAbrir tarefas: ${base}/tarefas?status=atrasada`,
  ].join("\n");

  const assunto =
    vencidas.length > 0
      ? `Atrasos: ${vencidas.length} com prazo vencido${meta.length ? ` e ${meta.length} fora da meta` : ""}`
      : `Atrasos: ${meta.length} ${meta.length === 1 ? "tarefa passou" : "tarefas passaram"} da meta interna`;
  return { assunto, html: modeloEmail({ titulo: "Tarefas fora do prazo", corpo }), texto };
}

export async function executarAtrasosGestor(ctx: Contexto): Promise<ResultadoAutomacao> {
  if (!ctx.forcar) {
    const motivo = await motivoNaoUtil(ctx);
    if (motivo) return ignorado(motivo);
    if (await jaEnviadoHoje(ctx, AUTOMACAO_ATRASOS)) return ignorado("O alerta de hoje já foi enviado.");
  }

  const [tarefas, pessoas] = await Promise.all([tarefasAtrasadas(ctx), destinatarios(ctx)]);
  if (tarefas.length === 0) return ignorado("Nenhuma tarefa aberta fora da meta interna.");

  const envios = pessoas
    .map((d) => ({ ...d, tarefas: d.departamentos ? tarefas.filter((t) => d.departamentos!.has(t.departamento_id)) : tarefas }))
    .filter((d) => d.tarefas.length && d.pessoa.email);
  const { entregues, erros } = await enviarEmSequencia(
    envios.map((d) => ({ item: d, email: { para: d.pessoa.email, ...montarEmail(d.pessoa, d.tarefas, ctx.hoje, ctx.base) } })),
  );
  const vencidas = tarefas.filter((t) => t.prazo_legal < ctx.hoje).length;
  return resultadoEnvio(
    envios.length,
    entregues.length,
    erros,
    `${tarefas.length} tarefas fora da meta (${vencidas} com prazo vencido) · ${entregues.length} de ${envios.length} gestores avisados.`,
  );
}
