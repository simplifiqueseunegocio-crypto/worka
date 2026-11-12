"use server";

import { refresh } from "next/cache";
import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_CERTIFICADOS, LIMITE_PFX } from "@/lib/certificados";

// Envio e exclusão do certificado A1 (só admin). O arquivo vai para o bucket
// privado pelo servidor; a equipe não tem acesso direto ao Storage.

export type EstadoCertificado = { ok?: string; erro?: string };

const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function exigirAdmin() {
  const u = await getUsuario();
  return u.ativo && u.papel === "admin";
}

export async function enviarCertificado(form: FormData): Promise<EstadoCertificado> {
  if (!(await exigirAdmin())) return { erro: "Só administradores enviam o certificado." };

  const nome = String(form.get("nome") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const validoAte = String(form.get("validoAte") ?? "");
  const observacao = String(form.get("observacao") ?? "").trim().slice(0, 500);
  const arquivo = form.get("arquivo");

  if (!nome) return { erro: "Dê um nome ao certificado (ex.: A1 Empresa 2026/2027)." };
  if (!DATA.test(validoAte)) return { erro: "Informe até quando o certificado é válido." };
  if (!(arquivo instanceof File) || !arquivo.size) return { erro: "Escolha o arquivo .pfx ou .p12." };
  if (!/\.(pfx|p12)$/i.test(arquivo.name)) return { erro: "O arquivo precisa ser .pfx ou .p12." };
  if (arquivo.size > LIMITE_PFX) return { erro: "Arquivo maior que 100 KB: não parece um certificado A1." };

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (bytes[0] !== 0x30) return { erro: "O arquivo não é um certificado PKCS#12 válido." }; // DER começa com SEQUENCE

  const caminho = `${crypto.randomUUID()}.pfx`;
  const admin = createAdminClient();
  const { error: e1 } = await admin.storage
    .from(BUCKET_CERTIFICADOS)
    .upload(caminho, bytes, { contentType: "application/x-pkcs12", upsert: false });
  if (e1) return { erro: "Não foi possível guardar o arquivo. Tente de novo." };

  const supabase = await createClient();
  const { error } = await supabase.from("certificados").insert({
    nome,
    valido_ate: validoAte,
    arquivo_path: caminho,
    // Nunca o nome original: costuma trazer a senha (ex.: "... senha 123.pfx").
    arquivo_nome: `${nome}.pfx`.slice(0, 200),
    arquivo_bytes: arquivo.size,
    observacao: observacao || null,
  });
  if (error) {
    await admin.storage.from(BUCKET_CERTIFICADOS).remove([caminho]); // não deixa arquivo solto
    return { erro: error.code === "42501" ? "Só administradores enviam o certificado." : "Não foi possível salvar agora." };
  }
  refresh();
  return { ok: "Certificado enviado. A equipe já pode baixar." };
}

export async function excluirCertificado(id: string): Promise<EstadoCertificado> {
  if (!(await exigirAdmin())) return { erro: "Só administradores excluem o certificado." };
  if (!UUID.test(id)) return { erro: "Certificado inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("certificados").delete().eq("id", id).select("arquivo_path");
  if (error || !data?.length) return { erro: "Não foi possível excluir. Recarregue a página." };
  await createAdminClient().storage.from(BUCKET_CERTIFICADOS).remove(data.map((c) => c.arquivo_path as string));
  refresh();
  return { ok: "Certificado excluído." };
}
