import { getUsuario } from "@/lib/auth";
import {
  atrasos,
  departamentosDoRelatorio,
  gerarRelatorio,
  lerFiltrosRelatorio,
  pontualidade,
  pct,
  type Indicadores,
} from "@/lib/relatorios";

// Exporta um relatório em CSV para o Excel em português: separador ";",
// BOM UTF-8 (acentos) e números sem separador de milhar.
const TIPOS = ["colaboradores", "clientes", "meses"] as const;
type Tipo = (typeof TIPOS)[number];

const celula = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const colunasIndicadores = [
  "Tarefas",
  "Concluídas",
  "No prazo",
  "Na meta interna",
  "Entregues com atraso",
  "Abertas",
  "Abertas atrasadas",
  "Dispensadas",
  "Pontualidade (%)",
  "Atrasos",
];
const valoresIndicadores = (i: Indicadores) => [
  i.total,
  i.concluidas,
  i.noPrazo,
  i.naMeta,
  i.entreguesComAtraso,
  i.abertas,
  i.abertasAtrasadas,
  i.dispensadas,
  pontualidade(i),
  atrasos(i),
];

export async function GET(request: Request) {
  const usuario = await getUsuario();
  const departamentos = await departamentosDoRelatorio(usuario);
  if (!departamentos.length) return new Response("Apenas admin ou gestor exporta relatórios.", { status: 403 });

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo") as Tipo;
  if (!TIPOS.includes(tipo)) return new Response("Tipo de relatório inválido.", { status: 400 });

  const f = lerFiltrosRelatorio(Object.fromEntries(url.searchParams));
  const r = await gerarRelatorio(f, departamentos);

  let linhas: (string | number | null)[][];
  if (tipo === "colaboradores") {
    linhas = [
      ["Responsável", ...colunasIndicadores],
      ...r.colaboradores.map((c) => [c.nome, ...valoresIndicadores(c)]),
    ];
  } else if (tipo === "clientes") {
    linhas = [
      ["Código Domínio", "Cliente", "Razão social", ...colunasIndicadores],
      ...r.clientes.map((c) => [c.codigo_dominio, c.nome, c.razao_social, ...valoresIndicadores(c)]),
    ];
  } else {
    linhas = [
      ["Competência", ...colunasIndicadores, "Conclusão (%)"],
      ...r.meses.map((m) => [
        m.competencia.split("-").reverse().join("/"),
        ...valoresIndicadores(m),
        pct(m.concluidas + m.dispensadas, m.total),
      ]),
    ];
  }

  const csv = "\uFEFF" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
  const sufixo = [f.de, f.ate, r.departamento?.slug].filter(Boolean).join("_");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${tipo}_${sufixo}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
