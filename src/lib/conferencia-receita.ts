import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigurado, escaparHtml, modeloEmail } from "@/lib/email";
import { botaoHtml, linhaClienteHtml, nomeCliente, primeiroNome, secaoHtml, type ClienteEmail } from "@/lib/email-blocos";
import {
  distribuirPorCliente,
  enviarEmSequencia,
  motivoNaoUtil,
  resultadoEnvio,
  type Contexto,
  type Pessoa,
  type ResultadoAutomacao,
} from "@/lib/automacao-execucao";

// Automação "Conferência na Receita": todo dia consulta na BrasilAPI um lote
// dos CNPJs ativos da carteira (os conferidos há mais tempo primeiro) e
// compara com a foto anterior (cliente_receita). Mudança de situação
// cadastral, CNAE principal, endereço, Simples ou MEI vira um alerta
// (receita_alertas). Na primeira conferência de um cliente só gera alerta se
// ele não estiver ATIVO na Receita.
//
// Nos dias úteis, os alertas pendentes saem por e-mail para gestores, admins e
// os responsáveis do cliente. A consulta roda também no fim de semana (para a
// carteira girar mais rápido); os alertas ficam para o próximo dia útil.

export const AUTOMACAO_RECEITA = "conferencia_receita";
const LOTE = 50;
const PAUSA_ENTRE_CONSULTAS_MS = 1200;
const INTERVALO_MINIMO_DIAS = 20; // não reconsulta quem foi conferido há menos tempo

type Foto = {
  situacao: string | null;
  data_situacao: string | null;
  cnae: number | null;
  cnae_descricao: string | null;
  endereco: string | null;
  simples: boolean | null;
  mei: boolean | null;
};
type Campo = "situacao" | "cnae" | "endereco" | "simples" | "mei";

const ROTULO: Record<Campo, string> = {
  situacao: "Situação cadastral",
  cnae: "CNAE principal",
  endereco: "Endereço",
  simples: "Simples Nacional",
  mei: "MEI",
};

const simNao = (v: boolean | null, sim: string, nao: string) => (v === null ? null : v ? sim : nao);
const textoCampo = (campo: Campo, f: Foto): string | null => {
  if (campo === "situacao") return f.situacao;
  if (campo === "cnae") return f.cnae ? `${f.cnae}${f.cnae_descricao ? ` · ${f.cnae_descricao}` : ""}` : null;
  if (campo === "endereco") return f.endereco;
  if (campo === "simples") return simNao(f.simples, "Optante", "Não optante");
  return simNao(f.mei, "Optante", "Não optante");
};
const mudou = (campo: Campo, a: Foto, b: Foto) =>
  campo === "cnae" ? a.cnae !== b.cnae : campo === "endereco" ? normalizar(a.endereco) !== normalizar(b.endereco) : a[campo] !== b[campo];
const normalizar = (s: string | null) => (s ?? "").normalize("NFD").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

class LimiteBrasilApi extends Error {}

async function consultarCnpj(cnpj: string): Promise<Foto> {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { accept: "application/json", "user-agent": "PlataformaMCONT/1.0" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (r.status === 429) throw new LimiteBrasilApi("Limite de consultas da BrasilAPI atingido.");
  if (!r.ok) {
    const corpo = await r.json().catch(() => null);
    throw new Error(corpo?.message ?? `BrasilAPI respondeu ${r.status}.`);
  }
  const j = await r.json();
  const endereco = [
    [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" "),
    j.numero,
    j.bairro,
    j.municipio && j.uf ? `${j.municipio}/${j.uf}` : j.municipio,
    j.cep ? `CEP ${String(j.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    situacao: j.descricao_situacao_cadastral ?? null,
    data_situacao: j.data_situacao_cadastral ?? null,
    cnae: j.cnae_fiscal ?? null,
    cnae_descricao: j.cnae_fiscal_descricao ?? null,
    endereco: endereco || null,
    simples: typeof j.opcao_pelo_simples === "boolean" ? j.opcao_pelo_simples : null,
    mei: typeof j.opcao_pelo_mei === "boolean" ? j.opcao_pelo_mei : null,
  };
}

// Escolhe o lote: CNPJs de clientes ativos, nunca conferidos primeiro, depois
// os conferidos há mais tempo.
async function escolherLote(supabase: SupabaseClient) {
  const [{ data: clientes, error: e1 }, { data: fotos, error: e2 }] = await Promise.all([
    supabase.from("clientes").select("id, documento, tipo_inscricao").eq("status", "ativo").limit(10_000),
    supabase.from("cliente_receita").select("*").limit(10_000),
  ]);
  if (e1 || e2) throw new Error(`Falha ao ler a carteira: ${(e1 ?? e2)!.message}`);
  const porCliente = new Map((fotos ?? []).map((f) => [f.cliente_id as string, f as Foto & { verificado_em: string; erro: string | null }]));
  const limite = Date.now() - INTERVALO_MINIMO_DIAS * 86_400_000;
  return (clientes ?? [])
    .map((c) => ({ ...c, cnpj: String(c.documento).replace(/\D/g, ""), foto: porCliente.get(c.id) }))
    .filter((c) => c.cnpj.length === 14 && c.tipo_inscricao !== 6) // CAEPF não está na base de CNPJ
    .filter((c) => !c.foto || Date.parse(c.foto.verificado_em) < limite)
    .sort((a, b) => (a.foto ? Date.parse(a.foto.verificado_em) : 0) - (b.foto ? Date.parse(b.foto.verificado_em) : 0))
    .slice(0, LOTE);
}

async function conferirLote(supabase: SupabaseClient) {
  const lote = await escolherLote(supabase);
  let conferidos = 0;
  let falhas = 0;
  let alertas = 0;
  let parouNoLimite = false;

  for (const [i, c] of lote.entries()) {
    if (i > 0) await new Promise((ok) => setTimeout(ok, PAUSA_ENTRE_CONSULTAS_MS));
    let nova: Foto;
    try {
      nova = await consultarCnpj(c.cnpj);
    } catch (e) {
      if (e instanceof LimiteBrasilApi) {
        parouNoLimite = true;
        break;
      }
      falhas++;
      await supabase.from("cliente_receita").upsert(
        { cliente_id: c.id, verificado_em: new Date().toISOString(), erro: e instanceof Error ? e.message.slice(0, 300) : "Falha" },
        { onConflict: "cliente_id" },
      );
      continue;
    }

    const antiga = c.foto && c.foto.situacao !== null ? c.foto : null;
    const novos = antiga
      ? (Object.keys(ROTULO) as Campo[])
          .filter((campo) => textoCampo(campo, nova) !== null && mudou(campo, antiga, nova))
          .map((campo) => ({ cliente_id: c.id, campo, de: textoCampo(campo, antiga), para: textoCampo(campo, nova) }))
      : nova.situacao && nova.situacao !== "ATIVA"
        ? [{ cliente_id: c.id, campo: "situacao" as const, de: null, para: nova.situacao }]
        : [];
    if (novos.length) {
      const { error } = await supabase.from("receita_alertas").insert(novos);
      if (error) throw new Error(`Falha ao gravar alertas: ${error.message}`);
      alertas += novos.length;
    }
    const { error } = await supabase
      .from("cliente_receita")
      .upsert({ cliente_id: c.id, verificado_em: new Date().toISOString(), erro: null, ...nova }, { onConflict: "cliente_id" });
    if (error) throw new Error(`Falha ao gravar a conferência: ${error.message}`);
    conferidos++;
  }
  return { lote: lote.length, conferidos, falhas, alertas, parouNoLimite };
}

// ---------------------------------------------------------------------------
// Envio dos alertas

type Alerta = { id: number; clienteId: string; campo: Campo; de: string | null; para: string | null; cliente: ClienteEmail };

function montarEmail(p: Pessoa, alertas: Alerta[], base: string) {
  const porCliente = new Map<string, Alerta[]>();
  for (const a of alertas) porCliente.set(a.clienteId, [...(porCliente.get(a.clienteId) ?? []), a]);
  const grave = (lista: Alerta[]) => lista.some((a) => a.campo === "situacao" || (a.campo === "simples" && a.para === "Não optante"));
  const grupos = [...porCliente.values()].sort((a, b) => Number(grave(b)) - Number(grave(a)));

  const linha = (lista: Alerta[]) =>
    linhaClienteHtml(
      lista[0].cliente,
      base,
      lista.flatMap((a) => [`${ROTULO[a.campo]}: ${a.de ?? "—"} → ${a.para ?? "—"}`]),
    );
  const corpo = `<p>Olá, ${escaparHtml(primeiroNome(p.nome))}. A conferência na Receita encontrou mudanças no cadastro destes clientes:</p>
    ${secaoHtml(`Mudanças cadastrais (${grupos.length})`, "#003064", grupos.map(linha))}
    <p style="margin:16px 0 0;font-size:12px;color:#4A5868">Fonte: BrasilAPI (dados públicos do CNPJ na Receita Federal).</p>
    ${botaoHtml(`${base}/clientes`, "Abrir clientes")}`;
  const texto = [
    `Olá, ${primeiroNome(p.nome)}. A conferência na Receita encontrou mudanças no cadastro destes clientes:`,
    ...grupos.flatMap((lista) => [
      `\n${nomeCliente(lista[0].cliente)}`,
      ...lista.map((a) => `- ${ROTULO[a.campo]}: ${a.de ?? "—"} → ${a.para ?? "—"}`),
    ]),
    `\nAbrir clientes: ${base}/clientes`,
  ].join("\n");
  const situacao = alertas.filter((a) => a.campo === "situacao").length;
  return {
    assunto: situacao
      ? `Receita: ${situacao} ${situacao === 1 ? "cliente mudou" : "clientes mudaram"} de situação cadastral`
      : `Receita: mudanças no cadastro de ${grupos.length} ${grupos.length === 1 ? "cliente" : "clientes"}`,
    html: modeloEmail({ titulo: "Mudanças no cadastro da Receita", corpo }),
    texto,
  };
}

async function enviarAlertas({ supabase, base }: Contexto) {
  const { data, error } = await supabase
    .from("receita_alertas")
    .select("id, campo, de, para, cliente:clientes!inner(id, razao_social, fantasia, documento, tipo_inscricao)")
    .is("notificado_em", null)
    .order("criado_em")
    .limit(500)
    .overrideTypes<Omit<Alerta, "clienteId">[], { merge: false }>();
  if (error) throw new Error(`Falha ao ler os alertas: ${error.message}`);
  const alertas: Alerta[] = (data ?? []).map((a) => ({ ...a, clienteId: a.cliente.id }));
  if (alertas.length === 0) return { total: 0, destinos: 0, entregues: 0, erros: [] as { para: string; erro: string }[] };

  const destinos = await distribuirPorCliente(supabase, alertas);
  const { entregues, erros } = await enviarEmSequencia(
    destinos.map((d) => ({ item: d, email: { para: d.pessoa.email, ...montarEmail(d.pessoa, d.itens, base) } })),
  );
  const notificados = [...new Set(entregues.flatMap((d) => d.itens.map((a) => a.id)))];
  if (notificados.length) {
    const { error: e } = await supabase.from("receita_alertas").update({ notificado_em: new Date().toISOString() }).in("id", notificados);
    if (e) throw new Error(`E-mails enviados, mas falhou ao marcar os alertas: ${e.message}`);
  }
  return { total: alertas.length, destinos: destinos.length, entregues: entregues.length, erros };
}

export async function executarConferenciaReceita(ctx: Contexto): Promise<ResultadoAutomacao> {
  const c = await conferirLote(ctx.supabase);
  const partes = [
    c.lote === 0
      ? "Toda a carteira foi conferida nos últimos 20 dias."
      : `${c.conferidos} de ${c.lote} CNPJs conferidos${c.falhas ? ` (${c.falhas} com falha)` : ""} · ${c.alertas} ${c.alertas === 1 ? "mudança encontrada" : "mudanças encontradas"}.`,
  ];
  if (c.parouNoLimite) partes.push("Parou no limite da BrasilAPI; o restante fica para amanhã.");

  const naoUtil = await motivoNaoUtil(ctx);
  if (!emailConfigurado() || (naoUtil && !ctx.forcar)) {
    partes.push(naoUtil ? "Alertas ficam para o próximo dia útil." : "E-mail não configurado: alertas aguardando envio.");
    return { status: c.falhas && !c.conferidos ? "erro" : "sucesso", enviados: 0, falhas: c.falhas, mensagem: partes.join(" ") };
  }

  const envio = await enviarAlertas(ctx);
  if (envio.total) partes.push(`${envio.entregues} e-mails enviados sobre ${envio.total} alertas.`);
  const r = resultadoEnvio(envio.destinos, envio.entregues, envio.erros, partes.join(" "));
  return c.falhas && !c.conferidos && r.status === "sucesso" ? { ...r, status: "erro" } : r;
}
