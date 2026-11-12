import { CircleCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { dataBR, mesBR, real, ROTULO_GUIA } from "@/lib/documentos/tipos";
import { hojeSP } from "@/lib/ia-extracao";

type Guia = {
  id: string;
  tipo: string;
  periodo: string | null;
  codigo_receita: string | null;
  vencimento: string;
  valor_total: number;
  cliente: { razao_social: string } | null;
};

const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

// Guias confirmadas que ainda não têm comprovante (a baixa vem do Leitor de
// comprovantes). Servidor: lê com a RLS de quem está vendo.
async function lerGuias() {
  const supabase = await createClient();
  return Promise.all([
    supabase
      .from("guias")
      .select("id, tipo, periodo, codigo_receita, vencimento, valor_total, cliente:clientes(razao_social)")
      .is("pago_em", null)
      .order("vencimento")
      .limit(60)
      .overrideTypes<Guia[], { merge: false }>(),
    supabase
      .from("guias")
      .select("id", { count: "exact", head: true })
      .gte("pago_em", new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)),
  ]);
}

export async function GuiasEmAberto() {
  const [{ data, error }, pagas] = await lerGuias();
  if (error) return null; // migration ainda não aplicada: a página segue sem o painel
  const hoje = hojeSP();
  const vencidas = (data ?? []).filter((g) => g.vencimento < hoje).length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">Guias em aberto</h2>
        <p className="text-xs text-texto-suave">
          {vencidas ? <strong className="text-perigo">{vencidas} vencida{vencidas === 1 ? "" : "s"} · </strong> : null}
          {pagas.count ?? 0} baixada{pagas.count === 1 ? "" : "s"} por comprovante em 30 dias
        </p>
      </div>
      {!data?.length ? (
        <p className="mt-3 flex items-center gap-2 rounded-card bg-superficie ring-1 ring-borda px-5 py-6 text-sm text-texto-suave">
          <CircleCheck className="size-4 text-sucesso" /> Nenhuma guia em aberto.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-borda overflow-hidden rounded-card bg-superficie ring-1 ring-borda">
          {data.map((g) => {
            const faltam = dias(hoje, g.vencimento);
            const situacao =
              faltam < 0
                ? { texto: `vencida há ${-faltam} dia${faltam === -1 ? "" : "s"}`, classe: "bg-perigo-suave text-perigo" }
                : faltam === 0
                  ? { texto: "vence hoje", classe: "bg-alerta-suave text-alerta" }
                  : faltam <= 5
                    ? { texto: `vence em ${faltam} dia${faltam === 1 ? "" : "s"}`, classe: "bg-alerta-suave text-alerta" }
                    : { texto: `vence ${dataBR(g.vencimento)}`, classe: "bg-suave text-texto-suave" };
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-texto">{g.cliente?.razao_social ?? "Cliente"}</p>
                  <p className="truncate text-xs text-texto-suave">
                    {ROTULO_GUIA[g.tipo] ?? "Guia"}
                    {g.periodo ? ` ${mesBR(g.periodo.slice(0, 7))}` : ""}
                    {g.codigo_receita ? ` · código ${g.codigo_receita}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${situacao.classe}`}>{situacao.texto}</span>
                <span className="w-28 text-right text-sm font-semibold text-texto tabular-nums">{real(g.valor_total)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
