import { getUsuario } from "@/lib/auth";
import { DetIndisponivel, planilhaDet, rotuloMes } from "@/lib/det";
import { montarPlanilhaDet } from "@/lib/det-planilha";
import { hojeISO } from "@/lib/tarefas";

// Baixa a planilha do Robô do DET (Resumo, Com Consignado, Todas, Pendências).
export async function GET() {
  const usuario = await getUsuario();
  if (!usuario.ativo) return new Response("Seu acesso ainda não foi ativado.", { status: 403 });

  let p;
  try {
    p = await planilhaDet();
  } catch (e) {
    if (e instanceof DetIndisponivel) return new Response("Aplique a migration 20261111000100_det_painel.sql.", { status: 503 });
    throw e;
  }

  const buffer = await montarPlanilhaDet(p, p.ciclo ? rotuloMes(p.ciclo) : "—");
  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="DET_consignado_${hojeISO()}.xlsx"`,
      "cache-control": "no-store, private",
    },
  });
}
