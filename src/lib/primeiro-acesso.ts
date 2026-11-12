"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { primeiroAcessoLiberado } from "@/lib/usuarios";

export type EstadoPrimeiroAcesso = { erro?: string; nome?: string; email?: string };

export async function criarAdministrador(
  _estado: EstadoPrimeiroAcesso,
  form: FormData,
): Promise<EstadoPrimeiroAcesso> {
  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const confirmacao = String(form.get("confirmacao") ?? "");
  const volta = { nome, email };

  // Rechecado aqui: a tela some fora do ambiente local ou depois do primeiro
  // usuário, mas a ação também não pode ser chamada direto por fora.
  if (!(await primeiroAcessoLiberado())) {
    return { ...volta, erro: "Primeiro acesso indisponível. Entre pela tela de login." };
  }
  if (nome.length < 2) return { ...volta, erro: "Informe o seu nome." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ...volta, erro: "E-mail inválido." };
  if (senha.length < 8) return { ...volta, erro: "A senha precisa ter pelo menos 8 caracteres." };
  if (senha !== confirmacao) return { ...volta, erro: "As senhas não conferem." };

  const { error } = await createAdminClient().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) {
    return {
      ...volta,
      erro: error.code === "email_exists" ? "Esse e-mail já está cadastrado." : `Não foi possível criar: ${error.message}`,
    };
  }

  // O trigger on_auth_user_created cria o profile; o primeiro vira admin.
  const supabase = await createClient();
  const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senha });
  redirect(erroLogin ? "/login" : "/");
}
