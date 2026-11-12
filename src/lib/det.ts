import "server-only";
import { createClient } from "@/lib/supabase/server";

// Leitura da fila e dos avisos do Robô do DET (migration 20261110000400_det.sql).

export type ResumoDet = {
  competencia: string; // "AAAA-MM-01", mês da rodada atual
  naFila: number;
  concluidas: number;
  semProcuracao: number;
  falhas: number;
  avisosNoMes: number;
  ultima: string | null;
};

export type AvisoDet = {
  id: number;
  enviada_em: string;
  assunto: string;
  periodo_averbacao: string | null;
  competencia_desconto: string | null;
  lida: boolean | null;
  tarefa_id: string | null;
  cliente: { id: string; razao_social: string; fantasia: string | null };
};

export class DetIndisponivel extends Error {}

const mesAtual = () => `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7)}-01`;

export async function resumoDet(): Promise<ResumoDet> {
  const supabase = await createClient();
  const competencia = mesAtual();
  const contar = async (q: PromiseLike<{ count: number | null; error: { code?: string; message: string } | null }>) => {
    const { count, error } = await q;
    if (error) throw error.code === "PGRST205" || error.code === "42P01" ? new DetIndisponivel() : new Error(error.message);
    return count ?? 0;
  };
  const consulta = () => supabase.from("det_consultas").select("id", { count: "exact", head: true });
  const [naFila, concluidas, semProcuracao, falhas, avisosNoMes, { data: ultima }] = await Promise.all([
    contar(consulta().in("status", ["na_fila", "processando"])),
    contar(consulta().eq("competencia", competencia).eq("status", "concluida")),
    contar(consulta().eq("competencia", competencia).eq("status", "sem_procuracao")),
    contar(consulta().eq("competencia", competencia).eq("status", "erro")),
    contar(supabase.from("det_avisos").select("id", { count: "exact", head: true }).eq("consignado", true).gte("criado_em", `${competencia}T03:00:00Z`)),
    supabase.from("det_consultas").select("processada_em").not("processada_em", "is", null).order("processada_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { competencia, naFila, concluidas, semProcuracao, falhas, avisosNoMes, ultima: ultima?.processada_em ?? null };
}

export async function avisosRecentes(limite = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("det_avisos")
    .select("id, enviada_em, assunto, periodo_averbacao, competencia_desconto, lida, tarefa_id, cliente:clientes!inner(id, razao_social, fantasia)")
    .eq("consignado", true)
    .order("enviada_em", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite)
    .overrideTypes<AvisoDet[], { merge: false }>();
  if (error) throw new Error(`Falha ao ler os avisos: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Visão por empresa (det_painel), no modelo da planilha de verificação manual.

export type EmpresaDet = {
  cliente_id: string;
  codigo_dominio: number | null;
  razao_social: string;
  fantasia: string | null;
  documento: string;
  tipo_inscricao: number | null;
  competencia: string;
  status: "concluida" | "sem_procuracao" | "erro";
  processada_em: string | null;
  mensagem: string | null;
  avisos: number | null;
  nao_lidas: number | null;
  avisos_consignado: number | null;
  ultimo_aviso: string | null;
  tem_consignado: boolean;
  no_ciclo: boolean;
  aba_origem: string | null; // aba da planilha de onde a empresa veio
};

// Empresa que não foi lida: sem procuração, falha no DET ou problema na planilha.
export type PendenciaDet = {
  chave: string;
  codigo: string | null;
  aba_origem: string | null;
  razao_social: string;
  documento: string;
  tipo_inscricao: number | null;
  motivo: string;
};

export type PlanilhaDet = {
  empresas: EmpresaDet[]; // consultadas com sucesso, por nome
  comConsignado: EmpresaDet[]; // no ciclo primeiro, depois o aviso mais recente
  pendencias: PendenciaDet[];
  ciclo: string | null; // "AAAA-MM-01" da leitura mais recente
  consultadoEm: string | null;
};

// "2026-11-01" → "nov/26", como na coluna "Aviso em out/26" da planilha.
export const rotuloMes = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short", year: "2-digit" })
    .format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) // "nov. de 26"
    .replace(/\.? de /, "/");

export const motivoPendencia = (e: Pick<EmpresaDet, "status" | "mensagem">) =>
  e.status === "sem_procuracao"
    ? "Não existe procuração entre a empresa e este CNPJ no DET"
    : (e.mensagem ?? "Falha na leitura do DET");

export async function planilhaDet(): Promise<PlanilhaDet> {
  const supabase = await createClient();
  const linhas: EmpresaDet[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("det_painel")
      .select("*")
      .order("razao_social")
      .range(de, de + 999)
      .overrideTypes<EmpresaDet[], { merge: false }>();
    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01") throw new DetIndisponivel();
      throw new Error(`Falha ao ler o painel do DET: ${error.message}`);
    }
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const empresas = linhas.filter((e) => e.status === "concluida");
  const comConsignado = empresas
    .filter((e) => e.tem_consignado)
    .sort((a, b) => Number(b.no_ciclo) - Number(a.no_ciclo) || (b.ultimo_aviso ?? "").localeCompare(a.ultimo_aviso ?? ""));
  const pendencias: PendenciaDet[] = [
    ...(await problemasDaPlanilha()),
    ...linhas
      .filter((e) => e.status !== "concluida")
      .map((e) => ({
        chave: e.cliente_id,
        codigo: e.codigo_dominio === null ? null : String(e.codigo_dominio),
        aba_origem: e.aba_origem,
        razao_social: e.razao_social,
        documento: e.documento,
        tipo_inscricao: e.tipo_inscricao,
        motivo: motivoPendencia(e),
      })),
  ];
  const ciclo = linhas.reduce<string | null>((m, e) => (!m || e.competencia > m ? e.competencia : m), null);
  const consultadoEm = linhas.reduce<string | null>((m, e) => (e.processada_em && (!m || e.processada_em > m) ? e.processada_em : m), null);
  return { empresas, comConsignado, pendencias, ciclo, consultadoEm };
}

// Linhas da planilha atual que não entram na fila (CNPJ incompleto, inválido
// ou não cadastrado). Sem a migration da planilha, nenhuma.
async function problemasDaPlanilha(): Promise<PendenciaDet[]> {
  const supabase = await createClient();
  const { data: atual } = await supabase.rpc("det_planilha_atual");
  if (!atual) return [];
  const { data } = await supabase
    .from("det_empresas")
    .select("id, codigo, aba_origem, empresa, documento, problema")
    .eq("planilha_id", atual as string)
    .not("problema", "is", null)
    .order("empresa")
    .limit(1000);
  return (data ?? []).map((e) => ({
    chave: `planilha-${e.id}`,
    codigo: e.codigo,
    aba_origem: e.aba_origem,
    razao_social: e.empresa,
    documento: e.documento ?? "",
    tipo_inscricao: null,
    motivo: e.problema as string,
  }));
}

// ---------------------------------------------------------------------------
// Planilha atual (fonte do robô), para o painel de configuração.

export type PlanilhaAtual = {
  arquivo_nome: string;
  linhas: number;
  validas: number;
  enviada_em: string;
  enviada_por: { nome: string } | null;
};

export async function planilhaAtual(): Promise<PlanilhaAtual | null | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("det_planilhas")
    .select("arquivo_nome, linhas, validas, enviada_em, enviada_por:profiles!enviada_por(nome)")
    .order("enviada_em", { ascending: false })
    .limit(1)
    .maybeSingle()
    .overrideTypes<PlanilhaAtual, { merge: false }>();
  if (error) return undefined; // migration ainda não aplicada
  return data;
}

// Empresas da planilha atual por aba: total e quantas entram na fila.
export async function abasDaPlanilha() {
  const supabase = await createClient();
  const { data: atual } = await supabase.rpc("det_planilha_atual");
  if (!atual) return [];
  const { data } = await supabase
    .from("det_empresas")
    .select("aba_origem, problema")
    .eq("planilha_id", atual as string)
    .limit(10_000);
  const porAba = new Map<string, { aba: string; total: number; validas: number }>();
  for (const e of data ?? []) {
    const aba = (e.aba_origem as string | null) ?? "—";
    const a = porAba.get(aba) ?? { aba, total: 0, validas: 0 };
    a.total++;
    if (!e.problema) a.validas++;
    porAba.set(aba, a);
  }
  return [...porAba.values()];
}
