import "server-only";
import { escaparHtml, modeloEmail } from "@/lib/email";
import { botaoHtml, dataBR, linhaClienteHtml, nomeCliente, primeiroNome, secaoHtml, type ClienteEmail } from "@/lib/email-blocos";
import {
  distribuirPorCliente,
  enviarEmSequencia,
  ignorado,
  motivoNaoUtil,
  resultadoEnvio,
  type Contexto,
  type Pessoa,
  type ResultadoAutomacao,
} from "@/lib/automacao-execucao";
import { somarDias } from "@/lib/tarefas";

// Automação "CND perto de vencer": nos dias úteis, procura as certidões
// lançadas (tabela certidoes) que vencem nos próximos 15 dias e ainda não
// foram avisadas. Para cada uma:
//   - se o tipo tem consulta automática e o cliente está na busca de CND,
//     coloca o cliente na fila de consultas (enfileirar_cnd_interno);
//   - avisa por e-mail gestores, admins e os responsáveis do cliente.
// Só conta a certidão mais recente de cada cliente e tipo: se já lançaram uma
// nova, a antiga não gera aviso. Cada certidão é avisada uma vez.

export const AUTOMACAO_CND_VENCENDO = "cnd_vencendo";
const DIAS_ANTES = 15;

type Certidao = {
  id: string;
  clienteId: string;
  tipo_id: number;
  emitida_em: string;
  valida_ate: string;
  cliente: ClienteEmail & { status: string; busca_cnd: boolean };
  tipo: { nome: string; cnd_tipo: string | null };
};

function montarEmail(p: Pessoa, certidoes: Certidao[], hoje: string, base: string, reconsultados: Set<string>) {
  const dias = (iso: string) => Math.round((Date.parse(iso) - Date.parse(hoje)) / 86_400_000);
  const quando = (c: Certidao) => {
    const d = dias(c.valida_ate);
    return d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${d} dias (${dataBR(c.valida_ate)})`;
  };
  const linha = (c: Certidao) =>
    linhaClienteHtml(c.cliente, base, [
      `${c.tipo.nome} · ${quando(c)}`,
      ...(reconsultados.has(c.clienteId) && c.tipo.cnd_tipo ? ["Nova consulta automática já colocada na fila."] : []),
    ]);
  const corpo = `<p>Olá, ${escaparHtml(primeiroNome(p.nome))}. Estas certidões vencem nos próximos ${DIAS_ANTES} dias. Vale emitir a nova e lançá-la na plataforma.</p>
    ${secaoHtml(`Certidões vencendo (${certidoes.length})`, "#B54708", certidoes.map(linha))}
    ${botaoHtml(`${base}/cnd`, "Abrir certidões")}`;
  const texto = [
    `Olá, ${primeiroNome(p.nome)}. Estas certidões vencem nos próximos ${DIAS_ANTES} dias:`,
    ...certidoes.map((c) => `- ${nomeCliente(c.cliente)} · ${c.tipo.nome} · ${quando(c)}`),
    `\nAbrir certidões: ${base}/cnd`,
  ].join("\n");
  return {
    assunto: `${certidoes.length} ${certidoes.length === 1 ? "certidão vence" : "certidões vencem"} nos próximos ${DIAS_ANTES} dias`,
    html: modeloEmail({ titulo: "Certidões perto de vencer", corpo }),
    texto,
  };
}

export async function executarCndVencendo(ctx: Contexto): Promise<ResultadoAutomacao> {
  const { supabase, hoje, base } = ctx;
  if (!ctx.forcar) {
    const motivo = await motivoNaoUtil(ctx);
    if (motivo) return ignorado(motivo);
  }

  const { data, error } = await supabase
    .from("certidoes")
    .select(
      "id, tipo_id, emitida_em, valida_ate, cliente:clientes!inner(id, razao_social, fantasia, documento, tipo_inscricao, status, busca_cnd), tipo:certidao_tipos!inner(nome, cnd_tipo)",
    )
    .is("aviso_vencimento_em", null)
    .gte("valida_ate", hoje)
    .lte("valida_ate", somarDias(hoje, DIAS_ANTES))
    .eq("cliente.status", "ativo")
    .order("valida_ate")
    .limit(500)
    .overrideTypes<Omit<Certidao, "clienteId">[], { merge: false }>();
  if (error) throw new Error(`Falha ao ler as certidões: ${error.message}`);
  const candidatas: Certidao[] = (data ?? []).map((c) => ({ ...c, clienteId: c.cliente.id }));
  if (candidatas.length === 0) return ignorado("Nenhuma certidão vencendo nos próximos 15 dias.");

  // Descarta as que já têm uma certidão mais nova do mesmo tipo.
  const { data: recentes, error: e1 } = await supabase
    .from("certidoes")
    .select("id, cliente_id, tipo_id, emitida_em")
    .in("cliente_id", [...new Set(candidatas.map((c) => c.clienteId))]);
  if (e1) throw new Error(`Falha ao ler as certidões: ${e1.message}`);
  const substituida = (c: Certidao) =>
    (recentes ?? []).some(
      (r) => r.cliente_id === c.clienteId && r.tipo_id === c.tipo_id && r.id !== c.id && r.emitida_em > c.emitida_em,
    );
  const antigas = candidatas.filter(substituida);
  const certidoes = candidatas.filter((c) => !substituida(c));

  // Nova consulta automática para quem está na busca de CND.
  const reconsultados = new Set<string>();
  for (const id of new Set(certidoes.filter((c) => c.tipo.cnd_tipo && c.cliente.busca_cnd).map((c) => c.clienteId))) {
    const { error: e } = await supabase.rpc("enfileirar_cnd_interno", { p_cliente_id: id, p_origem: "agendada", p_solicitante: null });
    if (e) console.error("Falha ao enfileirar CND do cliente", id, e);
    else reconsultados.add(id);
  }

  const destinos = certidoes.length ? await distribuirPorCliente(supabase, certidoes) : [];
  const { entregues, erros } = await enviarEmSequencia(
    destinos.map((d) => ({ item: d, email: { para: d.pessoa.email, ...montarEmail(d.pessoa, d.itens, hoje, base, reconsultados) } })),
  );

  // Avisadas: as entregues em pelo menos um e-mail e as já substituídas.
  const avisadas = new Set([...entregues.flatMap((d) => d.itens.map((c) => c.id)), ...antigas.map((c) => c.id)]);
  if (avisadas.size) {
    const { error: e2 } = await supabase
      .from("certidoes")
      .update({ aviso_vencimento_em: new Date().toISOString() })
      .in("id", [...avisadas]);
    if (e2) throw new Error(`E-mails enviados, mas falhou ao marcar as certidões: ${e2.message}`);
  }

  return resultadoEnvio(
    destinos.length,
    entregues.length,
    erros,
    certidoes.length
      ? `${certidoes.length} ${certidoes.length === 1 ? "certidão vencendo" : "certidões vencendo"} · ${reconsultados.size} na fila de consulta · ${entregues.length} e-mails enviados.`
      : "As certidões vencendo já foram substituídas por outras mais novas.",
  );
}
