import { Logo } from "@/components/marca/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-escuro p-12 text-white lg:flex">
        {/* Detalhe: o traço do símbolo, ampliado e quase transparente. */}
        <svg
          viewBox="0 0 32 32"
          className="pointer-events-none absolute -right-24 -bottom-28 w-[620px] text-primaria opacity-[0.12]"
          aria-hidden="true"
        >
          <path
            d="M7.5 11.5 11.75 21.5 16 14 20.25 21.5 25 8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <Logo variante="branco" />
        <div className="relative max-w-md">
          <p className="text-xs font-semibold tracking-[0.2em] text-texto-inverso-suave uppercase">
            Automação para escritórios contábeis
          </p>
          <p className="mt-5 font-display text-5xl leading-[1.05]">
            Menos rotina. <span className="text-realce">Mais resultado.</span>
          </p>
          <p className="mt-5 text-base leading-relaxed text-texto-inverso-suave">
            Clientes, obrigações, prazos e automações em um só lugar.
          </p>
        </div>
        <p className="relative text-sm text-texto-inverso-suave">Acesso restrito à equipe do escritório.</p>
      </section>

      <section className="flex items-center justify-center bg-fundo px-4 py-12 sm:px-8">
        <div className="entrada w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo slogan />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
