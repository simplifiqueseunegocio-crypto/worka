import "server-only";
import { escaparHtml, modeloEmail } from "@/lib/email";
import { botaoHtml, dataBR, linhaHtml, nomeCliente, primeiroNome, secaoHtml } from "@/lib/email-blocos";
import {
  enviarEmSequencia,
  gestoresEAdmins,
  ignorado,
  motivoNaoUtil,
  responsaveisPorCliente,
  resultadoEnvio,
  type Contexto,
  type Pessoa,
  type ResultadoAutomacao,
} from "@/lib/automacao-execucao";
import { diasAte, marcoDevido, quando, TIPOS_VENCIMENTO, type TipoVencimento } from "@/lib/vencimentos-regras";

// Monitor de vencimentos: nos dias úteis, avisa por e-mail os itens que chegaram
// a um marco (avisar_dias, 15, 7, 1, 0 e vencido; ver vencimentos-regras.ts).
// Item de cliente: gestores, admins e os responsáveis do cliente. Item do
// escritório (sem cliente): gestores e admins.

export const AUTOMACAO_MONITOR_VENCIMENTOS = "monitor_vencimentos";

type Item = {
  id: string;
  tipo: TipoVencimento;
  descricao: string;
  identificador: string | null;
  vence_em: string;
  avisar_dias: number;
  ultimo_marco: number | null;
  cliente: { id: string; razao_social: string; fantasia: string | null } | null;
  dias: number;
  marco: number;
};

function montarEmail(p: Pessoa, itens: Item[], base: string) {
  const vencidos = itens.filter((i) => i.dias < 0);
  const vencendo = itens.filter((i) => i.dias >= 0);
  // linhaHtml não escapa o texto nem a nota: a descrição é digitada pela equipe.
  const linha = (i: Item) =>
    linhaHtml(
      escaparHtml(`${TIPOS_VENCIMENTO[i.tipo]} · ${i.descricao}${i.identificador ? ` (${i.identificador})` : ""}`),
      `${quando(i.dias)} · ${dataBR(i.vence_em)}`,
      escaparHtml(i.cliente ? nomeCliente(i.cliente) : "Escritório"),
    );
  const corpo = `<p>Olá, ${escaparHtml(primeiroNome(p.nome))}. Estes itens do Monitor de vencimentos pedem atenção:</p>
    ${vencidos.length ? secaoHtml(`Vencidos (${vencidos.length})`, "#A4231A", vencidos.map(linha)) : ""}
    ${vencendo.length ? secaoHtml(`Vencendo (${vencendo.length})`, "#B54708", vencendo.map(linha)) : ""}
    <p style="color:#4a5868;font-size:13px">Renovou? Atualize a data no monitor e os avisos recomeçam para a nova data.</p>
    ${botaoHtml(`${base}/automacoes/vencimentos`, "Abrir o monitor")}`;
  const texto = [
    `Olá, ${primeiroNome(p.nome)}. Estes itens do Monitor de vencimentos pedem atenção:`,
    ...itens.map((i) => `- ${i.cliente ? nomeCliente(i.cliente) : "Escritório"} · ${TIPOS_VENCIMENTO[i.tipo]} · ${i.descricao} · ${quando(i.dias)} (${dataBR(i.vence_em)})`),
    `\nAbrir o monitor: ${base}/automacoes/vencimentos`,
  ].join("\n");
  const assunto = vencidos.length
    ? `${vencidos.length} ${vencidos.length === 1 ? "item vencido" : "itens vencidos"}${vencendo.length ? ` e ${vencendo.length} vencendo` : ""}`
    : `${vencendo.length} ${vencendo.length === 1 ? "item vence" : "itens vencem"} em breve`;
  return { assunto: `Vencimentos: ${assunto}`, html: modeloEmail({ titulo: "Monitor de vencimentos", corpo }), texto };
}

export async function executarMonitorVencimentos(ctx: Contexto): Promise<ResultadoAutomacao> {
  const { supabase, hoje, base } = ctx;
  if (!ctx.forcar) {
    const motivo = await motivoNaoUtil(ctx);
    if (motivo) return ignorado(motivo);
  }

  const { data, error } = await supabase
    .from("vencimentos")
    .select("id, tipo, descricao, identificador, vence_em, avisar_dias, ultimo_marco, cliente:clientes(id, razao_social, fantasia)")
    .eq("ativo", true)
    .lte("vence_em", new Date(Date.parse(`${hoje}T12:00:00Z`) + 181 * 86_400_000).toISOString().slice(0, 10))
    .order("vence_em")
    .limit(2000)
    .overrideTypes<Omit<Item, "dias" | "marco">[], { merge: false }>();
  if (error) throw new Error(`Falha ao ler os vencimentos: ${error.message}`);

  const devidos: Item[] = [];
  for (const v of data ?? []) {
    const dias = diasAte(v.vence_em, hoje);
    const marco = marcoDevido(dias, v.avisar_dias, v.ultimo_marco);
    if (marco !== null) devidos.push({ ...v, dias, marco });
  }
  if (!devidos.length) return ignorado("Nenhum vencimento chegou a um marco de aviso hoje.");

  // Destinatários: gestores/admins recebem tudo; responsáveis, só dos seus clientes.
  const [chefes, responsaveis] = await Promise.all([
    gestoresEAdmins(supabase),
    responsaveisPorCliente(supabase, [...new Set(devidos.flatMap((i) => (i.cliente ? [i.cliente.id] : [])))]),
  ]);
  const destinos = new Map<string, { pessoa: Pessoa; itens: Item[] }>();
  for (const p of chefes) destinos.set(p.id, { pessoa: p, itens: devidos });
  for (const i of devidos) {
    if (!i.cliente) continue;
    for (const p of responsaveis.get(i.cliente.id) ?? []) {
      if (chefes.some((c) => c.id === p.id)) continue;
      const d = destinos.get(p.id) ?? { pessoa: p, itens: [] };
      d.itens.push(i);
      destinos.set(p.id, d);
    }
  }
  const lista = [...destinos.values()].filter((d) => d.itens.length && d.pessoa.email);
  const { entregues, erros } = await enviarEmSequencia(lista.map((d) => ({ item: d, email: { para: d.pessoa.email, ...montarEmail(d.pessoa, d.itens, base) } })));

  // Marca o marco avisado dos itens que chegaram a alguém.
  const avisados = new Map<string, number>();
  for (const d of entregues) for (const i of d.itens) avisados.set(i.id, i.marco);
  for (const [id, marco] of avisados) {
    const { error: e } = await supabase.from("vencimentos").update({ ultimo_marco: marco, ultimo_aviso_em: new Date().toISOString() }).eq("id", id);
    if (e) throw new Error(`E-mails enviados, mas falhou ao marcar os avisos: ${e.message}`);
  }

  const vencidos = devidos.filter((i) => i.dias < 0).length;
  return resultadoEnvio(
    lista.length,
    entregues.length,
    erros,
    `${devidos.length} ${devidos.length === 1 ? "item avisado" : "itens avisados"}${vencidos ? ` (${vencidos} vencido${vencidos === 1 ? "" : "s"})` : ""} · ${entregues.length} e-mails enviados.`,
  );
}
