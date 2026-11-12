import ExcelJS from "exceljs";
import { formatarDocumento } from "./formatar";
import type { EmpresaDet, PlanilhaDet } from "./det";

// Monta o .xlsx do Robô do DET no mesmo modelo da verificação manual
// (DET_consignado_AAAA-MM-DD.xlsx): Resumo, Com Consignado, Todas e Pendências.
// Sem dependência de servidor (imports relativos): dá para testar isolado.

const AZUL = "FF1F4E78";
const LARANJA = "FFFCE4D6";
const FUSO = "America/Sao_Paulo";

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

function cabecalho(aba: ExcelJS.Worksheet, colunas: { titulo: string; largura: number }[]) {
  aba.columns = colunas.map((c) => ({ width: c.largura }));
  const linha = aba.addRow(colunas.map((c) => c.titulo));
  linha.height = 42;
  linha.eachCell((celula) => {
    celula.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    celula.alignment = { vertical: "middle", wrapText: true };
  });
  aba.views = [{ state: "frozen", ySplit: 1 }];
  aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
}

function abaEmpresas(livro: ExcelJS.Workbook, nome: string, empresas: EmpresaDet[], rotuloCiclo: string, destacarCiclo: boolean) {
  const aba = livro.addWorksheet(nome);
  cabecalho(aba, [
    { titulo: "Aba origem", largura: 15 },
    { titulo: "AP", largura: 7 },
    { titulo: "Empresa", largura: 46 },
    { titulo: "CNPJ / CPF", largura: 21 },
    { titulo: "Tem consignado no DET", largura: 13 },
    { titulo: "Último aviso de consignado", largura: 14 },
    { titulo: `Aviso em ${rotuloCiclo}`, largura: 11 },
    { titulo: "Avisos de consignado na 1ª página", largura: 13 },
    { titulo: "Mensagens não lidas", largura: 11 },
  ]);
  for (const e of empresas) {
    const linha = aba.addRow([
      e.aba_origem ?? "",
      e.codigo_dominio ?? "",
      e.razao_social,
      formatarDocumento(e.documento, e.tipo_inscricao),
      e.tem_consignado ? "SIM" : "NÃO",
      dataBR(e.ultimo_aviso),
      e.no_ciclo ? "SIM" : "NÃO",
      e.avisos_consignado ?? 0,
      e.nao_lidas ?? 0,
    ]);
    if (destacarCiclo && e.no_ciclo) {
      linha.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LARANJA } }));
    }
  }
}

export async function montarPlanilhaDet(p: PlanilhaDet, rotuloCiclo: string) {
  const noCiclo = p.comConsignado.filter((e) => e.no_ciclo);
  const ultimoCiclo = noCiclo.reduce<string | null>((m, e) => (e.ultimo_aviso && (!m || e.ultimo_aviso > m) ? e.ultimo_aviso : m), null);

  const livro = new ExcelJS.Workbook();
  livro.creator = "Worka";
  livro.created = new Date();

  const resumo = livro.addWorksheet("Resumo");
  resumo.columns = [{ width: 42 }, { width: 16 }];
  resumo.addRow(["Verificação DET – Crédito do Trabalhador (consignado)"]).font = { bold: true, size: 14 };
  const dataConsulta = p.consultadoEm
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short" }).format(new Date(p.consultadoEm))
    : "—";
  for (const [rotulo, valor] of [
    ["Data da consulta", dataConsulta],
    ["Empresas consultadas", p.empresas.length],
    ["Com aviso de consignado", p.comConsignado.length],
    [`Com aviso em ${rotuloCiclo}`, noCiclo.length],
    ["Sem consignado", p.empresas.length - p.comConsignado.length],
    ["Pendências (não consultadas)", p.pendencias.length],
  ] as const) {
    resumo.addRow([rotulo, valor]).getCell(2).alignment = { horizontal: "right" };
  }
  resumo.addRow([]);
  resumo.addRow(["Observações"]).font = { bold: true, size: 12 };
  for (const obs of [
    "• Só foi lida a lista da Caixa Postal; nenhuma mensagem foi aberta, para não registrar ciência.",
    "• \"Avisos de consignado na 1ª página\" conta os avisos entre as mensagens mais recentes da lista; empresas com histórico longo podem ter mais.",
    `• Linhas em laranja na aba "Com Consignado" = aviso no ciclo mais recente${ultimoCiclo ? ` (${dataBR(ultimoCiclo)})` : ""}.`,
    "• Fonte: planilha de empresas enviada na tela do robô (ou os clientes ativos, sem planilha).",
  ]) {
    resumo.addRow([obs]);
  }

  abaEmpresas(livro, "Com Consignado", p.comConsignado, rotuloCiclo, true);
  abaEmpresas(livro, "Todas", p.empresas, rotuloCiclo, false);

  const pend = livro.addWorksheet("Pendências");
  cabecalho(pend, [
    { titulo: "Aba origem", largura: 15 },
    { titulo: "AP", largura: 7 },
    { titulo: "Empresa", largura: 46 },
    { titulo: "CNPJ / CPF", largura: 21 },
    { titulo: "Motivo", largura: 70 },
  ]);
  for (const e of p.pendencias) {
    pend.addRow([e.aba_origem ?? "", e.codigo ?? "", e.razao_social, formatarDocumento(e.documento, e.tipo_inscricao), e.motivo]);
  }

  return livro.xlsx.writeBuffer();
}
