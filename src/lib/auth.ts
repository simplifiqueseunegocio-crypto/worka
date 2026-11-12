import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Papel = "admin" | "gestor" | "colaborador";

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
};

// Id e e-mail de quem está logado, direto do token (verificado localmente com
// a chave pública do projeto, sem ida ao banco). Sem sessão, vai para /login.
// Serve para começar consultas que só dependem do id enquanto o perfil carrega.
export const sessaoUsuario = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/login");
  return { id, email: String(data.claims.email ?? "") };
});

// Usuário logado com o seu profile. Sem sessão, vai para /login.
// Lê cookies: só pode ser chamado dentro de um <Suspense>.
// cache(): layout e página leem o usuário uma vez só por requisição.
export const getUsuario = cache(async (): Promise<Usuario> => {
  const { id, email } = await sessaoUsuario();
  const supabase = await createClient();
  const { data: perfil } = await supabase
    .from("profiles")
    .select("nome, email, papel, ativo")
    .eq("id", id)
    .maybeSingle();

  return {
    id,
    nome: perfil?.nome ?? (email || "Usuário"),
    email: perfil?.email ?? email,
    papel: (perfil?.papel as Papel) ?? "colaborador",
    ativo: perfil?.ativo ?? false,
  };
});
