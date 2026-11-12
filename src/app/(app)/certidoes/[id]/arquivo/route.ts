import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Abre o PDF de uma certidão lançada: link assinado do Storage, válido por 1 minuto.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response("Certidão inválida.", { status: 400 });
  }
  await getUsuario(); // sem sessão, vai para /login

  const supabase = await createClient();
  const { data: certidao } = await supabase
    .from("certidoes")
    .select("arquivo_path, arquivo_nome")
    .eq("id", id)
    .maybeSingle();
  if (!certidao?.arquivo_path) return new Response("Certidão sem PDF.", { status: 404 });

  const { data, error } = await supabase.storage
    .from("certidoes")
    .createSignedUrl(certidao.arquivo_path, 60, { download: false });
  if (error || !data) return new Response("Não foi possível abrir o PDF.", { status: 502 });
  return Response.redirect(data.signedUrl, 302);
}
