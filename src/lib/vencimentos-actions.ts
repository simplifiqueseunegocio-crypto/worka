"use server";

import { refresh } from "next/cache";
import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TIPOS_VENCIMENTO } from "@/lib/vencimentos-regras";

// Cadastro do Monitor de vencimentos: qualquer pessoa ativa da equipe cadastra,
// edita, renova e arquiva; excluir é de gestor/admin (RLS).

type Resultado = { erro?: string; ok?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function exigirAtivo() {
  const u = await getUsuario();
  if (!u.ativo) throw new Error("Seu acesso ainda não foi ativado.");
  return u;
}

export type EntradaVencimento = {
  id?: string;
  clienteId: string | null;
  tipo: string;
  descricao: string;
  identificador: string;
  venceEm: string;
  avisarDias: number;
  observacao: string;
};

export async function salvarVencimento(e: EntradaVencimento): Promise<Resultado> {
  try {
    await exigirAtivo();
  } catch (err) {
    return { erro: (err as Error).message };
  }
  if (!(e.tipo in TIPOS_VENCIMENTO)) return { erro: "Escolha o tipo." };
  const descricao = e.descricao.trim().slice(0, 200);
  if (!descricao) return { erro: "Descreva o item (ex.: e-CNPJ A1, Alvará de funcionamento)." };
  if (!DATA.test(e.venceEm)) return { erro: "Informe a data de vencimento." };
  const avisar = Math.round(Number(e.avisarDias));
  if (!(avisar >= 1 && avisar <= 180)) return { erro: "Avisar entre 1 e 180 dias antes." };
  if (e.clienteId && !UUID.test(e.clienteId)) return { erro: "Cliente inválido." };

  const linha = {
    cliente_id: e.clienteId || null,
    tipo: e.tipo,
    descricao,
    identificador: e.identificador.trim().slice(0, 200) || null,
    vence_em: e.venceEm,
    avisar_dias: avisar,
    observacao: e.observacao.trim().slice(0, 1000) || null,
  };
  const supabase = await createClient();
  const { error } = e.id
    ? await supabase.from("vencimentos").update(linha).eq("id", e.id)
    : await supabase.from("vencimentos").insert(linha);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { erro: "Aplique a migration 20261112000200_vencimentos.sql." };
    return { erro: "Não foi possível salvar. Tente de novo." };
  }
  refresh();
  return { ok: e.id ? "Vencimento atualizado." : "Vencimento cadastrado." };
}

// Renovou: nova data (os avisos recomeçam pelo trigger do banco).
export async function renovarVencimento(id: string, venceEm: string): Promise<Resultado> {
  if (!UUID.test(id) || !DATA.test(venceEm)) return { erro: "Data inválida." };
  try {
    await exigirAtivo();
  } catch (err) {
    return { erro: (err as Error).message };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("vencimentos").update({ vence_em: venceEm, ativo: true }).eq("id", id);
  if (error) return { erro: "Não foi possível renovar." };
  refresh();
  return { ok: "Renovado: os avisos recomeçam para a nova data." };
}

export async function arquivarVencimento(id: string, ativo: boolean): Promise<Resultado> {
  if (!UUID.test(id)) return { erro: "Item inválido." };
  try {
    await exigirAtivo();
  } catch (err) {
    return { erro: (err as Error).message };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("vencimentos").update({ ativo }).eq("id", id);
  if (error) return { erro: "Não foi possível alterar." };
  refresh();
  return { ok: ativo ? "Item reativado." : "Item arquivado: não avisa mais." };
}

export async function excluirVencimento(id: string): Promise<Resultado> {
  if (!UUID.test(id)) return { erro: "Item inválido." };
  const u = await exigirAtivo();
  if (u.papel !== "admin" && u.papel !== "gestor") return { erro: "Só gestores e administradores excluem. Use “Arquivar”." };
  const supabase = await createClient();
  const { error } = await supabase.from("vencimentos").delete().eq("id", id);
  if (error) return { erro: "Não foi possível excluir." };
  refresh();
  return { ok: "Item excluído." };
}

export async function buscarClientesVencimento(q: string) {
  await exigirAtivo();
  const termo = q.trim();
  if (termo.length < 2) return [];
  const supabase = await createClient();
  const digitos = termo.replace(/\D/g, "");
  let consulta = supabase.from("clientes").select("id, razao_social, documento, codigo_dominio").limit(8);
  if (digitos.length >= 3 && digitos.length === termo.replace(/[.\-/\s]/g, "").length) {
    consulta = digitos.length <= 6 ? consulta.eq("codigo_dominio", Number(digitos)) : consulta.like("documento", `${digitos}%`);
  } else {
    consulta = consulta.ilike("razao_social", `%${termo.replace(/[%_]/g, "")}%`).order("razao_social");
  }
  const { data } = await consulta;
  return data ?? [];
}
