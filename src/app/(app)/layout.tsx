import { Suspense } from "react";
import { Sidebar } from "@/components/app-shell/sidebar";
import { CartaoUsuario, CartaoUsuarioCarregando } from "@/components/app-shell/cartao-usuario";
import { ContadorDepartamento } from "@/components/app-shell/contador-departamento";
import { departamentos } from "@/components/app-shell/navegacao";
import { Esqueleto, Revelar } from "@/components/ui/transicao";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="lg:flex">
      <Sidebar
        abertas={Object.fromEntries(
          departamentos.map((d) => [
            d.slug,
            <Suspense key={d.slug} fallback={null}>
              <ContadorDepartamento nome={d.nome} />
            </Suspense>,
          ]),
        )}
        usuario={
          <Suspense
            fallback={
              <Esqueleto>
                <CartaoUsuarioCarregando />
              </Esqueleto>
            }
          >
            <Revelar>
              <CartaoUsuario />
            </Revelar>
          </Suspense>
        }
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
