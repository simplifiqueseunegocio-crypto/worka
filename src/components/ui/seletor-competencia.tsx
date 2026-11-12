"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";

// Troca a competência pela URL (?competencia=AAAA-MM) da página indicada.
// comRotulo: mostra "Competência" dentro da pílula (cabeçalho do painel).
export function SeletorCompetencia({
  caminho,
  competencia,
  opcoes,
  comRotulo = false,
}: {
  caminho: string;
  competencia: string;
  opcoes: { valor: string; rotulo: string }[];
  comRotulo?: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const select = (
    <select
      value={competencia}
      disabled={pendente}
      aria-label={comRotulo ? undefined : "Competência"}
      onChange={(e) => iniciar(() => router.push(`${caminho}?competencia=${e.target.value}`))}
      className={
        comRotulo
          ? "h-9 cursor-pointer rounded-full bg-suave pr-8 pl-3 font-semibold text-texto outline-none focus:ring-2 focus:ring-primaria/30"
          : "h-11 cursor-pointer rounded-full border border-borda bg-superficie pr-10 pl-4 text-sm font-semibold text-texto outline-none focus:border-primaria focus:ring-4 focus:ring-primaria/15"
      }
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );

  return (
    <label
      className={
        comRotulo
          ? "relative flex h-11 items-center gap-2 rounded-full border border-borda bg-superficie pr-2 pl-4 text-sm"
          : "relative flex items-center"
      }
    >
      {comRotulo && <span className="font-medium text-texto-suave">Competência</span>}
      {select}
      {pendente && <LoaderCircle className="absolute right-9 size-4 animate-spin text-destaque" />}
    </label>
  );
}
