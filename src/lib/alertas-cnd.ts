import "server-only";
import { escaparHtml, modeloEmail } from "@/lib/email";
import { botaoHtml, linhaClienteHtml, nomeCliente, primeiroNome, secaoHtml, type ClienteEmail } from "@/lib/email-blocos";
import {
  distribuirPorCliente,
  enviarEmSequencia,
  ignorado,
  resultadoEnvio,
  type Contexto,
  type Pessoa,
  type ResultadoAutomacao,
} from "@/lib/automacao-execucao";

// Automação "Mudança na situação da CND": envia por e-mail os alertas gravados
// pelo gatilho cnd_alerta (migration 20261110000200) que ainda não foram
// notificados. Gestores e admins recebem todos; os responsáveis do cliente, os
// dos seus clientes. Um alerta conta como notificado quando pelo menos um
// e-mail com ele foi entregue.

export const AUTOMACAO_ALERTAS_CND = "alertas_cnd";

export const ROTULO_CND: Record<string, string> = {
  federal: "Federal (RFB/PGFN)",
  fgts: "FGTS",
  trabalhista: "Trabalhista",
  estadual: "Estadual",
  municipal: "Municipal",
};

type Alerta = {
  id: number;
  clienteId: string;
  tipo: string;
  para: "regular" | "pendente";
  mensagem: string | null;
  cliente: ClienteEmail;
};

function montarEmail(p: Pessoa, alertas: Alerta[], base: string) {
  const pendentes = alertas.filter((a) => a.para === "pendente");
  const regularizados = alertas.filter((a) => a.para === "regular");
  const assunto = pendentes.length
    ? `CND: ${pendentes.length} ${pendentes.length === 1 ? "certidão passou" : "certidões passaram"} a ter pendência`
    : `CND: ${regularizados.length} ${regularizados.length === 1 ? "certidão regularizada" : "certidões regularizadas"}`;
  const linha = (a: Alerta) => linhaClienteHtml(a.cliente, base, [ROTULO_CND[a.tipo] ?? a.tipo, ...(a.mensagem ? [a.mensagem] : [])]);
  const corpo = `<p>Olá, ${escaparHtml(primeiroNome(p.nome))}. As últimas consultas de certidões mudaram a situação destes clientes:</p>
    ${secaoHtml(`Passaram a ter pendência (${pendentes.length})`, "#A4231A", pendentes.map(linha))}
    ${secaoHtml(`Regularizaram (${regularizados.length})`, "#17603F", regularizados.map(linha))}
    ${botaoHtml(`${base}/cnd`, "Abrir certidões")}`;
  const texto = (lista: Alerta[]) =>
    lista.map((a) => `- ${nomeCliente(a.cliente)} · ${ROTULO_CND[a.tipo] ?? a.tipo}${a.mensagem ? ` · ${a.mensagem}` : ""}`).join("\n");
  return {
    assunto,
    html: modeloEmail({ titulo: "Mudança na situação das certidões", corpo }),
    texto: [
      `Olá, ${primeiroNome(p.nome)}. As últimas consultas de certidões mudaram a situação destes clientes:`,
      pendentes.length ? `\nPassaram a ter pendência (${pendentes.length})\n${texto(pendentes)}` : "",
      regularizados.length ? `\nRegularizaram (${regularizados.length})\n${texto(regularizados)}` : "",
      `\nAbrir certidões: ${base}/cnd`,
    ].join("\n"),
  };
}

export async function executarAlertasCnd({ supabase, base }: Contexto): Promise<ResultadoAutomacao> {
  const { data, error } = await supabase
    .from("cnd_alertas")
    .select("id, tipo, para, mensagem, cliente:clientes!inner(id, razao_social, fantasia, documento, tipo_inscricao)")
    .is("notificado_em", null)
    .order("para", { ascending: false }) // pendente antes de regular
    .order("criado_em")
    .limit(500)
    .overrideTypes<Omit<Alerta, "clienteId">[], { merge: false }>();
  if (error) throw new Error(`Falha ao ler os alertas: ${error.message}`);
  const alertas: Alerta[] = (data ?? []).map((a) => ({ ...a, clienteId: a.cliente.id }));
  if (alertas.length === 0) return ignorado("Nenhuma mudança de situação desde o último envio.");

  const destinos = await distribuirPorCliente(supabase, alertas);
  const { entregues, erros } = await enviarEmSequencia(
    destinos.map((d) => ({ item: d, email: { para: d.pessoa.email, ...montarEmail(d.pessoa, d.itens, base) } })),
  );

  const notificados = new Set(entregues.flatMap((d) => d.itens.map((a) => a.id)));
  if (notificados.size) {
    const { error: e } = await supabase
      .from("cnd_alertas")
      .update({ notificado_em: new Date().toISOString() })
      .in("id", [...notificados]);
    if (e) throw new Error(`E-mails enviados, mas falhou ao marcar os alertas: ${e.message}`);
  }

  const pendencias = alertas.filter((a) => a.para === "pendente").length;
  const sobra = alertas.length - notificados.size;
  const r = resultadoEnvio(
    destinos.length,
    entregues.length,
    erros,
    `${alertas.length} ${alertas.length === 1 ? "mudança" : "mudanças"} (${pendencias} com pendência) · ${entregues.length} e-mails enviados.` +
      (sobra ? ` ${sobra} ficam para a próxima execução.` : ""),
  );
  return sobra && r.status === "sucesso" ? { ...r, status: "parcial" } : r;
}
