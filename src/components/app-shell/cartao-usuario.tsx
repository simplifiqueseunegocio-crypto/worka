import { LogOut } from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { sair } from "@/lib/auth-actions";

const papeis = { admin: "Administrador", gestor: "Gestor", colaborador: "Colaborador" } as const;

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes.at(-1)![0] : "")).toUpperCase();
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl bg-superficie p-2 ring-1 ring-borda">{children}</div>
  );
}

export async function CartaoUsuario() {
  const usuario = await getUsuario();

  return (
    <Moldura>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primaria-suave text-xs font-bold text-destaque"
        aria-hidden="true"
      >
        {iniciais(usuario.nome)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-texto">{usuario.nome}</span>
        <span className="block truncate text-xs text-texto-suave">
          {usuario.ativo ? papeis[usuario.papel] : "Acesso desativado"}
        </span>
      </span>
      <form action={sair}>
        <button
          type="submit"
          className="grid size-8 place-items-center rounded-lg text-texto-suave transition-colors hover:bg-suave hover:text-texto"
          aria-label="Sair"
          title="Sair"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </Moldura>
  );
}

export function CartaoUsuarioCarregando() {
  return (
    <Moldura>
      <span className="size-8 shrink-0 animate-pulse rounded-full bg-suave" />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="h-3 w-24 animate-pulse rounded bg-suave" />
        <span className="h-2.5 w-16 animate-pulse rounded bg-suave" />
      </span>
    </Moldura>
  );
}
