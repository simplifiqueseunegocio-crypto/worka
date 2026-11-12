import "server-only";
import { io } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// O primeiro acesso (criar o administrador sem estar logado) só existe no
// ambiente local, rodando `npm run dev`. Em produção fica sempre desligado,
// para ninguém de fora conseguir criar a primeira conta pelo site publicado.
export async function primeiroAcessoLiberado() {
  if (process.env.NODE_ENV !== "development") return false;
  await io(); // o cliente do Supabase lê o relógio; fora da pré-renderização
  if (!process.env.SUPABASE_SECRET_KEY) return false;

  const { count, error } = await createAdminClient()
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Falha ao verificar usuários: ${error.message}`);
  return (count ?? 0) === 0;
}
