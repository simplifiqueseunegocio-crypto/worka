import "server-only";
import { escaparHtml } from "@/lib/email";
import { formatarDocumento } from "@/lib/formatar";

// Blocos de HTML reaproveitados nos e-mails das automações (dentro de modeloEmail).

export type ClienteEmail = { id: string; razao_social: string; fantasia: string | null; documento: string; tipo_inscricao: number | null };

export const nomeCliente = (c: { razao_social: string; fantasia: string | null }) => c.fantasia || c.razao_social;
export const primeiroNome = (nome: string) => nome.split(/\s+/)[0];
export const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// Linha com o cliente (link, documento) e detalhes abaixo: o primeiro em
// destaque, os demais em cinza.
export function linhaClienteHtml(c: ClienteEmail, base: string, detalhes: string[]) {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #DCE3EB;font-size:14px">
    <a href="${base}/clientes/${c.id}" style="color:#0D1B2A;font-weight:bold;text-decoration:none">${escaparHtml(nomeCliente(c))}</a>
    <span style="color:#4A5868;font-size:12px"> · ${escaparHtml(formatarDocumento(c.documento, c.tipo_inscricao))}</span>
    ${detalhes.map((d, i) => `<br><span style="font-size:${i ? 12 : 13}px;color:${i ? "#4A5868" : "#0D1B2A"}">${escaparHtml(d)}</span>`).join("")}
  </td></tr>`;
}

// Linha simples: texto à esquerda e valor à direita (ex.: data).
export function linhaHtml(texto: string, direita = "", nota = "") {
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #DCE3EB;font-size:14px">${texto}${nota ? `<br><span style="font-size:12px;color:#4A5868">${nota}</span>` : ""}</td>
    <td style="padding:8px 0 8px 12px;border-bottom:1px solid #DCE3EB;font-size:13px;color:#4A5868;text-align:right;white-space:nowrap;vertical-align:top">${escaparHtml(direita)}</td>
  </tr>`;
}

export function secaoHtml(titulo: string, cor: string, linhas: string[], rodape = "") {
  if (linhas.length === 0) return "";
  return `<h2 style="margin:24px 0 4px;font-size:15px;color:${cor}">${escaparHtml(titulo)}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas.join("")}</table>${rodape}`;
}

export function botaoHtml(href: string, texto: string) {
  return `<p style="margin:28px 0 0"><a href="${href}" style="display:inline-block;background:#003064;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${escaparHtml(texto)}</a></p>`;
}

export function maisHtml(href: string, restantes: number) {
  return restantes > 0
    ? `<p style="margin:8px 0 0;font-size:13px"><a href="${href}" style="color:#003064">e mais ${restantes} na plataforma</a></p>`
    : "";
}
