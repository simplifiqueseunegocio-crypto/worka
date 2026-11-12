"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoContato = { ok?: string; erro?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEM_PERMISSAO = "Apenas admin, gestor ou o Departamento Pessoal altera os contatos.";

// Contatos do cliente: admin e gestores (RLS "escrita") ou o Pessoal (RLS "pessoal").
export async function salvarContato(form: FormData): Promise<EstadoContato> {
  const clienteId = String(form.get("clienteId") ?? "");
  const nome = String(form.get("nome") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const telefone = String(form.get("telefone") ?? "").trim().slice(0, 40);
  const cargo = String(form.get("cargo") ?? "").trim().slice(0, 80);
  const recebe = form.get("recebe_adiantamento") === "on";
  if (!UUID.test(clienteId)) return { erro: "Cliente inválido." };
  if (!nome) return { erro: "Informe o nome do contato." };
  if (email && !EMAIL.test(email)) return { erro: "E-mail inválido." };
  if (recebe && !email) return { erro: "Para receber a folha, o contato precisa de e-mail." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente_contatos")
    .insert({
      cliente_id: clienteId,
      nome,
      email: email || null,
      telefone: telefone || null,
      cargo: cargo || null,
      recebe_adiantamento: recebe,
    })
    .select("id");
  if (error?.code === "42501" || (!error && !data?.length)) return { erro: SEM_PERMISSAO };
  if (error) return { erro: "Não foi possível salvar agora. Tente de novo." };
  refresh();
  return { ok: "Contato adicionado." };
}

export async function marcarRecebeAdiantamento(contatoId: string, recebe: boolean): Promise<EstadoContato> {
  if (!UUID.test(contatoId)) return { erro: "Contato inválido." };
  const supabase = await createClient();
  let consulta = supabase.from("cliente_contatos").update({ recebe_adiantamento: recebe }).eq("id", contatoId);
  if (recebe) consulta = consulta.not("email", "is", null);
  const { data, error } = await consulta.select("id");
  if (error) return { erro: "Não foi possível alterar agora. Tente de novo." };
  if (!data?.length) return { erro: recebe ? "Cadastre um e-mail antes ou verifique sua permissão." : SEM_PERMISSAO };
  refresh();
  return { ok: recebe ? "Passa a receber a folha." : "Deixa de receber a folha." };
}

export async function removerContato(contatoId: string): Promise<EstadoContato> {
  if (!UUID.test(contatoId)) return { erro: "Contato inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("cliente_contatos").delete().eq("id", contatoId).select("id");
  if (error) return { erro: "Não foi possível remover agora. Tente de novo." };
  if (!data?.length) return { erro: SEM_PERMISSAO };
  refresh();
  return { ok: "Contato removido." };
}
