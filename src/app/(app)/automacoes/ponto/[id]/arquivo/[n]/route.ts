import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeUsarPonto } from "@/lib/ponto";
import { BUCKET_PONTO, type ArquivoPonto } from "@/lib/ponto-leitura";

// Abre o arquivo original da ficha (para conferir lado a lado), só para quem
// usa a leitura de ponto. Entrega direto, sem link assinado.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{1,2}$/.test(n)) return new Response("Arquivo inválido.", { status: 400 });
  const usuario = await getUsuario();
  if (!(await podeUsarPonto(usuario))) return new Response("Sem acesso.", { status: 403 });

  const supabase = await createClient();
  const { data } = await supabase.from("ponto_leituras").select("arquivos").eq("id", id).maybeSingle();
  const arquivo = (data?.arquivos as ArquivoPonto[] | undefined)?.[Number(n)];
  if (!arquivo) return new Response("Arquivo não encontrado.", { status: 404 });

  const { data: blob, error } = await createAdminClient().storage.from(BUCKET_PONTO).download(arquivo.path);
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
