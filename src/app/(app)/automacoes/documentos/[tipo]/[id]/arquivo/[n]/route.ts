import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_DOCUMENTOS, podeUsarDocumento, type ArquivoDocumento } from "@/lib/documentos/dados";

// Arquivo original de uma leitura de documentos (para conferir lado a lado),
// só para quem usa a leitura daquele tipo. Entrega direto, sem link assinado.
export async function GET(_request: Request, { params }: { params: Promise<{ tipo: string; id: string; n: string }> }) {
  const { tipo, id, n } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{1,2}$/.test(n)) return new Response("Arquivo inválido.", { status: 400 });
  const usuario = await getUsuario();
  if (!(await podeUsarDocumento(usuario, tipo))) return new Response("Sem acesso.", { status: 403 });

  const supabase = await createClient();
  const { data } = await supabase.from("documentos_leituras").select("tipo, arquivos").eq("id", id).maybeSingle();
  if (!data || data.tipo !== tipo) return new Response("Arquivo não encontrado.", { status: 404 });
  const arquivo = (data.arquivos as ArquivoDocumento[])[Number(n)];
  if (!arquivo) return new Response("Arquivo não encontrado.", { status: 404 });

  const { data: blob, error } = await createAdminClient().storage.from(BUCKET_DOCUMENTOS).download(arquivo.path);
  if (error || !blob) return new Response("Não foi possível abrir o arquivo.", { status: 502 });
  const nome = arquivo.nome.normalize("NFD").replace(/[^\w.\- ]/g, "_");
  return new Response(blob, {
    headers: {
      "content-type": arquivo.tipo,
      "content-disposition": `inline; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(arquivo.nome)}`,
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}
