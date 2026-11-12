import "server-only";
import { escaparHtml, modeloEmail } from "@/lib/email";
import { botaoHtml, dataBR, linhaHtml, nomeCliente, primeiroNome, secaoHtml } from "@/lib/email-blocos";
import { FUSO } from "@/lib/log-sincronizacao";
import {
  diasUteisEntre,
  enviarEmSequencia,
  feriadosNacionais,
  gestoresEAdmins,
  ignorado,
  motivoNaoUtil,
  resultadoEnvio,
  type Contexto,
  type Pessoa,
  type ResultadoAutomacao,
} from "@/lib/automacao-execucao";

// Automação "Lembrete de cobrança": quando uma tarefa fica em "aguardando
// cliente" por 3 dias úteis, o responsável recebe um lembrete para cobrar o
// cliente, com os contatos cadastrados. Repete a cada 3 dias úteis enquanto a
// tarefa continuar parada. Nada é enviado ao cliente.
// Sem responsável, o lembrete vai aos gestores do departamento (ou aos admins).

export const AUTOMACAO_COBRANCA = "cobranca_cliente";
const DIAS_UTEIS = 3;

type Tarefa = {
  id: string;
  aguardando_desde: string;
  prazo_legal: string;
  departamento_id: number;
  cliente: { id: string; razao_social: string; fantasia: string | null };
  obrigacao: { nome: string } | null;
  responsavel: (Pessoa & { ativo: boolean }) | null;
};
type Contato = { cliente_id: string; nome: string; email: string | null; telefone: string | null };
type Item = Tarefa & { dias: number; lembretes: number };

const diaSP = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(iso));

function montarEmail(p: Pessoa, itens: Item[], contatos: Map<string, Contato[]>, base: string) {
  const porCliente = new Map<string, Item[]>();
  for (const i of itens) porCliente.set(i.cliente.id, [...(porCliente.get(i.cliente.id) ?? []), i]);

  const blocos = [...porCliente.values()].map((lista) => {
    const c = lista[0].cliente;
    const cont = (contatos.get(c.id) ?? []).map((k) =>
      [k.nome, k.email, k.telefone].filter(Boolean).map((v) => escaparHtml(v!)).join(" · "),
    );
    return secaoHtml(
      nomeCliente(c),
      "#0D1B2A",
      lista.map((i) =>
        linhaHtml(
          `<strong>${escaparHtml(i.obrigacao?.nome ?? "Tarefa")}</strong>`,
          `prazo ${dataBR(i.prazo_legal).slice(0, 5)}`,
          `Aguardando há ${i.dias} dias úteis${i.lembretes ? ` · ${i.lembretes + 1}º lembrete` : ""}`,
        ),
      ),
      `<p style="margin:6px 0 0;font-size:12px;color:#4A5868">${cont.length ? `Contatos: ${cont.join("<br>")}` : "Nenhum contato cadastrado para este cliente."}</p>`,
    );
  });

  const corpo = `<p>Olá, ${escaparHtml(primeiroNome(p.nome))}. Estas tarefas estão esperando o cliente há ${DIAS_UTEIS} dias úteis ou mais. Que tal cobrar?</p>
    ${blocos.join("")}
    ${botaoHtml(`${base}/minhas-tarefas?visao=aguardando`, "Abrir tarefas aguardando")}`;
  const texto = [
    `Olá, ${primeiroNome(p.nome)}. Estas tarefas estão esperando o cliente há ${DIAS_UTEIS} dias úteis ou mais:`,
    ...itens.map((i) => `- ${nomeCliente(i.cliente)} · ${i.obrigacao?.nome ?? "Tarefa"} · aguardando há ${i.dias} dias úteis`),
    `\nAbrir tarefas: ${base}/minhas-tarefas?visao=aguardando`,
  ].join("\n");
  return {
    assunto: `Cobrar cliente: ${itens.length} ${itens.length === 1 ? "tarefa parada" : "tarefas paradas"} aguardando`,
    html: modeloEmail({ titulo: "Tarefas aguardando o cliente", corpo }),
    texto,
  };
}

export async function executarCobranca(ctx: Contexto): Promise<ResultadoAutomacao> {
  const { supabase, hoje, base } = ctx;
  if (!ctx.forcar) {
    const motivo = await motivoNaoUtil(ctx);
    if (motivo) return ignorado(motivo);
  }

  const { data, error } = await supabase
    .from("tarefas")
    .select(
      "id, aguardando_desde, prazo_legal, departamento_id, cliente:clientes!inner(id, razao_social, fantasia), obrigacao:obrigacoes(nome), responsavel:profiles!responsavel_id(id, nome, email, ativo)",
    )
    .eq("status", "aguardando_cliente")
    .not("aguardando_desde", "is", null)
    .order("aguardando_desde")
    .limit(2000)
    .overrideTypes<Tarefa[], { merge: false }>();
  if (error) throw new Error(`Falha ao ler as tarefas: ${error.message}`);
  const tarefas = data ?? [];
  if (tarefas.length === 0) return ignorado("Nenhuma tarefa aguardando o cliente.");

  const { data: lembretes, error: e1 } = await supabase
    .from("tarefa_lembretes")
    .select("tarefa_id, enviado_em")
    .in("tarefa_id", tarefas.map((t) => t.id))
    .order("enviado_em", { ascending: false });
  if (e1) throw new Error(`Falha ao ler os lembretes: ${e1.message}`);
  const ultimo = new Map<string, string>();
  const quantos = new Map<string, number>();
  for (const l of lembretes ?? []) {
    if (!ultimo.has(l.tarefa_id)) ultimo.set(l.tarefa_id, diaSP(l.enviado_em));
    quantos.set(l.tarefa_id, (quantos.get(l.tarefa_id) ?? 0) + 1);
  }

  const feriados = await feriadosNacionais(supabase, diaSP(tarefas[0].aguardando_desde), hoje);
  const devidas: Item[] = tarefas
    .map((t) => ({ ...t, dias: diasUteisEntre(diaSP(t.aguardando_desde), hoje, feriados), lembretes: quantos.get(t.id) ?? 0 }))
    .filter((t) => t.dias >= DIAS_UTEIS && (!ultimo.has(t.id) || diasUteisEntre(ultimo.get(t.id)!, hoje, feriados) >= DIAS_UTEIS));
  if (devidas.length === 0) return ignorado(`${tarefas.length} aguardando o cliente, nenhuma com lembrete devido hoje.`);

  // Para quem vai: o responsável; sem ele, os gestores do departamento; sem gestor, os admins.
  const [chefes, { data: deps }, { data: contatos }] = await Promise.all([
    gestoresEAdmins(supabase),
    supabase.from("profile_departamentos").select("profile_id, departamento_id"),
    supabase
      .from("cliente_contatos")
      .select("cliente_id, nome, email, telefone")
      .in("cliente_id", [...new Set(devidas.map((t) => t.cliente.id))]),
  ]);
  const admins = chefes.filter((c) => c.papel === "admin");
  const gestoresDe = (dep: number) => {
    const ids = new Set((deps ?? []).filter((d) => d.departamento_id === dep).map((d) => d.profile_id));
    const g = chefes.filter((c) => c.papel === "gestor" && ids.has(c.id));
    return g.length ? g : admins;
  };

  const destinos = new Map<string, { pessoa: Pessoa; itens: Item[] }>();
  for (const t of devidas) {
    const pessoas = t.responsavel?.ativo ? [t.responsavel] : gestoresDe(t.departamento_id);
    for (const p of pessoas) {
      const d = destinos.get(p.id) ?? { pessoa: { id: p.id, nome: p.nome, email: p.email }, itens: [] };
      d.itens.push(t);
      destinos.set(p.id, d);
    }
  }

  const porCliente = new Map<string, Contato[]>();
  for (const c of (contatos ?? []) as Contato[]) porCliente.set(c.cliente_id, [...(porCliente.get(c.cliente_id) ?? []), c]);

  const lista = [...destinos.values()].filter((d) => d.pessoa.email);
  const { entregues, erros } = await enviarEmSequencia(
    lista.map((d) => ({ item: d, email: { para: d.pessoa.email, ...montarEmail(d.pessoa, d.itens, porCliente, base) } })),
  );

  const registros = entregues.flatMap((d) => d.itens.map((t) => ({ tarefa_id: t.id, profile_id: d.pessoa.id })));
  if (registros.length) {
    const { error: e2 } = await supabase.from("tarefa_lembretes").insert(registros);
    if (e2) throw new Error(`E-mails enviados, mas falhou ao registrar os lembretes: ${e2.message}`);
  }

  return resultadoEnvio(
    lista.length,
    entregues.length,
    erros,
    `${devidas.length} ${devidas.length === 1 ? "tarefa parada" : "tarefas paradas"} há ${DIAS_UTEIS}+ dias úteis · ${entregues.length} lembretes enviados.`,
  );
}
