import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Fila do Robô do DET, usada por dois caminhos:
//   /api/integracoes/det/*  robô com token (DET_ROBO_TOKEN)
//   /api/det/extensao/*     extensão do Chrome, com a sessão de quem está logado
//                           na plataforma (gestor ou admin)

export const json = (status: number, corpo: unknown) => Response.json(corpo, { status });

// Quantas consultas podem ser reservadas agora.
export async function contarPendentes() {
  const agora = new Date();
  const quinzeMin = new Date(agora.getTime() - 15 * 60_000).toISOString();
  const { count, error } = await createAdminClient()
    .from("det_consultas")
    .select("id", { count: "exact", head: true })
    .or(`and(status.eq.na_fila,disponivel_em.lte.${agora.toISOString()}),and(status.eq.processando,iniciada_em.lt.${quinzeMin})`);
  if (error) throw new Error(`Falha ao contar consultas do DET: ${error.message}`);
  return count ?? 0;
}

export async function reservar(limite: number) {
  const { data, error } = await createAdminClient().rpc("reservar_det", { p_limite: Math.min(50, Math.max(1, limite)) });
  if (error) throw new Error(`Falha ao reservar consultas do DET: ${error.message}`);
  return data ?? [];
}

const STATUS = ["concluida", "sem_procuracao", "erro"];
const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// Valida o corpo { resultados: [...] }. Devolve os resultados limpos ou os erros.
export function validarResultados(lista: unknown): { resultados: unknown[] } | { erros: string[] } {
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > 200) {
    return { erros: ["Envie { resultados: [...] } com 1 a 200 itens."] };
  }
  const erros: string[] = [];
  const resultados = lista.map((bruto, i) => {
    const r = (bruto ?? {}) as Record<string, unknown>;
    const n = `resultado ${i + 1}`;
    const devolver = r.devolver === true;
    if (!Number.isInteger(r.id)) erros.push(`${n}: id inválido.`);
    if (!devolver && !STATUS.includes(String(r.status))) erros.push(`${n}: status deve ser ${STATUS.join(", ")}.`);

    const avisosBrutos = r.avisos ?? [];
    if (!Array.isArray(avisosBrutos) || avisosBrutos.length > 500) {
      erros.push(`${n}: avisos deve ser uma lista com até 500 itens.`);
    }
    const avisos = (Array.isArray(avisosBrutos) ? avisosBrutos : []).map((ab, j) => {
      const a = (ab ?? {}) as Record<string, unknown>;
      if (!DATA.test(String(a.data))) erros.push(`${n}, aviso ${j + 1}: data deve ser AAAA-MM-DD.`);
      if (!texto(a.assunto, 500)) erros.push(`${n}, aviso ${j + 1}: assunto vazio.`);
      if (a.competencia_desconto != null && !MES.test(String(a.competencia_desconto))) {
        erros.push(`${n}, aviso ${j + 1}: competencia_desconto deve ser AAAA-MM.`);
      }
      return {
        data: a.data,
        assunto: texto(a.assunto, 500),
        periodo_averbacao: texto(a.periodo_averbacao, 200),
        competencia_desconto: a.competencia_desconto ?? null,
        lida: typeof a.lida === "boolean" ? a.lida : null,
      };
    });

    return {
      id: r.id,
      status: devolver ? null : r.status,
      mensagem: texto(r.mensagem, 2000),
      repetir: r.repetir === true,
      devolver,
      avisos,
    };
  });
  return erros.length ? { erros } : { resultados };
}

export async function gravarResultados(resultados: unknown[]) {
  const { data, error } = await createAdminClient().rpc("registrar_det_resultados", { p_resultados: resultados });
  if (error) throw new Error(`Falha ao gravar resultados do DET: ${error.message}`);
  return data;
}

// Extensão: quem está logado na plataforma pode operar o robô? (gestor ou admin)
// O cabeçalho X-Robo-Det barra formulários de outros sites (não há CORS).
export async function operadorDaExtensao(request: Request): Promise<string | Response> {
  if (request.headers.get("x-robo-det") !== "1") return json(400, { erro: "Requisição inválida." });
  if (!process.env.SUPABASE_SECRET_KEY) return json(503, { erro: "Integração não configurada no servidor." });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return json(401, { erro: "Entre no Worka neste navegador." });
  const { data: perfil } = await supabase.from("profiles").select("nome, papel, ativo").eq("id", id).maybeSingle();
  if (!perfil?.ativo || (perfil.papel !== "admin" && perfil.papel !== "gestor")) {
    return json(403, { erro: "Só gestores e administradores operam o robô do DET." });
  }
  return String(perfil.nome ?? "");
}
