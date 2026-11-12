import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hojeISO, somarDias } from "@/lib/tarefas";
import type { StatusTarefaBanco } from "@/lib/tarefas";

// Painel do cliente: junta, para um cliente, o que cada módulo da plataforma
// sabe dele. Cada leitura respeita a RLS de quem vê (ex.: dados do DP só para
// o DP) e falha em silêncio quando o módulo ainda não foi instalado no banco
// (migration não aplicada): o painel mostra o resto.

type Resposta<T> = PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>;
async function ler<T>(consulta: Resposta<T>): Promise<T | null> {
  try {
    const { data, error } = await consulta;
    return error ? null : data;
  } catch {
    return null;
  }
}
async function contar(consulta: PromiseLike<{ count: number | null; error: unknown }>) {
  try {
    const { count, error } = await consulta;
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

const ABERTAS = "(pendente,em_andamento,aguardando_cliente)";
const primeiroDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;

// ---------------------------------------------------------------------------
// Tarefas

export type TarefaCliente = {
  id: string;
  competencia: string;
  prazo_legal: string;
  prazo_meta: string;
  status: StatusTarefaBanco;
  concluida_em: string | null;
  obrigacao: { nome: string } | null;
  departamento: { nome: string } | null;
  responsavel: { nome: string } | null;
};
const COLUNAS_TAREFA =
  "id, competencia, prazo_legal, prazo_meta, status, concluida_em, obrigacao:obrigacoes(nome), departamento:departamentos(nome), responsavel:profiles!responsavel_id(nome)";

export async function tarefasAbertas(clienteId: string) {
  const supabase = await createClient();
  return (
    (await ler(
      supabase
        .from("tarefas")
        .select(COLUNAS_TAREFA)
        .eq("cliente_id", clienteId)
        .filter("status", "in", ABERTAS)
        .order("prazo_legal")
        .limit(300)
        .overrideTypes<TarefaCliente[], { merge: false }>(),
    )) ?? []
  );
}

// Tarefas das últimas competências (abertas e fechadas), para o histórico.
export async function tarefasRecentes(clienteId: string, meses = 6) {
  const supabase = await createClient();
  const [a, m] = hojeISO().split("-").map(Number);
  const desde = new Date(Date.UTC(a, m - 1 - meses, 1)).toISOString().slice(0, 10);
  return (
    (await ler(
      supabase
        .from("tarefas")
        .select(COLUNAS_TAREFA)
        .eq("cliente_id", clienteId)
        .gte("competencia", desde)
        .order("competencia", { ascending: false })
        .order("prazo_legal")
        .limit(600)
        .overrideTypes<TarefaCliente[], { merge: false }>(),
    )) ?? []
  );
}

// ---------------------------------------------------------------------------
// Visão geral: números e o que pede atenção.

export type Atencao = { nivel: "erro" | "aviso"; texto: string; href?: string };

export type Responsavel = { departamento: string; nome: string };

export async function visaoGeral(clienteId: string) {
  const supabase = await createClient();
  const hoje = hojeISO();
  const [abertas, concluidasMes, cnd, receita, alertasReceita, guias, vencimentos, det, responsaveis, funcionarios, leituras] =
    await Promise.all([
      tarefasAbertas(clienteId),
      contar(
        supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", clienteId)
          .eq("status", "concluida")
          .gte("concluida_em", `${primeiroDoMes(hoje)}T03:00:00Z`),
      ),
      ler(
        supabase
          .from("cnd_painel")
          .select("situacao, pendencias, erros, consultado_em")
          .eq("cliente_id", clienteId)
          .maybeSingle()
          .overrideTypes<{ situacao: string; pendencias: number; erros: number; consultado_em: string | null }, { merge: false }>(),
      ),
      ler(
        supabase
          .from("cliente_receita")
          .select("situacao, data_situacao, simples, mei, verificado_em, cnae_descricao, erro")
          .eq("cliente_id", clienteId)
          .maybeSingle()
          .overrideTypes<
            {
              situacao: string | null;
              data_situacao: string | null;
              simples: boolean | null;
              mei: boolean | null;
              verificado_em: string;
              cnae_descricao: string | null;
              erro: string | null;
            },
            { merge: false }
          >(),
      ),
      ler(
        supabase
          .from("receita_alertas")
          .select("campo, de, para, criado_em")
          .eq("cliente_id", clienteId)
          .gte("criado_em", new Date(Date.parse(`${hoje}T12:00:00Z`) - 60 * 86_400_000).toISOString())
          .order("criado_em", { ascending: false })
          .limit(10)
          .overrideTypes<{ campo: string; de: string | null; para: string | null; criado_em: string }[], { merge: false }>(),
      ),
      ler(
        supabase
          .from("guias")
          .select("vencimento, valor_total")
          .eq("cliente_id", clienteId)
          .is("pago_em", null)
          .overrideTypes<{ vencimento: string; valor_total: number }[], { merge: false }>(),
      ),
      ler(
        supabase
          .from("vencimentos")
          .select("descricao, vence_em, avisar_dias")
          .eq("cliente_id", clienteId)
          .eq("ativo", true)
          .lte("vence_em", somarDias(hoje, 60))
          .order("vence_em")
          .overrideTypes<{ descricao: string; vence_em: string; avisar_dias: number }[], { merge: false }>(),
      ),
      ler(
        supabase
          .from("det_avisos")
          .select("assunto, enviada_em, lida, consignado")
          .eq("cliente_id", clienteId)
          .eq("consignado", true)
          .gte("enviada_em", somarDias(hoje, -45))
          .order("enviada_em", { ascending: false })
          .overrideTypes<{ assunto: string; enviada_em: string; lida: boolean | null; consignado: boolean }[], { merge: false }>(),
      ),
      ler(
        supabase
          .from("cliente_responsaveis")
          .select("departamento:departamentos(id, nome), profile:profiles(nome)")
          .eq("cliente_id", clienteId)
          .overrideTypes<{ departamento: { id: number; nome: string } | null; profile: { nome: string } | null }[], { merge: false }>(),
      ),
      contar(supabase.from("ponto_funcionarios").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId)),
      contar(
        supabase
          .from("documentos_leituras")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", clienteId)
          .eq("status", "conferir"),
      ),
    ]);

  const atrasadas = abertas.filter((t) => t.prazo_legal < hoje);
  const semana = abertas.filter((t) => t.prazo_legal >= hoje && t.prazo_legal <= somarDias(hoje, 7));
  const aguardando = abertas.filter((t) => t.status === "aguardando_cliente");
  const guiasVencidas = (guias ?? []).filter((g) => g.vencimento < hoje);
  const totalGuias = (guias ?? []).reduce((s, g) => s + Number(g.valor_total), 0);

  const atencao: Atencao[] = [];
  if (atrasadas.length)
    atencao.push({
      nivel: "erro",
      texto: `${atrasadas.length} ${atrasadas.length === 1 ? "tarefa atrasada" : "tarefas atrasadas"}: ${[...new Set(atrasadas.map((t) => t.obrigacao?.nome))].slice(0, 3).join(", ")}${atrasadas.length > 3 ? "…" : ""}`,
      href: "?aba=tarefas",
    });
  if (cnd?.situacao === "pendente")
    atencao.push({ nivel: "erro", texto: `CND com ${cnd.pendencias} ${cnd.pendencias === 1 ? "pendência" : "pendências"}`, href: "?aba=certidoes" });
  else if (cnd?.situacao === "erro") atencao.push({ nivel: "aviso", texto: "A última consulta de CND teve erro", href: "?aba=certidoes" });
  if (receita?.situacao && !/ATIVA/i.test(receita.situacao))
    atencao.push({ nivel: "erro", texto: `Situação na Receita Federal: ${receita.situacao}`, href: "?aba=cadastro" });
  for (const a of alertasReceita ?? [])
    atencao.push({ nivel: "aviso", texto: `Receita Federal: ${ROTULO_CAMPO_RECEITA[a.campo] ?? a.campo} mudou${a.para ? ` para ${a.para}` : ""}`, href: "?aba=cadastro" });
  if (guiasVencidas.length)
    atencao.push({ nivel: "erro", texto: `${guiasVencidas.length} ${guiasVencidas.length === 1 ? "guia vencida" : "guias vencidas"} sem comprovante`, href: "?aba=fiscal" });
  for (const v of vencimentos ?? []) {
    const passou = v.vence_em < hoje;
    atencao.push({
      nivel: passou ? "erro" : "aviso",
      texto: `${v.descricao} ${passou ? "venceu" : "vence"} em ${dataBR(v.vence_em)}`,
      href: "?aba=documentos",
    });
  }
  const detNaoLidos = (det ?? []).filter((d) => d.lida === false);
  if (detNaoLidos.length)
    atencao.push({ nivel: "aviso", texto: `${detNaoLidos.length} ${detNaoLidos.length === 1 ? "aviso" : "avisos"} de consignado no DET`, href: "?aba=pessoal" });
  if (aguardando.length)
    atencao.push({ nivel: "aviso", texto: `${aguardando.length} ${aguardando.length === 1 ? "tarefa aguardando" : "tarefas aguardando"} o cliente`, href: "?aba=tarefas" });
  if (leituras)
    atencao.push({ nivel: "aviso", texto: `${leituras} ${leituras === 1 ? "leitura de documentos" : "leituras de documentos"} para conferir`, href: "?aba=documentos" });

  return {
    tarefas: { abertas: abertas.length, atrasadas: atrasadas.length, semana: semana.length, concluidasMes: concluidasMes ?? 0, proximas: abertas.slice(0, 8) },
    cnd,
    receita,
    guias: guias ? { abertas: guias.length, vencidas: guiasVencidas.length, total: totalGuias } : null,
    funcionarios,
    responsaveis: (responsaveis ?? [])
      .filter((r) => r.departamento && r.profile)
      .sort((a, b) => a.departamento!.id - b.departamento!.id)
      .map((r) => ({ departamento: r.departamento!.nome, nome: r.profile!.nome })),
    atencao: atencao.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "erro" ? -1 : 1)),
  };
}

export const ROTULO_CAMPO_RECEITA: Record<string, string> = {
  situacao: "situação cadastral",
  cnae: "atividade principal (CNAE)",
  endereco: "endereço",
  simples: "opção pelo Simples",
  mei: "enquadramento no MEI",
};

export const dataBR = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

// ---------------------------------------------------------------------------
// Cadastro: Receita Federal e obrigações.

export async function cadastroCliente(clienteId: string) {
  const supabase = await createClient();
  const [receita, alertas, obrigacoes] = await Promise.all([
    ler(
      supabase
        .from("cliente_receita")
        .select("verificado_em, situacao, data_situacao, cnae, cnae_descricao, endereco, simples, mei, erro")
        .eq("cliente_id", clienteId)
        .maybeSingle()
        .overrideTypes<
          {
            verificado_em: string;
            situacao: string | null;
            data_situacao: string | null;
            cnae: number | null;
            cnae_descricao: string | null;
            endereco: string | null;
            simples: boolean | null;
            mei: boolean | null;
            erro: string | null;
          },
          { merge: false }
        >(),
    ),
    ler(
      supabase
        .from("receita_alertas")
        .select("id, campo, de, para, criado_em")
        .eq("cliente_id", clienteId)
        .order("criado_em", { ascending: false })
        .limit(15)
        .overrideTypes<{ id: number; campo: string; de: string | null; para: string | null; criado_em: string }[], { merge: false }>(),
    ),
    ler(
      supabase
        .from("cliente_obrigacoes")
        .select("ativo, obrigacao:obrigacoes(id, nome, periodicidade, dia_vencimento, departamento:departamentos(id, nome))")
        .eq("cliente_id", clienteId)
        .overrideTypes<
          {
            ativo: boolean;
            obrigacao: { id: number; nome: string; periodicidade: string; dia_vencimento: number; departamento: { id: number; nome: string } | null } | null;
          }[],
          { merge: false }
        >(),
    ),
  ]);
  return {
    receita,
    alertas: alertas ?? [],
    obrigacoes: (obrigacoes ?? [])
      .filter((o) => o.obrigacao)
      .map((o) => ({ ...o.obrigacao!, ativo: o.ativo }))
      .sort((a, b) => (a.departamento?.id ?? 99) - (b.departamento?.id ?? 99) || a.nome.localeCompare(b.nome)),
  };
}

// ---------------------------------------------------------------------------
// Fiscal e financeiro: NFS-e, guias e comprovantes lidos na plataforma.

export type NotaCliente = {
  id: string;
  papel: "prestada" | "tomada";
  numero: string;
  emitida_em: string;
  competencia: string | null;
  prestador_nome: string | null;
  tomador_nome: string | null;
  valor_servicos: number;
  valor_iss: number | null;
  iss_retido: boolean;
};
export type GuiaCliente = {
  id: string;
  tipo: string;
  periodo: string | null;
  codigo_receita: string | null;
  vencimento: string;
  valor_total: number;
  pago_em: string | null;
};
export type ComprovanteCliente = {
  id: string;
  pago_em: string;
  valor: number;
  forma: string;
  beneficiario_nome: string | null;
  guia_id: string | null;
};

export async function fiscalCliente(clienteId: string) {
  const supabase = await createClient();
  const hoje = hojeISO();
  const [a, m] = hoje.split("-").map(Number);
  const desde = new Date(Date.UTC(a, m - 12, 1)).toISOString().slice(0, 10);
  const [notas, guias, comprovantes] = await Promise.all([
    ler(
      supabase
        .from("fiscal_nfse")
        .select("id, papel, numero, emitida_em, competencia, prestador_nome, tomador_nome, valor_servicos, valor_iss, iss_retido")
        .eq("cliente_id", clienteId)
        .gte("emitida_em", desde)
        .order("emitida_em", { ascending: false })
        .limit(1000)
        .overrideTypes<NotaCliente[], { merge: false }>(),
    ),
    ler(
      supabase
        .from("guias")
        .select("id, tipo, periodo, codigo_receita, vencimento, valor_total, pago_em")
        .eq("cliente_id", clienteId)
        .or(`pago_em.is.null,vencimento.gte.${somarDias(hoje, -120)}`)
        .order("vencimento", { ascending: false })
        .limit(60)
        .overrideTypes<GuiaCliente[], { merge: false }>(),
    ),
    ler(
      supabase
        .from("contabil_comprovantes")
        .select("id, pago_em, valor, forma, beneficiario_nome, guia_id")
        .eq("cliente_id", clienteId)
        .order("pago_em", { ascending: false })
        .limit(15)
        .overrideTypes<ComprovanteCliente[], { merge: false }>(),
    ),
  ]);

  // Faturamento de serviços por mês (competência; senão mês da emissão).
  const porMes = new Map<string, { prestadas: number; tomadas: number; iss: number }>();
  for (const n of notas ?? []) {
    const mes = (n.competencia ?? n.emitida_em).slice(0, 7);
    const t = porMes.get(mes) ?? { prestadas: 0, tomadas: 0, iss: 0 };
    if (n.papel === "prestada") t.prestadas += Number(n.valor_servicos);
    else t.tomadas += Number(n.valor_servicos);
    t.iss += Number(n.valor_iss ?? 0);
    porMes.set(mes, t);
  }
  return {
    notas,
    porMes: [...porMes.entries()].sort(([x], [y]) => y.localeCompare(x)).slice(0, 12),
    guias,
    comprovantes,
  };
}

// ---------------------------------------------------------------------------
// Pessoal: funcionários, afastamentos, fichas ponto, DET e adiantamento.

export async function pessoalCliente(clienteId: string) {
  const supabase = await createClient();
  const hoje = hojeISO();
  const [funcionarios, afastamentos, leiturasPonto, det, adiantamentos] = await Promise.all([
    ler(
      supabase
        .from("ponto_funcionarios")
        .select("id, nome, cpf, cargo")
        .eq("cliente_id", clienteId)
        .order("nome")
        .limit(500)
        .overrideTypes<{ id: string; nome: string; cpf: string | null; cargo: string | null }[], { merge: false }>(),
    ),
    ler(
      supabase
        .from("pessoal_afastamentos")
        .select("id, tipo, inicio, fim, dias, hora_inicio, hora_fim, funcionario:ponto_funcionarios(nome)")
        .eq("cliente_id", clienteId)
        .gte("fim", somarDias(hoje, -120))
        .order("inicio", { ascending: false })
        .limit(50)
        .overrideTypes<
          {
            id: string;
            tipo: string;
            inicio: string;
            fim: string;
            dias: number | null;
            hora_inicio: string | null;
            hora_fim: string | null;
            funcionario: { nome: string } | null;
          }[],
          { merge: false }
        >(),
    ),
    ler(
      supabase
        .from("ponto_leituras")
        .select("id, status, competencia, enviada_em")
        .eq("cliente_id", clienteId)
        .order("enviada_em", { ascending: false })
        .limit(8)
        .overrideTypes<{ id: string; status: string; competencia: string | null; enviada_em: string }[], { merge: false }>(),
    ),
    ler(
      supabase
        .from("det_avisos")
        .select("id, assunto, enviada_em, lida, consignado, competencia_desconto")
        .eq("cliente_id", clienteId)
        .order("enviada_em", { ascending: false })
        .limit(12)
        .overrideTypes<
          { id: number; assunto: string; enviada_em: string; lida: boolean | null; consignado: boolean; competencia_desconto: string | null }[],
          { merge: false }
        >(),
    ),
    ler(
      supabase
        .from("adiantamento_envios")
        .select("id, competencia, arquivo_nome, destinatarios, erro, enviado_em")
        .eq("cliente_id", clienteId)
        .order("enviado_em", { ascending: false })
        .limit(6)
        .overrideTypes<
          { id: string; competencia: string; arquivo_nome: string; destinatarios: string[]; erro: string | null; enviado_em: string }[],
          { merge: false }
        >(),
    ),
  ]);
  return { funcionarios, afastamentos, leiturasPonto, det, adiantamentos };
}

// ---------------------------------------------------------------------------
// Documentos: vencimentos do cliente e leituras enviadas na plataforma.

export async function documentosCliente(clienteId: string) {
  const supabase = await createClient();
  const [vencimentos, leituras] = await Promise.all([
    ler(
      supabase
        .from("vencimentos")
        .select("id, tipo, descricao, identificador, vence_em, avisar_dias, ativo")
        .eq("cliente_id", clienteId)
        .order("ativo", { ascending: false })
        .order("vence_em")
        .limit(100)
        .overrideTypes<
          { id: string; tipo: string; descricao: string; identificador: string | null; vence_em: string; avisar_dias: number; ativo: boolean }[],
          { merge: false }
        >(),
    ),
    ler(
      supabase
        .from("documentos_leituras")
        .select("id, tipo, status, enviada_em, arquivos, itens:documentos_itens(count)")
        .eq("cliente_id", clienteId)
        .neq("status", "enviando")
        .order("enviada_em", { ascending: false })
        .limit(20)
        .overrideTypes<
          { id: string; tipo: string; status: string; enviada_em: string; arquivos: { nome: string }[]; itens: { count: number }[] }[],
          { merge: false }
        >(),
    ),
  ]);
  return { vencimentos, leituras };
}
