"use server";

import { refresh } from "next/cache";
import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LIMITE_PDF_CERTIDAO, type SituacaoCertidao } from "@/lib/certidoes";

export type EstadoCertidao = { ok?: string; erro?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const SITUACOES: SituacaoCertidao[] = ["negativa", "positiva_efeito_negativa", "positiva"];
const BUCKET = "certidoes";

// Lança uma certidão emitida (com o PDF opcional). Qualquer pessoa da equipe.
export async function lancarCertidao(form: FormData): Promise<EstadoCertidao> {
  const clienteId = String(form.get("clienteId") ?? "");
  const tipoId = Number(form.get("tipoId"));
  const situacao = String(form.get("situacao") ?? "") as SituacaoCertidao;
  const emitidaEm = String(form.get("emitidaEm") ?? "");
  const validaAte = String(form.get("validaAte") ?? "");
  const observacao = String(form.get("observacao") ?? "")
    .trim()
    .slice(0, 500);
  const arquivo = form.get("arquivo");

  if (!UUID.test(clienteId)) return { erro: "Cliente inválido." };
  if (!Number.isInteger(tipoId) || tipoId <= 0) return { erro: "Escolha o tipo da certidão." };
  if (!SITUACOES.includes(situacao)) return { erro: "Escolha a situação." };
  if (!DATA.test(emitidaEm)) return { erro: "Informe a data de emissão." };
  if (validaAte && !DATA.test(validaAte)) return { erro: "Data de validade inválida." };
  if (validaAte && validaAte < emitidaEm) return { erro: "A validade não pode ser antes da emissão." };

  let pdf: Buffer | null = null;
  let nomeArquivo: string | null = null;
  if (arquivo instanceof File && arquivo.size) {
    if (arquivo.size > LIMITE_PDF_CERTIDAO) return { erro: "PDF maior que 4 MB." };
    pdf = Buffer.from(await arquivo.arrayBuffer());
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return { erro: "O arquivo não é um PDF." };
    nomeArquivo = (/\.pdf$/i.test(arquivo.name) ? arquivo.name : `${arquivo.name}.pdf`).slice(0, 200);
  }

  const usuario = await getUsuario();
  const supabase = await createClient();

  let caminho: string | null = null;
  if (pdf) {
    caminho = `${clienteId}/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, pdf, { contentType: "application/pdf", upsert: false });
    if (error) return { erro: "Não foi possível guardar o PDF. Tente de novo." };
  }

  const { error } = await supabase.from("certidoes").insert({
    cliente_id: clienteId,
    tipo_id: tipoId,
    situacao,
    emitida_em: emitidaEm,
    valida_ate: validaAte || null,
    arquivo_path: caminho,
    arquivo_nome: nomeArquivo,
    observacao: observacao || null,
    criado_por: usuario.id,
  });
  if (error) {
    if (caminho) await supabase.storage.from(BUCKET).remove([caminho]); // não deixa PDF solto
    if (error.code === "23503") return { erro: "Cliente ou tipo de certidão não existe mais. Recarregue a página." };
    if (error.code === "42501") return { erro: "Você não tem permissão para lançar certidões." };
    return { erro: "Não foi possível lançar agora. Tente de novo." };
  }
  refresh();
  return { ok: "Certidão lançada." };
}

// Exclui a certidão (quem lançou, gestor ou admin; RLS) e depois o PDF.
export async function excluirCertidao(id: string): Promise<EstadoCertidao> {
  if (!UUID.test(id)) return { erro: "Certidão inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("certidoes").delete().eq("id", id).select("arquivo_path");
  if (error) return { erro: "Não foi possível excluir agora. Tente de novo." };
  if (!data?.length) return { erro: "Só quem lançou, o gestor ou o admin exclui a certidão." };
  const caminho = data[0].arquivo_path as string | null;
  if (caminho) await supabase.storage.from(BUCKET).remove([caminho]);
  refresh();
  return { ok: "Certidão excluída." };
}

// Acompanhar ou não um tipo de certidão neste cliente (admin e gestor).
export async function definirAcompanhamento(
  clienteId: string,
  tipoId: number,
  acompanha: boolean,
): Promise<EstadoCertidao> {
  if (!UUID.test(clienteId) || !Number.isInteger(tipoId)) return { erro: "Dados inválidos." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente_certidao_tipos")
    .upsert({ cliente_id: clienteId, tipo_id: tipoId, acompanha })
    .select("tipo_id");
  if (error?.code === "42501" || (!error && !data?.length)) {
    return { erro: "Apenas admin ou gestor escolhe as certidões do cliente." };
  }
  if (error) return { erro: "Não foi possível alterar agora. Tente de novo." };
  refresh();
  return { ok: acompanha ? "Certidão adicionada ao cliente." : "Certidão removida do cliente." };
}

// ---------------------------------------------------------------------------
// Catálogo (admin)

export type DadosTipoCertidao = {
  nome: string;
  orgao: string;
  validadeDias: string; // vazio = sem validade padrão
  padrao: boolean;
  ativo: boolean;
};

export async function salvarTipoCertidao(d: DadosTipoCertidao, id?: number): Promise<EstadoCertidao> {
  const nome = d.nome.trim().slice(0, 80);
  if (!nome) return { erro: "Dê um nome ao tipo." };
  const validade = d.validadeDias.trim() ? Number(d.validadeDias) : null;
  if (validade !== null && (!Number.isInteger(validade) || validade < 1 || validade > 3650)) {
    return { erro: "Validade em dias: de 1 a 3650." };
  }
  const registro = {
    nome,
    orgao: d.orgao.trim().slice(0, 120) || null,
    validade_dias: validade,
    padrao: d.padrao,
    ativo: d.ativo,
  };
  const supabase = await createClient();
  const { data, error } =
    id !== undefined
      ? await supabase.from("certidao_tipos").update(registro).eq("id", id).select("id")
      : await supabase.from("certidao_tipos").insert(registro).select("id");
  if (error?.code === "23505") return { erro: "Já existe um tipo com esse nome." };
  if (error?.code === "42501" || (!error && !data?.length)) return { erro: "Apenas o admin altera o catálogo." };
  if (error) return { erro: "Não foi possível salvar agora. Tente de novo." };
  refresh();
  return { ok: id !== undefined ? "Tipo atualizado." : "Tipo criado." };
}

// Só tipos cadastrados pela equipe e sem certidão lançada; os demais se desativam.
export async function excluirTipoCertidao(id: number): Promise<EstadoCertidao> {
  if (!Number.isInteger(id)) return { erro: "Tipo inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("certidao_tipos").delete().eq("id", id).select("id");
  if (error?.code === "23503") return { erro: "Há certidões lançadas deste tipo. Desative em vez de excluir." };
  if (error) return { erro: "Não foi possível excluir agora. Tente de novo." };
  if (!data?.length) return { erro: "Tipos com consulta automática não são excluídos; desative-os." };
  refresh();
  return { ok: "Tipo excluído." };
}
