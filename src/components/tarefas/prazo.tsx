import { departamentos } from "@/components/app-shell/navegacao";

type ComPrazo = { prazo_legal: string; prazo_meta: string; status: string };

const ABERTAS = ["pendente", "em_andamento", "aguardando_cliente"];

// Prazo legal com o relativo ("há 3 dias", "amanhã") e a meta interna, se for diferente.
// Tarefa concluída ou dispensada mostra só a data.
export function Prazo({ tarefa, hoje }: { tarefa: ComPrazo; hoje: string }) {
  const aberta = ABERTAS.includes(tarefa.status);
  const dias = diferencaDias(hoje, tarefa.prazo_legal);
  const relativo =
    dias < 0 ? `há ${-dias} ${-dias === 1 ? "dia" : "dias"}` : dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`;
  const cor = dias < 0 ? "text-perigo" : dias <= 1 ? "text-alerta" : "text-texto-suave";
  const metaPassou = tarefa.prazo_meta < hoje && dias >= 0;

  return (
    <>
      <span className="block font-semibold text-texto tabular-nums">{dataCurta(tarefa.prazo_legal)}</span>
      {aberta && <span className={`block text-xs font-semibold ${cor}`}>{relativo}</span>}
      {aberta && tarefa.prazo_meta !== tarefa.prazo_legal && (
        <span className={`block text-xs tabular-nums ${metaPassou ? "font-semibold text-alerta" : "text-texto-suave/80"}`}>
          Meta {dataCurta(tarefa.prazo_meta)}
          {metaPassou && " · passou"}
        </span>
      )}
    </>
  );
}

// "2026-10-20" → "ter, 20/10"
const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" });
export function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${diaSemana.format(new Date(`${iso}T12:00:00Z`)).replace(".", "")}, ${d}/${m}`;
}

// "2026-09-01" → "09/2026"
export function competenciaCurta(iso: string) {
  const [a, m] = iso.split("-");
  return `${m}/${a}`;
}

export function diferencaDias(de: string, ate: string) {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

export const corDepartamento = (nome?: string) => departamentos.find((d) => d.nome === nome)?.cor ?? "#CBC5BB";
