import { AlertTriangle, Download, KeyRound, ShieldCheck } from "lucide-react";
import type { Certificado } from "@/lib/certificados";
import { FUSO } from "@/lib/log-sincronizacao";

// Cartão do certificado A1 atual com o botão de download. Usado em
// Configurações > Certificado digital e na tela do Robô do DET.

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
export const diasAte = (iso: string, hoje: string) => Math.round((Date.parse(iso) - Date.parse(hoje)) / 86_400_000);

export function CertificadoAtual({ cert, hoje, rodape }: { cert: Certificado; hoje: string; rodape?: React.ReactNode }) {
  const dias = diasAte(cert.valido_ate, hoje);
  const vencido = dias < 0;
  const vencendo = !vencido && dias <= 30;
  return (
    <section
      className={`rounded-card bg-superficie p-5 ring-1 sm:p-6 ${vencido ? "ring-perigo/50" : vencendo ? "ring-alerta-ponto/60" : "ring-borda"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-suave text-destaque">
            <ShieldCheck className="size-5" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-xs text-texto-suave">Certificado digital da empresa</p>
            <h2 className="text-lg font-bold text-texto">{cert.nome}</h2>
            <p className={`text-sm ${vencido ? "text-perigo" : vencendo ? "text-alerta" : "text-texto-suave"}`}>
              {vencido
                ? `Venceu em ${dataBR(cert.valido_ate)}`
                : `Válido até ${dataBR(cert.valido_ate)} · ${dias === 0 ? "vence hoje" : `${dias} dias`}`}
            </p>
          </div>
        </div>
        <a
          href={`/configuracoes/certificado/${cert.id}/arquivo`}
          className="flex h-11 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover"
        >
          <Download className="size-4" /> Baixar .pfx
        </a>
      </div>

      {(vencido || vencendo) && (
        <p className="mt-4 flex items-center gap-2 rounded-bloco bg-alerta-suave px-3 py-2 text-sm text-alerta">
          <AlertTriangle className="size-4 shrink-0" />
          {vencido ? "Certificado vencido: o DET e o e-CAC recusam o acesso." : "Vence em breve: providencie a renovação."}
        </p>
      )}

      <div className="mt-4 grid gap-2 border-t border-borda pt-4 text-sm sm:grid-cols-2">
        <p className="flex items-center gap-2 text-texto-suave">
          <KeyRound className="size-4 shrink-0 text-destaque" /> A senha não fica na plataforma: peça a quem é responsável.
        </p>
        <p className="text-texto-suave sm:text-right">
          Enviado {cert.enviado_por ? `por ${cert.enviado_por.nome} ` : ""}em{" "}
          {dataHora.format(new Date(cert.enviado_em))}
        </p>
        {cert.observacao && <p className="text-texto-suave sm:col-span-2">{cert.observacao}</p>}
        {rodape && <div className="sm:col-span-2">{rodape}</div>}
      </div>
    </section>
  );
}
