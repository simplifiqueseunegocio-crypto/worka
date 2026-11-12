"use client";

import { useState } from "react";
import { FileSpreadsheet, Search } from "lucide-react";

// Tabela por empresa do Robô do DET, no modelo da planilha de verificação:
// abas Com consignado / Todas / Pendências, busca e download do Excel.

export type LinhaEmpresaDet = {
  chave: string;
  aba_origem: string | null;
  codigo: string | null;
  empresa: string;
  documento: string; // já formatado
  ultimo_aviso: string | null;
  tem_consignado: boolean;
  no_ciclo: boolean;
  avisos_consignado: number | null;
  nao_lidas: number | null;
};
export type LinhaPendenciaDet = {
  chave: string;
  aba_origem: string | null;
  codigo: string | null;
  empresa: string;
  documento: string;
  motivo: string;
};

type Aba = "consignado" | "todas" | "pendencias";

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function combina(busca: string, e: { empresa: string; documento: string; codigo: string | null }) {
  if (!busca.trim()) return true;
  const termo = normalizar(busca.trim());
  const digitos = termo.replace(/\D/g, "");
  return (
    normalizar(e.empresa).includes(termo) ||
    (digitos.length >= 3 && e.documento.replace(/\D/g, "").includes(digitos)) ||
    (e.codigo ?? "") === termo
  );
}

const th = "px-3 py-3 font-semibold";
const td = "px-3 py-2.5";

export function EmpresasDet({
  empresas,
  comConsignado,
  pendencias,
  rotuloCiclo,
}: {
  empresas: LinhaEmpresaDet[];
  comConsignado: LinhaEmpresaDet[];
  pendencias: LinhaPendenciaDet[];
  rotuloCiclo: string;
}) {
  const [aba, setAba] = useState<Aba>("consignado");
  const [busca, setBusca] = useState("");
  const noCiclo = comConsignado.filter((e) => e.no_ciclo).length;

  const abas: { id: Aba; rotulo: string; total: number }[] = [
    { id: "consignado", rotulo: "Com consignado", total: comConsignado.length },
    { id: "todas", rotulo: "Todas", total: empresas.length },
    { id: "pendencias", rotulo: "Pendências", total: pendencias.length },
  ];
  const lista = (aba === "consignado" ? comConsignado : empresas).filter((e) => combina(busca, e));
  const pend = pendencias.filter((e) => combina(busca, e));

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">Empresas</h2>
          <p className="mt-1 text-sm text-texto-suave">
            {comConsignado.length} com aviso de consignado ·{" "}
            <span className="font-semibold text-alerta">
              {noCiclo} em {rotuloCiclo}
            </span>{" "}
            · {empresas.length - comConsignado.length} sem consignado
          </p>
        </div>
        <a
          href="/automacoes/det/exportar"
          className="flex h-10 items-center gap-2 rounded-full border border-borda bg-superficie px-4 text-sm font-semibold text-texto hover:bg-suave"
        >
          <FileSpreadsheet className="size-4 text-sucesso" /> Baixar Excel
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Abas" className="flex flex-wrap gap-2">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              aria-pressed={aba === a.id}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                aba === a.id ? "bg-primaria text-sobre-primaria" : "bg-superficie text-texto hover:bg-suave"
              }`}
            >
              {a.rotulo} ({a.total})
            </button>
          ))}
        </nav>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Buscar empresa</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-suave" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Empresa, CNPJ ou código"
            className="h-10 w-full rounded-full border border-borda bg-superficie pr-4 pl-9 text-sm outline-none placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15"
          />
        </label>
      </div>

      <div className="mt-3 overflow-x-auto rounded-card bg-superficie ring-1 ring-borda">
        {aba === "pendencias" ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-xs text-texto-suave">
                <th className={th}>Aba origem</th>
                <th className={th}>AP</th>
                <th className={th}>Empresa</th>
                <th className={th}>CNPJ / CPF</th>
                <th className={th}>Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {pend.map((e) => (
                <tr key={e.chave}>
                  <td className={`${td} text-texto-suave`}>{e.aba_origem ?? "—"}</td>
                  <td className={`${td} text-texto-suave tabular-nums`}>{e.codigo ?? "—"}</td>
                  <td className={`${td} font-medium text-texto`}>{e.empresa}</td>
                  <td className={`${td} whitespace-nowrap text-texto-suave tabular-nums`}>{e.documento || "—"}</td>
                  <td className={`${td} text-alerta`}>{e.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-xs text-texto-suave">
                <th className={th}>Aba origem</th>
                <th className={th}>AP</th>
                <th className={th}>Empresa</th>
                <th className={th}>CNPJ / CPF</th>
                <th className={th}>Consignado</th>
                <th className={th}>Último aviso</th>
                <th className={th}>Aviso em {rotuloCiclo}</th>
                <th className={`${th} text-right`}>Avisos na 1ª página</th>
                <th className={`${th} text-right`}>Não lidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {lista.map((e) => (
                <tr key={e.chave} className={e.no_ciclo ? "bg-alerta-suave/60" : ""}>
                  <td className={`${td} text-texto-suave`}>{e.aba_origem ?? "—"}</td>
                  <td className={`${td} text-texto-suave tabular-nums`}>{e.codigo ?? "—"}</td>
                  <td className={`${td} font-medium text-texto`}>{e.empresa}</td>
                  <td className={`${td} whitespace-nowrap text-texto-suave tabular-nums`}>{e.documento}</td>
                  <td className={td}>
                    <span className={e.tem_consignado ? "font-semibold text-texto" : "text-texto-suave"}>{e.tem_consignado ? "SIM" : "NÃO"}</span>
                  </td>
                  <td className={`${td} text-texto-suave tabular-nums`}>{dataBR(e.ultimo_aviso)}</td>
                  <td className={td}>
                    {e.no_ciclo ? <span className="font-semibold text-alerta">SIM</span> : <span className="text-texto-suave">NÃO</span>}
                  </td>
                  <td className={`${td} text-right text-texto tabular-nums`}>{e.avisos_consignado ?? 0}</td>
                  <td className={`${td} text-right tabular-nums ${e.nao_lidas ? "font-semibold text-texto" : "text-texto-suave"}`}>
                    {e.nao_lidas ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(aba === "pendencias" ? pend : lista).length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-texto-suave">
            {busca.trim() ? `Nada encontrado para “${busca}”.` : aba === "pendencias" ? "Nenhuma pendência." : "Nenhuma empresa lida ainda."}
          </p>
        )}
      </div>
      <p className="mt-2 text-xs text-texto-suave">Linhas em laranja: aviso de consignado no ciclo mais recente ({rotuloCiclo}).</p>
    </section>
  );
}
