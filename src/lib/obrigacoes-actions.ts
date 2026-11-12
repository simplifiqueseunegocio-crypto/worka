"use server";

import { refresh } from "next/cache";
import { getUsuario } from "@/lib/auth";
import type { Ajuste, Periodicidade, RegimeObrigacao } from "@/lib/prazos";
import { createClient } from "@/lib/supabase/server";

export type EstadoObrigacao = { ok?: string; erro?: string; id?: number };

const PERIODICIDADES: Periodicidade[] = ["mensal", "trimestral", "anual"];
const AJUSTES: Ajuste[] = ["antecipa", "posterga", "nenhum"];
const REGIMES: RegimeObrigacao[] = ["simples", "presumido", "real", "mei"];

function inteiro(form: FormData, campo: string, min: number, max: number) {
  const n = Number(form.get(campo));
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Cria ou edita uma obrigação (só admin, pela RLS). Ao mudar os regimes, ajusta
// os vínculos: o banco só vincula sozinho quando a obrigação é criada.
// As tarefas já geradas mantêm o prazo; a regra vale para as próximas.
export async function salvarObrigacao(_estado: EstadoObrigacao, form: FormData): Promise<EstadoObrigacao> {
  const usuario = await getUsuario();
  if (!usuario.ativo || usuario.papel !== "admin") return { erro: "Apenas administradores alteram o catálogo." };

  const id = form.get("id") ? Number(form.get("id")) : null;
  const nome = String(form.get("nome") ?? "").trim().slice(0, 120);
  const periodicidade = String(form.get("periodicidade")) as Periodicidade;
  const ajuste = String(form.get("ajuste")) as Ajuste;
  const regimes = [...new Set(form.getAll("regime").map(String))].filter((r): r is RegimeObrigacao =>
    REGIMES.includes(r as RegimeObrigacao),
  );
  const departamento_id = inteiro(form, "departamento_id", 1, 32767);
  const dia_vencimento = inteiro(form, "dia_vencimento", 1, 31);
  const meses_apos = inteiro(form, "meses_apos", 0, 12);
  const meta_dias_antes = inteiro(form, "meta_dias_antes", 0, 60);

  if (id !== null && !Number.isInteger(id)) return { erro: "Obrigação inválida." };
  if (nome.length < 2) return { erro: "Informe o nome da obrigação." };
  if (!departamento_id) return { erro: "Escolha o departamento." };
  if (!PERIODICIDADES.includes(periodicidade)) return { erro: "Escolha a periodicidade." };
  if (!AJUSTES.includes(ajuste)) return { erro: "Escolha o que fazer quando não for dia útil." };
  if (dia_vencimento === null) return { erro: "O dia de vencimento vai de 1 a 31." };
  if (meses_apos === null) return { erro: "O mês de vencimento é inválido." };
  if (meta_dias_antes === null) return { erro: "A meta interna vai de 0 a 60 dias antes." };
  if (!regimes.length) return { erro: "Marque ao menos um regime." };

  const dados = { nome, departamento_id, periodicidade, dia_vencimento, meses_apos, ajuste, meta_dias_antes, regimes };
  const supabase = await createClient();

  if (id === null) {
    // Nova: o trigger obrigacoes_vincula liga os clientes dos regimes marcados.
    const { data, error } = await supabase.from("obrigacoes").insert(dados).select("id").single();
    if (error) return { erro: error.code === "23505" ? "Já existe uma obrigação com esse nome." : "Não foi possível criar." };
    refresh();
    return { ok: "Obrigação criada e vinculada aos clientes dos regimes marcados.", id: data.id };
  }

  const { data: antes } = await supabase.from("obrigacoes").select("regimes").eq("id", id).maybeSingle();
  if (!antes) return { erro: "Obrigação não encontrada." };

  const { error } = await supabase.from("obrigacoes").update(dados).eq("id", id);
  if (error) return { erro: error.code === "23505" ? "Já existe uma obrigação com esse nome." : "Não foi possível salvar." };

  const anteriores = antes.regimes as RegimeObrigacao[];
  const entraram = regimes.filter((r) => !anteriores.includes(r));
  const sairam = anteriores.filter((r) => !regimes.includes(r));
  const vinculos = await ajustarVinculos(id, entraram, sairam);
  refresh();
  return { ok: vinculos ? `Obrigação salva. ${vinculos}` : "Obrigação salva.", id };
}

// Liga os clientes dos regimes que entraram e desliga (sem apagar) os dos que saíram.
async function ajustarVinculos(id: number, entraram: RegimeObrigacao[], sairam: RegimeObrigacao[]) {
  const supabase = await createClient();
  const partes: string[] = [];

  if (entraram.length) {
    const { data: clientes } = await supabase.from("clientes").select("id").in("regime", entraram);
    const linhas = (clientes ?? []).map((c) => ({ cliente_id: c.id, obrigacao_id: id, ativo: true }));
    if (linhas.length) {
      const { error } = await supabase.from("cliente_obrigacoes").upsert(linhas);
      partes.push(error ? "Falha ao vincular os novos clientes." : `${linhas.length} clientes vinculados.`);
    }
  }
  if (sairam.length) {
    const { data: clientes } = await supabase.from("clientes").select("id").in("regime", sairam);
    const ids = (clientes ?? []).map((c) => c.id);
    if (ids.length) {
      const { error } = await supabase
        .from("cliente_obrigacoes")
        .update({ ativo: false })
        .eq("obrigacao_id", id)
        .in("cliente_id", ids);
      partes.push(error ? "Falha ao desvincular clientes." : `${ids.length} clientes desvinculados.`);
    }
  }
  return partes.join(" ");
}

// Desativada, a obrigação para de gerar tarefas; as já geradas continuam.
export async function alterarAtivoObrigacao(id: number, ativo: boolean): Promise<EstadoObrigacao> {
  const usuario = await getUsuario();
  if (!usuario.ativo || usuario.papel !== "admin") return { erro: "Apenas administradores alteram o catálogo." };
  if (!Number.isInteger(id)) return { erro: "Obrigação inválida." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("obrigacoes").update({ ativo }).eq("id", id).select("id");
  if (error || !data?.length) return { erro: "Não foi possível alterar." };
  refresh();
  return { ok: ativo ? "Obrigação reativada." : "Obrigação desativada: não gera novas tarefas." };
}
