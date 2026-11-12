"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fornecedorIa, hojeSP } from "@/lib/ia-extracao";
import { tipoDocumento, valor, type Dados } from "@/lib/documentos/tipos";
import { BUCKET_DOCUMENTOS, podeUsarDocumento, type ArquivoDocumento } from "@/lib/documentos/dados";
import { processarLeituraDocumento } from "@/lib/documentos/processar";
import { acaoDoTipo } from "@/lib/documentos/confirmar";

// Ações do pipeline de leitura de documentos (todos os tipos). O arquivo vai do
// navegador direto para o Storage (link assinado), sem o limite de 4,5 MB.

const TIPOS_ARQUIVO = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const LIMITE_ARQUIVO = 30 * 1024 * 1024;
const MAX_ARQUIVOS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Resultado = { erro?: string; ok?: string };

async function exigir(tipo: string) {
  const usuario = await getUsuario();
  const t = tipoDocumento(tipo);
  if (!t) throw new Error("Tipo de documento desconhecido.");
  if (!(await podeUsarDocumento(usuario, tipo))) throw new Error(`Sem acesso ao ${t.titulo.toLowerCase()}.`);
  return { usuario, tipo: t };
}

// Tipo da leitura (para conferir o acesso antes de mexer nela).
async function tipoDaLeitura(leituraId: string) {
  if (!UUID.test(leituraId)) throw new Error("Leitura inválida.");
  const supabase = await createClient();
  const { data } = await supabase.from("documentos_leituras").select("tipo").eq("id", leituraId).maybeSingle();
  if (!data) throw new Error("Leitura não encontrada.");
  return data.tipo as string;
}

const tentar = async (fn: () => Promise<Resultado>): Promise<Resultado> => {
  try {
    return await fn();
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha inesperada." };
  }
};

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-80);

// 1. Cria a leitura e devolve um link de envio para cada arquivo.
export async function prepararEnvioDocumento(entrada: {
  tipo: string;
  clienteId: string | null;
  arquivos: { nome: string; tipo: string; bytes: number }[];
}): Promise<{ erro: string } | { leituraId: string; envios: { path: string; token: string }[] }> {
  try {
    await exigir(entrada.tipo);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  if (!fornecedorIa()) return { erro: "Nenhuma IA configurada no servidor (GROQ_API_KEY ou ANTHROPIC_API_KEY)." };
  const { arquivos } = entrada;
  if (!arquivos.length) return { erro: "Escolha ao menos um arquivo." };
  if (arquivos.length > MAX_ARQUIVOS) return { erro: `Envie no máximo ${MAX_ARQUIVOS} arquivos por vez.` };
  for (const a of arquivos) {
    if (!TIPOS_ARQUIVO.includes(a.tipo)) return { erro: `${a.nome}: envie PDF, JPG, PNG ou WEBP. (Foto do iPhone em HEIC: exporte como JPG.)` };
    if (a.bytes > LIMITE_ARQUIVO) return { erro: `${a.nome}: arquivo maior que 30 MB.` };
  }
  const clienteId = entrada.clienteId && UUID.test(entrada.clienteId) ? entrada.clienteId : null;

  const supabase = await createClient();
  const { data: leitura, error } = await supabase.from("documentos_leituras").insert({ tipo: entrada.tipo, cliente_id: clienteId }).select("id").single();
  if (error || !leitura) {
    if (error?.code === "42P01" || error?.code === "PGRST205") return { erro: "Aplique a migration 20261112000100_documentos.sql." };
    return { erro: "Não foi possível começar o envio. Tente de novo." };
  }
  const lista: ArquivoDocumento[] = arquivos.map((a, i) => ({ path: `${leitura.id}/${i + 1}-${slug(a.nome)}`, nome: a.nome.slice(0, 200), tipo: a.tipo, bytes: a.bytes }));
  const storage = createAdminClient().storage.from(BUCKET_DOCUMENTOS);
  const envios: { path: string; token: string }[] = [];
  for (const a of lista) {
    const { data, error: e } = await storage.createSignedUploadUrl(a.path);
    if (e || !data) {
      await supabase.from("documentos_leituras").delete().eq("id", leitura.id);
      return { erro: "Não foi possível preparar o envio dos arquivos." };
    }
    envios.push({ path: a.path, token: data.token });
  }
  await supabase.from("documentos_leituras").update({ arquivos: lista }).eq("id", leitura.id);
  return { leituraId: leitura.id, envios };
}

// 2. Começa (ou refaz) a leitura; continua depois da resposta.
export async function iniciarLeituraDocumento(leituraId: string): Promise<Resultado> {
  return tentar(async () => {
    await exigir(await tipoDaLeitura(leituraId));
    const supabase = await createClient();
    const { data } = await supabase
      .from("documentos_leituras")
      .update({ status: "lendo", mensagem: null, paginas_lidas: 0 })
      .eq("id", leituraId)
      .in("status", ["enviando", "erro", "conferir", "lendo"])
      .select("id")
      .maybeSingle();
    if (!data) return { erro: "Esta leitura não pode ser lida agora." };
    after(() => processarLeituraDocumento(leituraId));
    refresh();
    return { ok: "Lendo os documentos…" };
  });
}

// Salva as correções de um item (e, se pedido, marca como conferido).
export async function salvarItemDocumento(itemId: string, dados: Dados, conferido: boolean): Promise<Resultado> {
  return tentar(async () => {
    if (!UUID.test(itemId)) return { erro: "Item inválido." };
    const supabase = await createClient();
    const { data: item } = await supabase
      .from("documentos_itens")
      .select("leitura_id, leitura:documentos_leituras(cliente:clientes(documento))")
      .eq("id", itemId)
      .maybeSingle()
      .overrideTypes<{ leitura_id: string; leitura: { cliente: { documento: string | null } | null } | null }, { merge: false }>();
    if (!item) return { erro: "Item não encontrado." };
    const { usuario, tipo } = await exigir(await tipoDaLeitura(item.leitura_id));

    // Só os campos do tipo, com tamanho limitado.
    const limpos: Dados = {};
    for (const c of tipo.campos) {
      const v = dados[c.chave];
      limpos[c.chave] =
        v === null || v === undefined || v === ""
          ? null
          : c.tipo === "moeda"
            ? valor(v)
            : c.tipo === "numero"
              ? Number.isFinite(Number(v))
                ? Number(v)
                : null
              : String(v).slice(0, 500);
    }
    limpos.duvida = typeof dados.duvida === "string" ? dados.duvida.slice(0, 500) : null;
    const normal = tipo.normalizar ? tipo.normalizar(limpos) : limpos;
    if (conferido) {
      const erros = tipo.validar(normal, { hoje: hojeSP(), clienteDocumento: item.leitura?.cliente?.documento ?? null }).filter((a) => a.tipo === "erro");
      if (erros.length) return { erro: `Corrija antes de marcar como conferido: ${erros.map((e) => e.texto).join("; ")}.` };
    }
    const { error } = await supabase
      .from("documentos_itens")
      .update({
        dados: normal,
        conferido,
        conferido_por: conferido ? usuario.id : null,
        conferido_em: conferido ? new Date().toISOString() : null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", itemId);
    if (error) return { erro: "Não foi possível salvar. Tente de novo." };
    refresh();
    return { ok: conferido ? "Conferido." : "Correções salvas." };
  });
}

// Tira um item da leitura (ex.: a IA leu algo que não é um documento do tipo).
export async function excluirItemDocumento(itemId: string): Promise<Resultado> {
  return tentar(async () => {
    if (!UUID.test(itemId)) return { erro: "Item inválido." };
    const supabase = await createClient();
    const { data: item } = await supabase.from("documentos_itens").select("leitura_id").eq("id", itemId).maybeSingle();
    if (!item) return { erro: "Item não encontrado." };
    await exigir(await tipoDaLeitura(item.leitura_id));
    await supabase.from("documentos_itens").delete().eq("id", itemId);
    refresh();
    return { ok: "Item removido." };
  });
}

export async function buscarClientesDocumento(tipo: string, q: string) {
  await exigir(tipo);
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

export async function definirClienteDocumento(leituraId: string, clienteId: string): Promise<Resultado> {
  return tentar(async () => {
    if (!UUID.test(clienteId)) return { erro: "Cliente inválido." };
    await exigir(await tipoDaLeitura(leituraId));
    const supabase = await createClient();
    const { error } = await supabase.from("documentos_leituras").update({ cliente_id: clienteId }).eq("id", leituraId).neq("status", "confirmada");
    if (error) return { erro: "Não foi possível trocar o cliente." };
    // Funcionários ligados a outro cliente deixam de valer.
    await supabase.from("documentos_itens").update({ funcionario_id: null }).eq("leitura_id", leituraId);
    refresh();
    return { ok: "Cliente definido." };
  });
}

// Confirma: todos os itens conferidos; grava o resultado do tipo.
export async function confirmarLeituraDocumento(leituraId: string): Promise<Resultado> {
  return tentar(async () => {
    const tipoChave = await tipoDaLeitura(leituraId);
    const { usuario, tipo } = await exigir(tipoChave);
    const supabase = await createClient();
    const { data: leitura } = await supabase
      .from("documentos_leituras")
      .select("id, status, cliente_id, cliente:clientes(documento), itens:documentos_itens(id, dados, funcionario_id, conferido)")
      .eq("id", leituraId)
      .maybeSingle()
      .overrideTypes<
        {
          id: string;
          status: string;
          cliente_id: string | null;
          cliente: { documento: string | null } | null;
          itens: { id: string; dados: Dados; funcionario_id: string | null; conferido: boolean }[];
        },
        { merge: false }
      >();
    if (!leitura) return { erro: "Leitura não encontrada." };
    if (leitura.status !== "conferir") return { erro: "Esta leitura não está em conferência." };
    if (!leitura.cliente_id) return { erro: "Escolha o cliente antes de confirmar." };
    const itens = leitura.itens;
    const faltam = itens.filter((i) => !i.conferido).length;
    if (faltam) return { erro: `Faltam conferir ${faltam} ${faltam === 1 ? "item" : "itens"}.` };
    // O cliente pode ter mudado depois da conferência: as regras valem de novo.
    const clienteDocumento = leitura.cliente?.documento ?? null;
    const comErro = itens.filter((i) => tipo.validar(i.dados, { hoje: hojeSP(), clienteDocumento }).some((a) => a.tipo === "erro")).length;
    if (comErro) return { erro: `${comErro} ${comErro === 1 ? "item tem" : "itens têm"} erro a corrigir: confira de novo.` };

    const acao = acaoDoTipo(tipoChave);
    const resumo = acao ? await acao.confirmar({ supabase, clienteId: leitura.cliente_id, clienteDocumento, itens }) : "";
    const { error } = await supabase
      .from("documentos_leituras")
      .update({ status: "confirmada", confirmada_por: usuario.id, confirmada_em: new Date().toISOString() })
      .eq("id", leituraId);
    if (error) return { erro: "Não foi possível confirmar. Tente de novo." };
    refresh();
    return { ok: `Leitura confirmada${resumo ? `: ${resumo}` : ""}.` };
  });
}

// Volta para conferência e desfaz o que a confirmação gravou.
export async function reabrirLeituraDocumento(leituraId: string): Promise<Resultado> {
  return tentar(async () => {
    const tipoChave = await tipoDaLeitura(leituraId);
    await exigir(tipoChave);
    const supabase = await createClient();
    const { data: itens } = await supabase.from("documentos_itens").select("id, dados, funcionario_id").eq("leitura_id", leituraId);
    await acaoDoTipo(tipoChave)?.desfazer({ supabase, itens: (itens ?? []) as { id: string; dados: Dados; funcionario_id: string | null }[] });
    await supabase.from("documentos_leituras").update({ status: "conferir", confirmada_por: null, confirmada_em: null }).eq("id", leituraId).eq("status", "confirmada");
    refresh();
    return { ok: "Leitura reaberta: o que foi lançado na confirmação foi desfeito." };
  });
}

export async function excluirLeituraDocumento(leituraId: string) {
  const tipoChave = await tipoDaLeitura(leituraId);
  await exigir(tipoChave);
  const supabase = await createClient();
  const { data } = await supabase.from("documentos_leituras").select("status, arquivos").eq("id", leituraId).maybeSingle();
  if (!data) return;
  if (data.status === "confirmada") throw new Error("Reabra a leitura antes de excluir.");
  const paths = (data.arquivos as ArquivoDocumento[]).map((a) => a.path);
  if (paths.length) await createAdminClient().storage.from(BUCKET_DOCUMENTOS).remove(paths);
  await supabase.from("documentos_leituras").delete().eq("id", leituraId);
  redirect(`/automacoes/documentos/${tipoChave}`);
}
