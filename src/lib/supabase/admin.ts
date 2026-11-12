import "server-only";
import { createClient } from "@supabase/supabase-js";
import { clientePrevia, modoPrevia } from "./previa";

// Cliente com a chave secreta: ignora RLS. Usar só em rotas de servidor
// que já validaram quem está chamando (ex.: integrações).
export function createAdminClient(): ReturnType<typeof clienteReal> {
  if (modoPrevia()) return clientePrevia();
  return clienteReal();
}

function clienteReal() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
