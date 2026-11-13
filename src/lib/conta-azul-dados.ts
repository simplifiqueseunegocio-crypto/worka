import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Dados da Conta Azul de um cliente, para a aba "Conta Azul" do painel.
// Parcelas, contas, resumo mensal e pessoas são lidos com o usuário (RLS);
// a situação da conexão vem da tabela de conexões (só servidor, sem tokens).

export type ParcelaAberta = {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string | null;
  contraparte: string | null;
  vencimento: string | null;
  total: number;
  nao_pago: number;
  status: string | null;
};

export type ResumoParcelas = { aberto: number; vencido: number; venceHoje: number; proximos30: number; qtdVencidas: number };

export type DadosContaAzul = {
  conexao: { conectadoEm: string; sincronizadoEm: string | null; aviso: string | null } | null;
  saldoTotal: number | null;
  contas: { id: string; nome: string; tipo: string | null; banco: string | null; saldo: number | null }[];
  receber: ResumoParcelas;
  pagar: ResumoParcelas;
  vencidasReceber: ParcelaAberta[];
  vencidasPagar: ParcelaAberta[];
  meses: { competencia: string; vendas_total: number | null; vendas_qtd: number | null; nfse_total: number | null; nfse_qtd: number | null; nfe_qtd: number | null }[];
  pessoas: { total: number; clientes: number; fornecedores: number; lista: { id: string; nome: string; documento: string | null; perfis: string[]; ativo: boolean }[] };
};

const LIMITE_LISTA = 15;
const LIMITE_PESSOAS = 50;

function resumir(parcelas: ParcelaAberta[], hoje: string, em30: string): ResumoParcelas {
  const r: ResumoParcelas = { aberto: 0, vencido: 0, venceHoje: 0, proximos30: 0, qtdVencidas: 0 };
  for (const p of parcelas) {
    const v = Number(p.nao_pago) || 0;
    r.aberto += v;
    if (!p.vencimento) continue;
    if (p.vencimento < hoje) {
      r.vencido += v;
      r.qtdVencidas++;
    } else if (p.vencimento === hoje) r.venceHoje += v;
    else if (p.vencimento <= em30) r.proximos30 += v;
  }
  return r;
}

export async function dadosContaAzul(clienteId: string, hoje: string): Promise<DadosContaAzul | null> {
  const supabase = await createClient();
  const [conexao, parcelas, contas, meses, pessoas, totalPessoas, totalClientes, totalFornecedores] = await Promise.all([
    createAdminClient()
      .from("conta_azul_conexoes")
      .select("conectado_em, sincronizado_em, ultimo_erro")
      .eq("cliente_id", clienteId)
      .maybeSingle(),
    supabase
      .from("conta_azul_parcelas")
      .select("id, tipo, descricao, contraparte, vencimento, total, nao_pago, status")
      .eq("cliente_id", clienteId)
      .gt("nao_pago", 0)
      .order("vencimento", { ascending: true }),
    supabase.from("conta_azul_contas").select("id, nome, tipo, banco, saldo").eq("cliente_id", clienteId).order("nome"),
    supabase
      .from("conta_azul_mensal")
      .select("competencia, vendas_total, vendas_qtd, nfse_total, nfse_qtd, nfe_qtd")
      .eq("cliente_id", clienteId)
      .order("competencia", { ascending: false }),
    supabase
      .from("conta_azul_pessoas")
      .select("id, nome, documento, perfis, ativo")
      .eq("cliente_id", clienteId)
      .order("nome")
      .limit(LIMITE_PESSOAS),
    supabase.from("conta_azul_pessoas").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId),
    supabase.from("conta_azul_pessoas").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId).contains("perfis", ["Cliente"]),
    supabase.from("conta_azul_pessoas").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId).contains("perfis", ["Fornecedor"]),
  ]);

  // Tabelas ainda não criadas (migration pendente).
  if (parcelas.error?.code === "PGRST205" || parcelas.error?.code === "42P01") return null;

  const todas = (parcelas.data ?? []) as ParcelaAberta[];
  const em30 = new Date(Date.parse(`${hoje}T12:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const receber = todas.filter((p) => p.tipo === "receber");
  const pagar = todas.filter((p) => p.tipo === "pagar");
  const vencidas = (lista: ParcelaAberta[]) => lista.filter((p) => p.vencimento && p.vencimento < hoje).slice(0, LIMITE_LISTA);
  const listaContas = (contas.data ?? []) as DadosContaAzul["contas"];
  const comSaldo = listaContas.filter((c) => c.saldo !== null);

  return {
    conexao: conexao.data
      ? {
          conectadoEm: conexao.data.conectado_em as string,
          sincronizadoEm: (conexao.data.sincronizado_em as string | null) ?? null,
          aviso: (conexao.data.ultimo_erro as string | null) ?? null,
        }
      : null,
    saldoTotal: comSaldo.length ? comSaldo.reduce((s, c) => s + Number(c.saldo), 0) : null,
    contas: listaContas,
    receber: resumir(receber, hoje, em30),
    pagar: resumir(pagar, hoje, em30),
    vencidasReceber: vencidas(receber),
    vencidasPagar: vencidas(pagar),
    meses: (meses.data ?? []) as DadosContaAzul["meses"],
    pessoas: {
      total: totalPessoas.count ?? 0,
      clientes: totalClientes.count ?? 0,
      fornecedores: totalFornecedores.count ?? 0,
      lista: (pessoas.data ?? []) as DadosContaAzul["pessoas"]["lista"],
    },
  };
}
