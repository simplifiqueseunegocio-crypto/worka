import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { clientePrevia, modoPrevia } from "./previa";

export async function createClient(): Promise<ClienteServidor> {
  // O cliente do Supabase lê o relógio (Date.now) para validar o token. Com
  // Cache Components isso não pode acontecer na pré-renderização: io() adia
  // para o momento da requisição (e resolve na hora em requisições e actions).
  await io();
  if (modoPrevia()) return clientePrevia();
  return clienteReal();
}

type ClienteServidor = Awaited<ReturnType<typeof clienteReal>>;

async function clienteReal() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado a partir de um Server Component: o proxy renova a sessão.
          }
        },
      },
    },
  );
}
