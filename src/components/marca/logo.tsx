// Marca Worka. Para trocar o logotipo no futuro, basta mudar este arquivo
// (e src/app/icon.svg, o favicon): o resto da aplicação só usa <Logo /> e
// <LogoSimbolo />.

type LogoProps = {
  /** "cor" acompanha o tema (texto carvão no claro, creme no escuro);
      "branco" é para fundos sempre escuros (ex.: painel da tela de login). */
  variante?: "cor" | "branco";
  /** Só o símbolo, sem o nome. */
  compacto?: boolean;
  /** Mostra o slogan abaixo do nome. */
  slogan?: boolean;
  className?: string;
};

export const MARCA = {
  nome: "Worka",
  wordmark: "worka",
  slogan: "Menos rotina. Mais resultado.",
} as const;

// Símbolo: um "W" de traço contínuo sobre um bloco laranja. A última perna
// sobe além das outras, sugerindo avanço ("mais resultado").
export function LogoSimbolo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="var(--color-primaria, #EF5928)" />
      <path
        d="M7.5 11.5 11.75 21.5 16 14 20.25 21.5 25 8.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ variante = "cor", compacto = false, slogan = false, className }: LogoProps) {
  const cor = variante === "branco" ? "text-white" : "text-texto";
  const corSlogan = variante === "branco" ? "text-texto-inverso-suave" : "text-texto-suave";

  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoSimbolo className="size-8 shrink-0" />
      {!compacto && (
        <span className={`flex flex-col ${cor}`} aria-hidden="true">
          <span className="font-display text-[22px] leading-none tracking-[-0.03em]">{MARCA.wordmark}</span>
          {slogan && <span className={`mt-1 text-[11px] leading-none ${corSlogan}`}>{MARCA.slogan}</span>}
        </span>
      )}
      <span className="sr-only">{MARCA.nome}</span>
    </span>
  );
}
