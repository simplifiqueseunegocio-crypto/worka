"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeUsarPonto } from "@/lib/ponto";
import { BUCKET_PONTO, processarLeitura, type ArquivoPonto } from "@/lib/ponto-leitura";
import { horaValida, nomeComparavel } from "@/lib/ponto-regras";

// Ações da leitura de ficha ponto. O arquivo vai do navegador direto para o
// Storage (link assinado), sem passar pelo limite de 4,5 MB da Vercel.

const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const LIMITE_ARQUIVO = 30 * 1024 * 1024;
const MAX_ARQUIVOS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Resultado = { erro?: string; ok?: string };

async function exigirAcesso() {
  const usuario = await getUsuario();
  if (!(await podeUsarPonto(usuario))) throw new Error("Só o Departamento Pessoal, gestores e administradores usam a leitura de ponto.");
  return usuario;
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-80);

// 1. Cria a leitura e devolve um link de envio para cada arquivo.
export async function prepararEnvioPonto(entrada: {
  competencia: string | null;
  arquivos: { nome: string; tipo: string; bytes: number }[];
}): Promise<{ erro: string } | { leituraId: string; envios: { path: string; token: string }[] }> {
  try {
    await exigirAcesso();
  } catch (e) {
    return { erro: (e as Error).message };
  }
  const { arquivos } = entrada;
  if (!arquivos.length) return { erro: "Escolha ao menos um arquivo." };
  if (arquivos.length > MAX_ARQUIVOS) return { erro: `Envie no máximo ${MAX_ARQUIVOS} arquivos por vez.` };
  for (const a of arquivos) {
    if (!TIPOS.includes(a.tipo)) return { erro: `${a.nome}: envie PDF, JPG, PNG ou WEBP. (Foto do iPhone em HEIC: exporte como JPG.)` };
    if (a.bytes > LIMITE_ARQUIVO) return { erro: `${a.nome}: arquivo maior que 30 MB.` };
  }
  const competencia = entrada.competencia && /^\d{4}-(0[1-9]|1[0-2])$/.test(entrada.competencia) ? `${entrada.competencia}-01` : null;

  const supabase = await createClient();
  const { data: leitura, error } = await supabase.from("ponto_leituras").insert({ competencia }).select("id").single();
  if (error || !leitura) {
    if (error?.code === "42P01" || error?.code === "PGRST205") return { erro: "Aplique a migration 20261112000000_ponto.sql." };
    return { erro: "Não foi possível começar o envio. Tente de novo." };
  }

  const lista: ArquivoPonto[] = arquivos.map((a, i) => ({ path: `${leitura.id}/${i + 1}-${slug(a.nome)}`, nome: a.nome.slice(0, 200), tipo: a.tipo, bytes: a.bytes }));
  const storage = createAdminClient().storage.from(BUCKET_PONTO);
  const envios: { path: string; token: string }[] = [];
  for (const a of lista) {
    const { data, error: e } = await storage.createSignedUploadUrl(a.path);
    if (e || !data) {
      await supabase.from("ponto_leituras").delete().eq("id", leitura.id);
      return { erro: "Não foi possível preparar o envio dos arquivos." };
    }
    envios.push({ path: a.path, token: data.token });
  }
  await supabase.from("ponto_leituras").update({ arquivos: lista }).eq("id", leitura.id);
  return { leituraId: leitura.id, envios };
}

// 2. Arquivos enviados: começa a leitura (continua depois da resposta).
export async function iniciarLeituraPonto(leituraId: string): Promise<Resultado> {
  if (!UUID.test(leituraId)) return { erro: "Leitura inválida." };
  try {
    await exigirAcesso();
  } catch (e) {
    return { erro: (e as Error).message };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ponto_leituras")
    .update({ status: "lendo", mensagem: null, paginas_lidas: 0 })
    .eq("id", leituraId)
    .in("status", ["enviando", "erro", "conferir", "lendo"])
    .select("id")
    .maybeSingle();
  if (error || !data) return { erro: "Esta leitura não pode ser lida agora." };
  after(() => processarLeitura(leituraId));
  refresh();
  return { ok: "Lendo as fichas…" };
}

// Salva as correções de uma ficha (e, se pedido, marca como conferida).
const DiaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  marcacoes: z.array(z.object({ hora: z.string().max(5), manual: z.boolean() })).max(12),
  ocorrencia: z.string().max(60).nullable(),
  observacao: z.string().max(500).nullable(),
  duvida: z.string().max(500).nullable(),
});

export async function salvarFichaPonto(fichaId: string, dias: unknown, conferida: boolean): Promise<Resultado> {
  if (!UUID.test(fichaId)) return { erro: "Ficha inválida." };
  let usuario;
  try {
    usuario = await exigirAcesso();
  } catch (e) {
    return { erro: (e as Error).message };
  }
  const v = z.array(DiaSchema).max(62).safeParse(dias);
  if (!v.success) return { erro: "Dados da ficha inválidos." };
  const ruins = v.data.flatMap((d) => d.marcacoes.filter((m) => !horaValida(m.hora)).map(() => d.data));
  if (conferida && ruins.length) return { erro: `Corrija os horários inválidos (${[...new Set(ruins)].map((d) => d.split("-").reverse().slice(0, 2).join("/")).join(", ")}) antes de marcar como conferida.` };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ponto_fichas")
    .update({
      dias: v.data,
      conferida,
      conferida_por: conferida ? usuario.id : null,
      conferida_em: conferida ? new Date().toISOString() : null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", fichaId);
  if (error) return { erro: "Não foi possível salvar. Tente de novo." };
  refresh();
  return { ok: conferida ? "Ficha conferida." : "Correções salvas." };
}

// Cliente da leitura (quando não foi reconhecido pelo CNPJ da ficha).
export async function buscarClientesPonto(q: string) {
  await exigirAcesso();
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

// Troca o cliente de UMA ficha (as outras fichas da leitura não mudam) e a liga
// ao funcionário já cadastrado nesse cliente (CPF; senão nome igual).
export async function definirClienteFichaPonto(fichaId: string, clienteId: string): Promise<Resultado> {
  if (!UUID.test(fichaId) || !UUID.test(clienteId)) return { erro: "Dados inválidos." };
  try {
    await exigirAcesso();
  } catch (e) {
    return { erro: (e as Error).message };
  }
  const supabase = await createClient();
  const { data: ficha } = await supabase
    .from("ponto_fichas")
    .select("id, nome, cpf, leitura_id, leitura:ponto_leituras(status, cliente_id)")
    .eq("id", fichaId)
    .maybeSingle()
    .overrideTypes<{ id: string; nome: string; cpf: string | null; leitura_id: string; leitura: { status: string; cliente_id: string | null } | null }, { merge: false }>();
  if (!ficha?.leitura) return { erro: "Ficha não encontrada." };
  if (ficha.leitura.status === "confirmada") return { erro: "Reabra a leitura para trocar o cliente." };

  const { data: funcionarios } = await supabase.from("ponto_funcionarios").select("id, nome, cpf").eq("cliente_id", clienteId);
  const funcionarioId =
    funcionarios?.find((f) => ficha.cpf && f.cpf === ficha.cpf)?.id ??
    funcionarios?.find((f) => nomeComparavel(f.nome) === nomeComparavel(ficha.nome))?.id ??
    null;
  const { error } = await supabase.from("ponto_fichas").update({ cliente_id: clienteId, funcionario_id: funcionarioId }).eq("id", fichaId);
  if (error) return { erro: "Não foi possível trocar o cliente desta ficha." };
  // Leitura sem cliente (ou com uma ficha só): passa a mostrar este.
  const { count } = await supabase.from("ponto_fichas").select("id", { count: "exact", head: true }).eq("leitura_id", ficha.leitura_id);
  if (!ficha.leitura.cliente_id || count === 1) await supabase.from("ponto_leituras").update({ cliente_id: clienteId }).eq("id", ficha.leitura_id);
  refresh();
  return { ok: `Cliente trocado só na ficha de ${ficha.nome}.` };
}

// Confirma a leitura: todas as fichas conferidas; cadastra/liga os funcionários.
export async function confirmarLeituraPonto(leituraId: string): Promise<Resultado> {
  if (!UUID.test(leituraId)) return { erro: "Leitura inválida." };
  let usuario;
  try {
    usuario = await exigirAcesso();
  } catch (e) {
    return { erro: (e as Error).message };
  }
  const supabase = await createClient();
  const { data: leitura } = await supabase
    .from("ponto_leituras")
    .select("id, status, cliente_id, fichas:ponto_fichas(id, nome, cpf, cargo, conferida, funcionario_id, cliente_id)")
    .eq("id", leituraId)
    .maybeSingle();
  if (!leitura) return { erro: "Leitura não encontrada." };
  if (leitura.status !== "conferir") return { erro: "Esta leitura não está em conferência." };
  // Cada ficha com o seu cliente; sem cliente próprio, o da leitura.
  const fichas = (
    leitura.fichas as { id: string; nome: string; cpf: string | null; cargo: string | null; conferida: boolean; funcionario_id: string | null; cliente_id: string | null }[]
  ).map((f) => ({ ...f, cliente: f.cliente_id ?? (leitura.cliente_id as string | null) }));
  const semCliente = fichas.filter((f) => !f.cliente);
  if (semCliente.length) return { erro: `Escolha o cliente de: ${semCliente.map((f) => f.nome).join(", ")}.` };
  const faltam = fichas.filter((f) => !f.conferida);
  if (faltam.length) return { erro: `Faltam conferir ${faltam.length} ${faltam.length === 1 ? "ficha" : "fichas"}.` };

  for (const f of fichas.filter((x) => !x.funcionario_id)) {
    let funcionarioId: string | null = null;
    if (f.cpf) {
      const { data } = await supabase
        .from("ponto_funcionarios")
        .upsert({ cliente_id: f.cliente, nome: f.nome, cpf: f.cpf, cargo: f.cargo }, { onConflict: "cliente_id,cpf" })
        .select("id")
        .single();
      funcionarioId = data?.id ?? null;
    } else {
      const { data } = await supabase.from("ponto_funcionarios").insert({ cliente_id: f.cliente, nome: f.nome, cargo: f.cargo }).select("id").single();
      funcionarioId = data?.id ?? null;
    }
    if (!funcionarioId) return { erro: `Não foi possível cadastrar ${f.nome}.` };
    await supabase.from("ponto_fichas").update({ funcionario_id: funcionarioId }).eq("id", f.id);
  }

  const { error } = await supabase
    .from("ponto_leituras")
    .update({ status: "confirmada", confirmada_por: usuario.id, confirmada_em: new Date().toISOString() })
    .eq("id", leituraId);
  if (error) return { erro: "Não foi possível confirmar. Tente de novo." };
  refresh();
  return { ok: "Leitura confirmada." };
}

// Volta uma leitura confirmada para conferência.
export async function reabrirLeituraPonto(leituraId: string): Promise<Resultado> {
  if (!UUID.test(leituraId)) return { erro: "Leitura inválida." };
  try {
    await exigirAcesso();
  } catch (e) {
    return { erro: (e as Error).message };
  }
  const supabase = await createClient();
  await supabase.from("ponto_leituras").update({ status: "conferir", confirmada_por: null, confirmada_em: null }).eq("id", leituraId).eq("status", "confirmada");
  refresh();
  return { ok: "Leitura reaberta para conferência." };
}

export async function excluirLeituraPonto(leituraId: string) {
  if (!UUID.test(leituraId)) return;
  await exigirAcesso();
  const supabase = await createClient();
  const { data } = await supabase.from("ponto_leituras").select("arquivos").eq("id", leituraId).maybeSingle();
  if (!data) return;
  const paths = (data.arquivos as ArquivoPonto[]).map((a) => a.path);
  if (paths.length) await createAdminClient().storage.from(BUCKET_PONTO).remove(paths);
  await supabase.from("ponto_leituras").delete().eq("id", leituraId);
  redirect("/automacoes/ponto");
}
