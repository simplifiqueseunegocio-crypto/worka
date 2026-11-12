import { createBrowserClient } from "@supabase/ssr";
import { clientePrevia, modoPrevia } from "./previa";

export function createClient(): ReturnType<typeof clienteReal> {
  if (modoPrevia()) return clientePrevia();
  return clienteReal();
}

function clienteReal() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
