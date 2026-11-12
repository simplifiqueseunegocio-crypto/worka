"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { erro?: string; email?: string };

// Só aceita caminhos internos, para o ?proximo= não virar redirecionamento aberto.
function destinoSeguro(valor: FormDataEntryValue | null) {
  const s = typeof valor === "string" ? valor : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/login") ? s : "/";
}

export async function entrar(_estado: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");

  if (!email || !senha) return { erro: "Informe e-mail e senha.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    const msg =
      error.code === "invalid_credentials"
        ? "E-mail ou senha incorretos."
        : error.code === "email_not_confirmed"
          ? "Defina a sua senha pelo link enviado por e-mail antes de entrar."
          : error.code === "user_banned"
            ? "Seu acesso foi desativado. Fale com o administrador."
            : "Não foi possível entrar agora. Tente de novo.";
    return { erro: msg, email };
  }

  redirect(destinoSeguro(form.get("proximo")));
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
