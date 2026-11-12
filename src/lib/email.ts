import "server-only";
import { Resend } from "resend";

// Envio de e-mails da plataforma pelo Resend (resend.com).
// RESEND_API_KEY: chave da API. EMAIL_REMETENTE: "Nome <endereco@dominio>",
// de um domínio verificado no Resend. EMAIL_RESPONDER_PARA (opcional): para
// onde vão as respostas do cliente.

export type Anexo = { nome: string; conteudo: Buffer | string };

export type EmailNovo = {
  para: string | string[];
  assunto: string;
  html: string;
  texto?: string;
  copia?: string[];
  responderPara?: string;
  anexos?: Anexo[];
};

export type ResultadoEmail = { id: string; erro?: never } | { id?: never; erro: string };

export function configuracaoEmail() {
  return {
    chave: Boolean(process.env.RESEND_API_KEY),
    remetente: process.env.EMAIL_REMETENTE || null,
    responderPara: process.env.EMAIL_RESPONDER_PARA || null,
  };
}

export function emailConfigurado() {
  const c = configuracaoEmail();
  return c.chave && Boolean(c.remetente);
}

let cliente: Resend | null = null;

export async function enviarEmail(email: EmailNovo): Promise<ResultadoEmail> {
  const { chave, remetente, responderPara } = configuracaoEmail();
  if (!chave || !remetente) return { erro: "Envio de e-mail não configurado (RESEND_API_KEY e EMAIL_REMETENTE)." };

  cliente ??= new Resend(process.env.RESEND_API_KEY);
  try {
    const { data, error } = await cliente.emails.send({
      from: remetente,
      to: email.para,
      cc: email.copia,
      replyTo: email.responderPara ?? responderPara ?? undefined,
      subject: email.assunto,
      html: email.html,
      text: email.texto,
      attachments: email.anexos?.map((a) => ({ filename: a.nome, content: a.conteudo })),
    });
    if (error || !data) return { erro: error?.message ?? "O Resend não confirmou o envio." };
    return { id: data.id };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao enviar o e-mail." };
  }
}

// Escapa texto que vai dentro do HTML de um e-mail.
export function escaparHtml(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Moldura padrão dos e-mails da MCONT: cabeçalho com a marca e rodapé.
export function modeloEmail({ titulo, corpo }: { titulo: string; corpo: string }) {
  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#F4F6F9;font-family:Arial,Helvetica,sans-serif;color:#0D1B2A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#0D1B2A;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:2px">MCONT</td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 16px;font-size:20px">${escaparHtml(titulo)}</h1>
      <div style="font-size:15px;line-height:1.6">${corpo}</div>
    </td></tr>
    <tr><td style="padding:16px 28px;background:#F4F6F9;font-size:12px;color:#4A5868">MCONT Contabilidade · e-mail enviado pela Plataforma MCONT</td></tr>
  </table>
</body>
</html>`;
}
