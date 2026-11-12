import "server-only";
import { headers } from "next/headers";
import { enviarEmail, escaparHtml, modeloEmail, type ResultadoEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Papel } from "@/lib/auth";

export type Membro = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  criado_em: string;
  departamentos: number[];
  ultimoAcesso: string | null;
};

// Equipe com os departamentos de cada pessoa. O último acesso vem do Auth
// (chave secreta), por isso só é lido quando quem pede é admin.
export async function listarEquipe(comAcesso: boolean): Promise<Membro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, email, papel, ativo, criado_em, profile_departamentos(departamento_id)")
    .order("ativo", { ascending: false })
    .order("nome");
  if (error) throw new Error(`Falha ao listar a equipe: ${error.message}`);

  const acessos = new Map<string, string | null>();
  if (comAcesso && process.env.SUPABASE_SECRET_KEY) {
    const { data: auth } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    for (const u of auth?.users ?? []) acessos.set(u.id, u.last_sign_in_at ?? null);
  }

  return (data ?? []).map(({ profile_departamentos, ...p }) => ({
    ...p,
    papel: p.papel as Papel,
    departamentos: (profile_departamentos ?? []).map((d: { departamento_id: number }) => d.departamento_id),
    ultimoAcesso: acessos.get(p.id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// E-mail para definir a senha. Não existe cadastro aberto nem senha
// provisória: o admin cria a conta e a pessoa recebe um link para
// /definir-senha. O link leva o token_hash do Supabase, que só é consumido
// quando a pessoa envia a senha (assim o antivírus do e-mail, que abre os
// links, não gasta o token).

export type TipoLinkSenha = "invite" | "recovery";

// Endereço público da plataforma, para os links dos e-mails. APP_URL vale
// mais; sem ela, usa o endereço pelo qual o admin está acessando.
export async function enderecoPlataforma() {
  const fixo = process.env.APP_URL?.replace(/\/+$/, "");
  if (fixo) return fixo;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

export function linkDefinirSenha(base: string, tokenHash: string, tipo: TipoLinkSenha) {
  const params = new URLSearchParams({ token_hash: tokenHash, tipo });
  return `${base}/definir-senha?${params}`;
}

export async function enviarEmailDefinirSenha({
  nome,
  email,
  link,
  novo,
}: {
  nome: string;
  email: string;
  link: string;
  novo: boolean;
}): Promise<ResultadoEmail> {
  const titulo = novo ? "Seu acesso ao Worka" : "Defina sua senha do Worka";
  const abertura = novo
    ? "Uma conta foi criada para você no Worka. Para começar a usar, defina a sua senha:"
    : "Um administrador pediu que você defina uma nova senha para a sua conta no Worka:";
  return enviarEmail({
    para: email,
    assunto: titulo,
    html: modeloEmail({
      titulo,
      corpo: `<p>Olá, ${escaparHtml(nome)}.</p>
<p>${abertura}</p>
<p style="margin:24px 0"><a href="${escaparHtml(link)}" style="display:inline-block;background:#0D1B2A;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px">Definir minha senha</a></p>
<p style="font-size:13px;color:#4A5868">O link vale por 24 horas e só pode ser usado uma vez. Se ele expirar, peça ao administrador um novo e-mail.</p>
<p style="font-size:13px;color:#4A5868">Seu login é <strong>${escaparHtml(email)}</strong>.</p>`,
    }),
    texto: `Olá, ${nome}. ${abertura} ${link} — Seu login é ${email}. O link vale por 24 horas; se expirar, peça ao administrador um novo e-mail.`,
  });
}
