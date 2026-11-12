import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_CERTIFICADOS } from "@/lib/certificados";

// Baixa o certificado A1. Registra o download (quem e quando) antes de entregar
// e manda o arquivo direto, sem link assinado que possa ser repassado.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response("Certificado inválido.", { status: 400 });
  }
  const usuario = await getUsuario(); // sem sessão, vai para /login
  if (!usuario.ativo) return new Response("Seu acesso ainda não foi ativado.", { status: 403 });

  const supabase = await createClient();
  const { data: cert } = await supabase
    .from("certificados")
    .select("id, nome, arquivo_path")
    .eq("id", id)
    .maybeSingle();
  if (!cert) return new Response("Certificado não encontrado.", { status: 404 });

  const { error: e1 } = await supabase.from("certificado_downloads").insert({ certificado_id: cert.id });
  if (e1) return new Response("Não foi possível registrar o download.", { status: 403 });

  const { data: arquivo, error } = await createAdminClient().storage.from(BUCKET_CERTIFICADOS).download(cert.arquivo_path);
  if (error || !arquivo) return new Response("Não foi possível baixar o arquivo.", { status: 502 });

  // O arquivo baixado leva o nome dado na plataforma, nunca o nome original
  // (que costuma trazer a senha, ex.: "... senha 123.pfx").
  const original = `${String(cert.nome).trim() || "certificado"}.pfx`;
  const nome = original.normalize("NFD").replace(/[^\w.\- ]/g, "_");
  return new Response(arquivo, {
    headers: {
      "content-type": "application/x-pkcs12",
      "content-disposition": `attachment; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(original)}`,
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}
