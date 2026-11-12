"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getUsuario, type Papel } from "@/lib/auth";
import {
  enderecoPlataforma,
  enviarEmailDefinirSenha,
  linkDefinirSenha,
  type TipoLinkSenha,
} from "@/lib/equipe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoEquipe = { ok?: string; erro?: string };

export type EstadoConvite = EstadoEquipe & {
  nome?: string;
  email?: string;
  enviado?: boolean;
  // Só quando o e-mail não saiu: o link para o admin repassar à pessoa.
  link?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAPEIS: Papel[] = ["admin", "gestor", "colaborador"];
const BANIDO = "876000h"; // ~100 anos: o Auth não aceita "para sempre"

// Toda ação da equipe é só do admin. A RLS também barra, mas as que usam a
// chave secreta (criar usuário, link de senha, bloqueio) dependem desta checagem.
async function exigirAdmin() {
  const usuario = await getUsuario();
  return usuario.ativo && usuario.papel === "admin" ? usuario : null;
}

// Manda o link de definir senha. Se o e-mail não sair, devolve o link para
// o admin repassar (ele não aparece de novo: um novo pedido gera outro).
async function enviarLink(nome: string, email: string, tokenHash: string, tipo: TipoLinkSenha) {
  const link = linkDefinirSenha(await enderecoPlataforma(), tokenHash, tipo);
  const r = await enviarEmailDefinirSenha({ nome, email, link, novo: tipo === "invite" });
  return r.erro ? { enviado: false, link } : { enviado: true };
}

// Cria a conta sem senha e manda o e-mail para a pessoa definir a dela.
// O generateLink do tipo invite cria o usuário no Auth (o trigger cria o
// profile desativado) e devolve o token sem o Supabase mandar e-mail.
export async function convidarPessoa(_estado: EstadoConvite, form: FormData): Promise<EstadoConvite> {
  const nome = String(form.get("nome") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const papel = String(form.get("papel") ?? "colaborador") as Papel;
  const departamentos = [
    ...new Set(form.getAll("departamento").map(Number).filter((n) => Number.isInteger(n) && n > 0)),
  ];
  const volta = { nome, email };

  if (!(await exigirAdmin())) return { ...volta, erro: "Apenas administradores cadastram pessoas." };
  if (nome.length < 2) return { ...volta, erro: "Informe o nome." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ...volta, erro: "E-mail inválido." };
  if (!PAPEIS.includes(papel)) return { ...volta, erro: "Papel inválido." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { nome } },
  });
  if (error || !data.user) {
    const existe = error?.code === "email_exists" || /already been registered/i.test(error?.message ?? "");
    return { ...volta, erro: existe ? "Esse e-mail já está cadastrado." : "Não foi possível cadastrar agora." };
  }

  const id = data.user.id;
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    admin.from("profiles").update({ nome, papel, ativo: true }).eq("id", id),
    departamentos.length
      ? admin.from("profile_departamentos").insert(departamentos.map((d) => ({ profile_id: id, departamento_id: d })))
      : { error: null },
  ]);
  if (e1 || e2) {
    // Desfaz a conta (o profile cai junto pelo on delete cascade).
    await admin.auth.admin.deleteUser(id);
    return { ...volta, erro: "Não foi possível cadastrar agora." };
  }

  const envio = await enviarLink(nome, email, data.properties.hashed_token, "invite");
  refresh();
  return { ok: "Pessoa cadastrada.", ...volta, ...envio };
}

export async function alterarPapel(id: string, papel: Papel): Promise<EstadoEquipe> {
  const admin = await exigirAdmin();
  if (!admin) return { erro: "Apenas administradores alteram papéis." };
  if (!UUID.test(id) || !PAPEIS.includes(papel)) return { erro: "Dados inválidos." };
  // Quem está logado não muda o próprio papel: assim sempre sobra um admin.
  if (id === admin.id) return { erro: "Você não pode alterar o seu próprio papel." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ papel }).eq("id", id).select("id");
  if (error || !data?.length) return { erro: "Não foi possível alterar o papel." };
  refresh();
  return { ok: "Papel alterado." };
}

export async function alterarDepartamento(id: string, departamentoId: number, ligado: boolean): Promise<EstadoEquipe> {
  if (!(await exigirAdmin())) return { erro: "Apenas administradores alteram departamentos." };
  if (!UUID.test(id) || !Number.isInteger(departamentoId)) return { erro: "Dados inválidos." };

  const supabase = await createClient();
  const { error } = ligado
    ? await supabase
        .from("profile_departamentos")
        .upsert({ profile_id: id, departamento_id: departamentoId }, { ignoreDuplicates: true })
    : await supabase.from("profile_departamentos").delete().eq("profile_id", id).eq("departamento_id", departamentoId);
  if (error) return { erro: "Não foi possível alterar o departamento." };
  refresh();
  return { ok: ligado ? "Departamento incluído." : "Departamento removido." };
}

// Desativar tira o acesso: a RLS ignora quem não está ativo e o Auth bloqueia o login.
export async function alterarAtivo(id: string, ativo: boolean): Promise<EstadoEquipe> {
  const admin = await exigirAdmin();
  if (!admin) return { erro: "Apenas administradores ativam ou desativam pessoas." };
  if (!UUID.test(id)) return { erro: "Pessoa inválida." };
  if (id === admin.id) return { erro: "Você não pode desativar o seu próprio acesso." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ ativo }).eq("id", id).select("id");
  if (error || !data?.length) return { erro: "Não foi possível alterar o acesso." };

  const { error: erroAuth } = await createAdminClient().auth.admin.updateUserById(id, {
    ban_duration: ativo ? "none" : BANIDO,
  });
  refresh();
  if (erroAuth) return { ok: ativo ? "Reativado, mas o login pode continuar bloqueado." : "Desativado na plataforma." };
  return { ok: ativo ? "Acesso reativado." : "Acesso desativado." };
}

// Novo e-mail para definir a senha: serve para convite expirado e para quem
// esqueceu a senha. O link do tipo recovery funciona para qualquer conta e
// não mexe na senha atual até a pessoa definir a nova.
export async function redefinirSenha(id: string): Promise<EstadoConvite> {
  if (!(await exigirAdmin())) return { erro: "Apenas administradores redefinem senhas." };
  if (!UUID.test(id)) return { erro: "Pessoa inválida." };

  const supabase = await createClient();
  const { data: perfil } = await supabase.from("profiles").select("nome, email, ativo").eq("id", id).maybeSingle();
  if (!perfil) return { erro: "Pessoa não encontrada." };
  if (!perfil.ativo) return { erro: "Reative o acesso antes de enviar o link." };

  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email: perfil.email });
  if (error) return { erro: "Não foi possível gerar o link." };

  const envio = await enviarLink(perfil.nome, perfil.email, data.properties.hashed_token, "recovery");
  return { ok: "Link gerado.", nome: perfil.nome, email: perfil.email, ...envio };
}

// ---------------------------------------------------------------------------
// Tela pública /definir-senha

// usuarioId: o token já foi trocado por uma sessão, mas a senha não foi
// aceita. Na próxima tentativa usa a sessão, porque o token não vale mais.
export type EstadoDefinirSenha = { erro?: string; usuarioId?: string };

export async function definirSenha(_estado: EstadoDefinirSenha, form: FormData): Promise<EstadoDefinirSenha> {
  const tokenHash = String(form.get("token_hash") ?? "");
  const tipo = String(form.get("tipo") ?? "") as TipoLinkSenha;
  const senha = String(form.get("senha") ?? "");
  const confirmacao = String(form.get("confirmacao") ?? "");
  const usuarioAnterior = String(form.get("usuario_id") ?? "");

  if (!tokenHash || (tipo !== "invite" && tipo !== "recovery")) {
    return { erro: "Link inválido. Peça ao administrador um novo e-mail." };
  }
  const volta = { usuarioId: usuarioAnterior || undefined };
  if (senha.length < 8) return { ...volta, erro: "A senha precisa ter pelo menos 8 caracteres." };
  if (senha !== confirmacao) return { ...volta, erro: "As senhas não conferem." };

  const supabase = await createClient();
  const { data: sessao } = await supabase.auth.getClaims();
  let usuarioId = usuarioAnterior && sessao?.claims?.sub === usuarioAnterior ? usuarioAnterior : "";

  // Troca o token por uma sessão (gravada nos cookies) e define a senha.
  if (!usuarioId) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    if (error || !data.user) {
      return { erro: "Este link expirou ou já foi usado. Peça ao administrador um novo e-mail." };
    }
    usuarioId = data.user.id;
  }

  const { error: erroSenha } = await supabase.auth.updateUser({ password: senha });
  if (erroSenha) {
    const msg =
      erroSenha.code === "weak_password"
        ? "Senha fraca. Use uma senha mais longa, com letras e números."
        : erroSenha.code === "same_password"
          ? "A nova senha precisa ser diferente da anterior."
          : `Não foi possível definir a senha: ${erroSenha.message}`;
    return { erro: msg, usuarioId };
  }

  redirect("/");
}
