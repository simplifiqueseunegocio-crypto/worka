import "server-only";
import { createClient } from "@/lib/supabase/server";

// Painel das rotinas automáticas da plataforma. Cada rotina mostra quando roda,
// quando rodou por último (pelos registros que ela deixa no banco) e a próxima
// execução prevista. Horários em Brasília (UTC−3, sem horário de verão).

const OFFSET_BRT = 3 * 3_600_000;

export type SaudeRotina = "ok" | "atencao" | "sem_registro" | "restrito";

export type Rotina = {
  chave: string;
  titulo: string;
  descricao: string;
  agenda: string;
  onde: string;
  href: string;
  ultima: string | null;
  proxima: string | null;
  saude: SaudeRotina;
  resumo: string;
  /** Ação extra exibida no cartão. */
  acao?: "previa-resumo";
};

// Próxima ocorrência de "segunda a sexta às HH:00" (Brasília), em ISO UTC.
function proximaDiaUtil(hora: number, minuto = 0, agora = new Date()) {
  let alvo = new Date(proximaDiaria(hora, minuto, agora));
  while ([0, 6].includes(new Date(alvo.getTime() - OFFSET_BRT).getUTCDay())) {
    alvo = new Date(alvo.getTime() + 86_400_000);
  }
  return alvo.toISOString();
}

// Próxima ocorrência de "todo dia às HH:MM" (Brasília), em ISO UTC.
function proximaDiaria(hora: number, minuto = 0, agora = new Date()) {
  const brt = new Date(agora.getTime() - OFFSET_BRT);
  const alvo = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), hora, minuto);
  const ms = alvo > brt.getTime() ? alvo : alvo + 86_400_000;
  return new Date(ms + OFFSET_BRT).toISOString();
}

// Próxima ocorrência de "todo dia D do mês às HH:00" (Brasília), em ISO UTC.
function proximaMensal(dia: number, hora: number, agora = new Date()) {
  const brt = new Date(agora.getTime() - OFFSET_BRT);
  let alvo = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), dia, hora);
  if (alvo <= brt.getTime()) alvo = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth() + 1, dia, hora);
  return new Date(alvo + OFFSET_BRT).toISOString();
}

// Competência ("AAAA-MM-01") gerada na última rodada do dia 1º: o mês anterior.
function ultimaCompetenciaGerada(agora = new Date()) {
  const brt = new Date(agora.getTime() - OFFSET_BRT);
  const passouDia1 = brt.getUTCDate() > 1 || brt.getUTCHours() >= 6;
  const recuo = passouDia1 ? 1 : 2;
  const d = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth() - recuo, 1));
  return d.toISOString().slice(0, 10);
}

const mesAno = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

async function sincronizacaoContaAzul(gestor: boolean): Promise<Rotina> {
  const base = {
    chave: "conta-azul",
    titulo: "Sincronização com a Conta Azul",
    descricao:
      "Para cada cliente conectado, lê da Conta Azul Pro dele o cadastro da empresa e os clientes e fornecedores.",
    agenda: "Todo dia às 23:00",
    onde: "Plataforma (API Conta Azul)",
    href: "/configuracoes/conta-azul",
    proxima: proximaDiaria(23),
  };
  if (!gestor) {
    return { ...base, ultima: null, saude: "restrito", resumo: "Detalhes visíveis para gestores e administradores." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integracao_execucoes")
    .select("iniciado_em, status, mensagem")
    .eq("integracao", "conta_azul")
    .order("iniciado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return { ...base, ultima: null, saude: "sem_registro", resumo: "Nenhuma execução registrada ainda." };
  }

  const horas = (Date.now() - new Date(data.iniciado_em).getTime()) / 3_600_000;
  const atrasada = horas >= 26;
  const resumo =
    data.status === "sucesso"
      ? (data.mensagem ?? "Sincronizado.")
      : (data.mensagem ?? "A última execução falhou.");
  return {
    ...base,
    ultima: data.iniciado_em,
    saude: data.status !== "sucesso" || atrasada ? "atencao" : "ok",
    resumo: atrasada ? `Sem execução há ${Math.floor(horas)} horas. ${resumo}` : resumo,
  };
}

async function geracaoTarefas(): Promise<Rotina> {
  const supabase = await createClient();
  const competencia = ultimaCompetenciaGerada();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("tarefas")
      .select("criado_em")
      .eq("competencia", competencia)
      .order("criado_em", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("tarefas").select("id", { count: "exact", head: true }).eq("competencia", competencia),
  ]);

  const total = count ?? 0;
  return {
    chave: "tarefas",
    titulo: "Geração das tarefas do mês",
    descricao: "Cria as tarefas da competência anterior cruzando os clientes ativos com as obrigações de cada um.",
    agenda: "Todo dia 1º às 06:00",
    onde: "Banco de dados (pg_cron)",
    href: "/tarefas",
    ultima: data?.criado_em ?? null,
    proxima: proximaMensal(1, 6),
    saude: total > 0 ? "ok" : "atencao",
    resumo:
      total > 0
        ? `Competência ${mesAno(competencia)}: ${plural(total, "tarefa", "tarefas")}`
        : `Nenhuma tarefa encontrada para a competência ${mesAno(competencia)}.`,
  };
}

async function rodadaCnd(): Promise<Rotina> {
  const supabase = await createClient();
  const [{ data: ultimaRodada }, { count: naFila }] = await Promise.all([
    supabase
      .from("cnd_consultas")
      .select("solicitada_em")
      .eq("origem", "agendada")
      .order("solicitada_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cnd_consultas")
      .select("id", { count: "exact", head: true })
      .in("status", ["na_fila", "processando"]),
  ]);
  const fila = naFila ?? 0;
  return {
    chave: "cnd-rodada",
    titulo: "Rodada mensal de certidões",
    descricao: "Coloca na fila as certidões (federal, FGTS, estadual e municipal) de todos os clientes com busca de CND ligada.",
    agenda: "Todo dia 23 às 06:00",
    onde: "Banco de dados (pg_cron)",
    href: "/cnd",
    ultima: ultimaRodada?.solicitada_em ?? null,
    proxima: proximaMensal(23, 6),
    saude: ultimaRodada ? "ok" : "sem_registro",
    resumo: fila > 0 ? `${plural(fila, "consulta", "consultas")} na fila agora` : "Fila vazia",
  };
}

async function consultasCnd(): Promise<Rotina> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: ultima }, { count: semana }, { count: erros }, { data: maisAntiga }] = await Promise.all([
    supabase
      .from("cnd_consultas")
      .select("processada_em")
      .not("processada_em", "is", null)
      .order("processada_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("cnd_consultas").select("id", { count: "exact", head: true }).gte("processada_em", desde),
    supabase
      .from("cnd_consultas")
      .select("id", { count: "exact", head: true })
      .gte("processada_em", desde)
      .eq("status", "erro"),
    supabase
      .from("cnd_consultas")
      .select("solicitada_em")
      .eq("status", "na_fila")
      .order("solicitada_em", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const parada = maisAntiga && Date.now() - new Date(maisAntiga.solicitada_em).getTime() > 3 * 86_400_000;
  const feitas = semana ?? 0;
  const falhas = erros ?? 0;
  return {
    chave: "cnd-consultas",
    titulo: "Consulta das certidões em lote",
    descricao: "Esvazia a fila consultando os sites da Receita, Caixa, SIDEB e ISS Digital e guarda o resultado de cada certidão.",
    agenda: "Toda noite, em lotes",
    onde: "Tarefas agendadas do Claude",
    href: "/cnd",
    ultima: ultima?.processada_em ?? null,
    proxima: null,
    saude: !ultima ? "sem_registro" : parada || (feitas > 0 && falhas / feitas > 0.3) ? "atencao" : "ok",
    resumo: parada
      ? "Há consultas esperando na fila há mais de 3 dias."
      : `Últimos 7 dias: ${plural(feitas, "consulta", "consultas")}${falhas ? ` · ${plural(falhas, "erro", "erros")}` : ""}`,
  };
}

async function envioAdiantamento(): Promise<Rotina> {
  const supabase = await createClient();
  const { data: ultimo } = await supabase
    .from("adiantamento_envios")
    .select("enviado_em, competencia")
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  let resumo = "Nenhum envio registrado ainda.";
  let saude: SaudeRotina = "sem_registro";
  if (ultimo) {
    const [{ count: enviados }, { count: falhas }] = await Promise.all([
      supabase
        .from("adiantamento_envios")
        .select("id", { count: "exact", head: true })
        .eq("competencia", ultimo.competencia)
        .is("erro", null),
      supabase
        .from("adiantamento_envios")
        .select("id", { count: "exact", head: true })
        .eq("competencia", ultimo.competencia)
        .not("erro", "is", null),
    ]);
    resumo = `Competência ${mesAno(ultimo.competencia)}: ${plural(enviados ?? 0, "e-mail enviado", "e-mails enviados")}${falhas ? ` · ${plural(falhas, "falha", "falhas")}` : ""}`;
    saude = falhas ? "atencao" : "ok";
  }

  return {
    chave: "adiantamento",
    titulo: "Envio da folha de adiantamento",
    descricao: "Separa os PDFs exportados do Domínio por cliente e envia cada folha por e-mail aos contatos cadastrados.",
    agenda: "Ao enviar pela tela",
    onde: "Plataforma (Resend)",
    href: "/adiantamento",
    ultima: ultimo?.enviado_em ?? null,
    proxima: null,
    saude,
    resumo,
  };
}

async function resumoDiario(gestor: boolean): Promise<Rotina> {
  const base = {
    chave: "resumo-diario",
    titulo: "Resumo diário por e-mail",
    descricao:
      "Cada pessoa recebe de manhã as suas tarefas atrasadas, as que vencem hoje e as dos próximos 7 dias, além das tarefas pessoais.",
    agenda: "Segunda a sexta às 07:00",
    onde: "Vercel Cron (Resend)",
    href: "/minhas-tarefas",
    proxima: proximaDiaUtil(7),
    acao: "previa-resumo" as const,
  };
  if (!gestor) {
    return { ...base, ultima: null, saude: "restrito", resumo: "Use a prévia para ver como fica o seu resumo de hoje." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automacao_execucoes")
    .select("iniciado_em, status, mensagem, falhas")
    .eq("automacao", "resumo_diario")
    .order("iniciado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return {
      ...base,
      ultima: null,
      saude: "sem_registro",
      resumo: error ? "Aplique a migration 20261110000100_automacao_execucoes.sql." : "Nenhum envio registrado ainda.",
    };
  }
  return {
    ...base,
    ultima: data.iniciado_em,
    saude: data.status === "erro" || data.status === "parcial" ? "atencao" : "ok",
    resumo: `${data.mensagem ?? ""}${data.falhas ? ` ${plural(data.falhas, "falha", "falhas")}.` : ""}`.trim() || "—",
  };
}

async function alertasCnd(gestor: boolean): Promise<Rotina> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [aguardando, mes, execucao] = await Promise.all([
    supabase.from("cnd_alertas").select("id", { count: "exact", head: true }).is("notificado_em", null),
    supabase
      .from("cnd_alertas")
      .select("id", { count: "exact", head: true })
      .eq("para", "pendente")
      .gte("criado_em", desde),
    gestor
      ? supabase
          .from("automacao_execucoes")
          .select("iniciado_em, status, mensagem")
          .eq("automacao", "alertas_cnd")
          .order("iniciado_em", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const base = {
    chave: "alertas-cnd",
    titulo: "Mudança na situação da CND",
    descricao:
      "Avisa por e-mail quando um cliente regular passa a ter pendência numa certidão (ou regulariza). Gestores recebem tudo; responsáveis, os seus clientes.",
    agenda: "Segunda a sexta às 07:10",
    onde: "Vercel Cron (Resend)",
    href: "/cnd",
    proxima: proximaDiaUtil(7, 10),
  };
  if (aguardando.error) {
    return { ...base, ultima: null, saude: "sem_registro", resumo: "Aplique a migration 20261110000200_cnd_alertas.sql." };
  }

  const fila = aguardando.count ?? 0;
  const pendencias = mes.count ?? 0;
  const resumo = [
    fila ? `${plural(fila, "mudança aguardando envio", "mudanças aguardando envio")}` : "Nenhuma mudança aguardando envio",
    `${plural(pendencias, "nova pendência", "novas pendências")} em 30 dias`,
  ].join(" · ");
  const ex = execucao.data;
  return {
    ...base,
    ultima: ex?.iniciado_em ?? null,
    saude: !gestor ? "ok" : !ex ? "sem_registro" : ex.status === "erro" || ex.status === "parcial" ? "atencao" : "ok",
    resumo: ex && (ex.status === "erro" || ex.status === "parcial") ? `${ex.mensagem} ${resumo}` : resumo,
  };
}

// Cartão de uma automação que grava em automacao_execucoes. "situacao" é um
// retrato atual (visível para todos); a última execução, só para gestores.
async function cartaoAutomacao(
  gestor: boolean,
  automacao: string,
  migration: string,
  base: Omit<Rotina, "ultima" | "saude" | "resumo">,
  situacao: () => Promise<string>,
): Promise<Rotina> {
  const supabase = await createClient();
  // Situação atual e última execução em paralelo.
  const [estado, execucao] = await Promise.all([
    situacao().then(
      (texto) => ({ texto }),
      () => null,
    ),
    gestor
      ? supabase
          .from("automacao_execucoes")
          .select("iniciado_em, status, mensagem")
          .eq("automacao", automacao)
          .order("iniciado_em", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null,
  ]);
  if (!estado) return { ...base, ultima: null, saude: "sem_registro", resumo: `Aplique a migration ${migration}.` };
  const agora = estado.texto;
  if (!gestor) return { ...base, ultima: null, saude: "ok", resumo: agora };

  const ex = execucao?.data;
  if (!ex) return { ...base, ultima: null, saude: "sem_registro", resumo: agora };
  const problema = ex.status === "erro" || ex.status === "parcial";
  return { ...base, ultima: ex.iniciado_em, saude: problema ? "atencao" : "ok", resumo: problema ? `${ex.mensagem} ${agora}` : agora };
}

async function contar(consulta: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await consulta;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const MIG_RESTANTES = "20261110000300_automacoes_restantes.sql";

async function atrasosGestor(gestor: boolean) {
  const supabase = await createClient();
  return cartaoAutomacao(
    gestor,
    "atrasos_gestor",
    MIG_RESTANTES,
    {
      chave: "atrasos-gestor",
      titulo: "Alerta de atraso para o gestor",
      descricao:
        "Cada gestor recebe as tarefas abertas dos seus departamentos que passaram da meta interna, separando as que já venceram o prazo legal. Admins recebem todas.",
      agenda: "Segunda a sexta às 07:20",
      onde: "Vercel Cron (Resend)",
      href: "/tarefas?status=atrasada",
      proxima: proximaDiaUtil(7, 20),
    },
    async () => {
      const n = await contar(
        supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .in("status", ["pendente", "em_andamento", "aguardando_cliente"])
          .lt("prazo_meta", hojeSP()),
      );
      return n ? `${plural(n, "tarefa fora da meta", "tarefas fora da meta")} agora` : "Nenhuma tarefa fora da meta agora";
    },
  );
}

async function cndVencendo(gestor: boolean) {
  const supabase = await createClient();
  return cartaoAutomacao(
    gestor,
    "cnd_vencendo",
    MIG_RESTANTES,
    {
      chave: "cnd-vencendo",
      titulo: "CND perto de vencer",
      descricao:
        "Avisa 15 dias antes do vencimento das certidões lançadas e já coloca na fila uma nova consulta automática para os clientes na busca de CND.",
      agenda: "Segunda a sexta às 07:30",
      onde: "Vercel Cron (Resend)",
      href: "/cnd",
      proxima: proximaDiaUtil(7, 30),
    },
    async () => {
      const hoje = hojeSP();
      const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) + 15 * 86_400_000).toISOString().slice(0, 10);
      // Filtrar por aviso_vencimento_em falha se a migration ainda não foi aplicada.
      const vencendo = await contar(
        supabase
          .from("certidoes")
          .select("id", { count: "exact", head: true })
          .is("aviso_vencimento_em", null)
          .gte("valida_ate", hoje)
          .lte("valida_ate", limite),
      );
      return vencendo ? `${plural(vencendo, "certidão vence", "certidões vencem")} em até 15 dias` : "Nenhuma certidão vencendo em 15 dias";
    },
  );
}

async function cobrancaCliente(gestor: boolean) {
  const supabase = await createClient();
  return cartaoAutomacao(
    gestor,
    "cobranca_cliente",
    MIG_RESTANTES,
    {
      chave: "cobranca-cliente",
      titulo: "Lembrete de cobrança",
      descricao:
        "Quando uma tarefa fica 3 dias úteis em “aguardando cliente”, o responsável recebe um lembrete com os contatos do cliente. Repete a cada 3 dias úteis. Nada é enviado ao cliente.",
      agenda: "Segunda a sexta às 08:00",
      onde: "Vercel Cron (Resend)",
      href: "/minhas-tarefas?visao=aguardando",
      proxima: proximaDiaUtil(8),
    },
    async () => {
      const n = await contar(
        supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .eq("status", "aguardando_cliente")
          .not("aguardando_desde", "is", null),
      );
      return n ? `${plural(n, "tarefa aguardando", "tarefas aguardando")} o cliente` : "Nenhuma tarefa aguardando o cliente";
    },
  );
}

async function conferenciaReceita(gestor: boolean) {
  const supabase = await createClient();
  return cartaoAutomacao(
    gestor,
    "conferencia_receita",
    MIG_RESTANTES,
    {
      chave: "conferencia-receita",
      titulo: "Conferência na Receita",
      descricao:
        "Confere na BrasilAPI um lote de CNPJs por dia e avisa quando um cliente muda de situação cadastral (inapto, baixado…), CNAE principal, endereço, Simples ou MEI.",
      agenda: "Todo dia às 05:00 (50 CNPJs)",
      onde: "Vercel Cron (BrasilAPI)",
      href: "/clientes",
      proxima: proximaDiaria(5),
    },
    async () => {
      const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [conferidos, mudancas] = await Promise.all([
        contar(supabase.from("cliente_receita").select("cliente_id", { count: "exact", head: true }).is("erro", null)),
        contar(supabase.from("receita_alertas").select("id", { count: "exact", head: true }).gte("criado_em", desde)),
      ]);
      return `${plural(conferidos, "CNPJ conferido", "CNPJs conferidos")} · ${plural(mudancas, "mudança", "mudanças")} em 30 dias`;
    },
  );
}

// Robô do DET: a fila (det_consultas) e os avisos (det_avisos) são o registro.
async function roboDet(): Promise<Rotina> {
  const base = {
    chave: "robo-det",
    titulo: "Robô do DET (consignado)",
    descricao:
      "No dia 26 os clientes ativos entram na fila; o robô do computador do escritório lê a lista da Caixa Postal do DET de cada um, sem abrir mensagens. Aviso de consignado vira tarefa para o DP; sem procuração vira pendência.",
    agenda: "Fila todo dia 26 às 07:00",
    onde: "Computador do escritório (robô)",
    href: "/automacoes/det",
    proxima: proximaMensal(26, 7),
  };

  const supabase = await createClient();
  const competencia = `${hojeSP().slice(0, 7)}-01`;
  const consulta = () => supabase.from("det_consultas").select("id", { count: "exact", head: true });
  try {
    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: ultima, error }, fila, semProcuracao, erros, avisos, travada] = await Promise.all([
      supabase
        .from("det_consultas")
        .select("processada_em")
        .not("processada_em", "is", null)
        .order("processada_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
      contar(consulta().in("status", ["na_fila", "processando"])),
      contar(consulta().eq("competencia", competencia).eq("status", "sem_procuracao")),
      contar(consulta().eq("competencia", competencia).eq("status", "erro")),
      contar(supabase.from("det_avisos").select("id", { count: "exact", head: true }).eq("consignado", true).gte("criado_em", desde)),
      // Fila parada: algo esperando há mais de 2 dias (o robô não está rodando).
      contar(consulta().eq("status", "na_fila").lt("solicitada_em", new Date(Date.now() - 2 * 86_400_000).toISOString())),
    ]);
    if (error) throw error;

    const partes = [
      fila ? `${plural(fila, "empresa na fila", "empresas na fila")}` : "Fila vazia",
      `${plural(avisos, "aviso de consignado", "avisos de consignado")} em 30 dias`,
      ...(semProcuracao ? [`${plural(semProcuracao, "sem procuração", "sem procuração")} no mês`] : []),
      ...(erros ? [`${plural(erros, "falha", "falhas")} no mês`] : []),
    ];
    const atencao = travada > 0 || erros > 0;
    return {
      ...base,
      ultima: ultima?.processada_em ?? null,
      saude: atencao ? "atencao" : ultima ? "ok" : "sem_registro",
      resumo: travada ? `O robô não está consumindo a fila. ${partes.join(" · ")}` : partes.join(" · "),
    };
  } catch {
    return { ...base, ultima: null, saude: "sem_registro", resumo: "Aplique a migration 20261110000400_det.sql." };
  }
}

// Leitura de ficha ponto: as leituras (ponto_leituras) são o registro. Fora do
// DP a RLS não mostra nada: o cartão fica "restrito".
async function leituraPonto(): Promise<Rotina> {
  const base = {
    chave: "leitura-ponto",
    titulo: "Leitura de ficha ponto",
    descricao:
      "O DP envia a ficha ponto (PDF, foto ou imagem); a IA lê funcionários, dias e marcações, a plataforma aponta o que conferir e o DP confirma.",
    agenda: "Ao enviar pela tela",
    onde: "Plataforma (IA Claude)",
    href: "/automacoes/ponto",
    proxima: null,
  };
  const supabase = await createClient();
  const leituras = () => supabase.from("ponto_leituras").select("id", { count: "exact", head: true });
  try {
    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: ultima, error }, aConferir, confirmadas, falhas] = await Promise.all([
      supabase.from("ponto_leituras").select("enviada_em").order("enviada_em", { ascending: false }).limit(1).maybeSingle(),
      contar(leituras().eq("status", "conferir")),
      contar(leituras().eq("status", "confirmada").gte("enviada_em", desde)),
      contar(leituras().eq("status", "erro").gte("enviada_em", desde)),
    ]);
    if (error) throw error;
    if (!ultima) return { ...base, ultima: null, saude: "sem_registro", resumo: "Nenhuma ficha lida ainda." };
    const partes = [
      `${plural(aConferir, "leitura para conferir", "leituras para conferir")}`,
      `${plural(confirmadas, "confirmada", "confirmadas")} em 30 dias`,
      ...(falhas ? [`${plural(falhas, "falha", "falhas")}`] : []),
    ];
    return { ...base, ultima: ultima.enviada_em, saude: falhas || aConferir ? "atencao" : "ok", resumo: partes.join(" · ") };
  } catch {
    return { ...base, ultima: null, saude: "sem_registro", resumo: "Aplique a migration 20261112000000_ponto.sql." };
  }
}

// Leitores do pipeline de documentos: as leituras são o registro; o resumo
// conta o que está para conferir e o que a confirmação gravou em 30 dias.
const LEITORES = [
  {
    chave: "leitor-atestados",
    tipo: "atestado",
    titulo: "Leitor de atestados",
    descricao:
      "O DP envia fotos ou PDFs dos atestados; a IA lê funcionário, datas, dias e CRM (sem CID), a plataforma aponta o que conferir e a confirmação lança o afastamento.",
    nenhum: "Nenhum atestado lido ainda.",
    tabela: "pessoal_afastamentos",
    gravado: ["afastamento lançado", "afastamentos lançados"],
    migration: "20261112000100_documentos.sql",
  },
  {
    chave: "leitor-nfse",
    tipo: "nfse",
    titulo: "Leitor de NFS-e",
    descricao:
      "Para as prefeituras que não mandam XML: a IA lê a nota em PDF ou foto, a plataforma confere CNPJs, ISS e líquido, e a confirmação grava a nota como prestada ou tomada.",
    nenhum: "Nenhuma nota lida ainda.",
    tabela: "fiscal_nfse",
    gravado: ["nota gravada", "notas gravadas"],
    migration: "20261112000300_leitores_fiscais.sql",
  },
  {
    chave: "leitor-guias",
    tipo: "guia",
    titulo: "Leitor de guias",
    descricao:
      "DAS, DARF, GPS, FGTS e boletos: a IA lê valores, vencimento e código de barras; a plataforma confere os dígitos e o valor do código e acompanha a guia até o comprovante.",
    nenhum: "Nenhuma guia lida ainda.",
    tabela: "guias",
    gravado: ["guia registrada", "guias registradas"],
    migration: "20261112000300_leitores_fiscais.sql",
  },
  {
    chave: "leitor-comprovantes",
    tipo: "comprovante",
    titulo: "Leitor de comprovantes",
    descricao:
      "PIX, boleto, tributo ou TED: a IA lê data, valor, pagador e beneficiário; a confirmação registra o pagamento e dá baixa na guia correspondente.",
    nenhum: "Nenhum comprovante lido ainda.",
    tabela: "contabil_comprovantes",
    gravado: ["comprovante lançado", "comprovantes lançados"],
    migration: "20261112000300_leitores_fiscais.sql",
  },
] as const;

async function leitorDocumento(l: (typeof LEITORES)[number]): Promise<Rotina> {
  const base = {
    chave: l.chave,
    titulo: l.titulo,
    descricao: l.descricao,
    agenda: "Ao enviar pela tela",
    onde: "Plataforma (IA)",
    href: `/automacoes/documentos/${l.tipo}`,
    proxima: null,
  };
  const supabase = await createClient();
  const leituras = () => supabase.from("documentos_leituras").select("id", { count: "exact", head: true }).eq("tipo", l.tipo);
  try {
    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: ultima, error }, aConferir, gravados] = await Promise.all([
      supabase.from("documentos_leituras").select("enviada_em").eq("tipo", l.tipo).order("enviada_em", { ascending: false }).limit(1).maybeSingle(),
      contar(leituras().eq("status", "conferir")),
      contar(supabase.from(l.tabela).select("id", { count: "exact", head: true }).gte("criado_em", desde)),
    ]);
    if (error) throw error;
    if (!ultima) return { ...base, ultima: null, saude: "sem_registro", resumo: l.nenhum };
    return {
      ...base,
      ultima: ultima.enviada_em,
      saude: aConferir ? "atencao" : "ok",
      resumo: `${plural(aConferir, "leitura para conferir", "leituras para conferir")} · ${plural(gravados, l.gravado[0], l.gravado[1])} em 30 dias`,
    };
  } catch {
    return { ...base, ultima: null, saude: "sem_registro", resumo: `Aplique a migration ${l.migration}.` };
  }
}

async function monitorVencimentos(gestor: boolean) {
  const supabase = await createClient();
  return cartaoAutomacao(
    gestor,
    "monitor_vencimentos",
    "20261112000200_vencimentos.sql",
    {
      chave: "monitor-vencimentos",
      titulo: "Monitor de vencimentos",
      descricao:
        "Certificados digitais, alvarás, licenças e procurações dos clientes com data de vencimento; avisa por e-mail antes de vencer (marcos de 30, 15, 7 e 1 dia).",
      agenda: "Segunda a sexta às 07:40",
      onde: "Vercel Cron (Resend)",
      href: "/automacoes/vencimentos",
      proxima: proximaDiaUtil(7, 40),
    },
    async () => {
      const hoje = hojeSP();
      const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
      const base = () => supabase.from("vencimentos").select("id", { count: "exact", head: true }).eq("ativo", true);
      const [vencidos, vencendo, total] = await Promise.all([
        contar(base().lt("vence_em", hoje)),
        contar(base().gte("vence_em", hoje).lte("vence_em", limite)),
        contar(base()),
      ]);
      if (!total) return "Nada cadastrado ainda";
      return [
        ...(vencidos ? [`${plural(vencidos, "vencido", "vencidos")}`] : []),
        `${plural(vencendo, "vence", "vencem")} em 30 dias`,
        `${plural(total, "item monitorado", "itens monitorados")}`,
      ].join(" · ");
    },
  );
}

export async function listarRotinas(gestor: boolean): Promise<Rotina[]> {
  return Promise.all([
    roboDet(),
    leituraPonto(),
    ...LEITORES.map(leitorDocumento),
    monitorVencimentos(gestor),
    resumoDiario(gestor),
    alertasCnd(gestor),
    atrasosGestor(gestor),
    cndVencendo(gestor),
    cobrancaCliente(gestor),
    conferenciaReceita(gestor),
    sincronizacaoContaAzul(gestor),
    geracaoTarefas(),
    rodadaCnd(),
    consultasCnd(),
    envioAdiantamento(),
  ]);
}

// Automações planejadas, exibidas como "Em breve".
// O ícone, o tipo e o departamento de cada uma ficam na página (VISUAL).
export const automacoesPlanejadas: { chave: string; titulo: string; descricao: string }[] = [
  {
    chave: "triagem-entrada",
    titulo: "Triagem da caixa de entrada",
    descricao: "E-mail de cliente com anexos é classificado (ficha ponto, nota, extrato, atestado…) e vai para o leitor certo, já com a tarefa criada.",
  },
  {
    chave: "leitor-admissao",
    titulo: "Documentos de admissão",
    descricao: "Fotos de RG, CPF, CTPS e comprovantes preenchem o cadastro do funcionário, com checklist do que está faltando.",
  },
  {
    chave: "conferencia-folha",
    titulo: "Conferência de folha",
    descricao: "Compara a folha calculada com a do mês anterior e aponta o que variou fora do normal antes de o cliente ver.",
  },
  {
    chave: "solicitacoes-email",
    titulo: "Solicitações por e-mail",
    descricao: "“Quero dar férias pro João dia 10” vira tarefa estruturada, com funcionário, tipo e data.",
  },
  {
    chave: "classificacao-notas",
    titulo: "Classificação de notas",
    descricao: "Sugere CFOP, CST e natureza da operação pelo histórico do cliente, com revisão humana.",
  },
  {
    chave: "envio-guias",
    titulo: "Envio de guias ao cliente",
    descricao: "A guia lida e conferida vai por e-mail ao cliente, com lembrete antes do vencimento enquanto não chega o comprovante.",
  },
  {
    chave: "extratos-conciliacao",
    titulo: "Extratos com conciliação",
    descricao: "Lê o extrato (PDF ou OFX) e sugere a classificação de cada lançamento pelo histórico do cliente.",
  },
  {
    chave: "contrato-social",
    titulo: "Leitor de contrato social",
    descricao: "Extrai sócios, capital, CNAEs e endereço das alterações e atualiza o cadastro do cliente.",
  },
  {
    chave: "caixas-postais",
    titulo: "Caixas postais e-CAC e DTE",
    descricao: "Robôs leem as mensagens novas do e-CAC e do DTE estadual; a IA resume e marca o que é urgente.",
  },
];
