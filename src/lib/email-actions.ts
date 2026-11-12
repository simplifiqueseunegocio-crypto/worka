"use server";

import { getUsuario } from "@/lib/auth";
import { enviarEmail, escaparHtml, modeloEmail } from "@/lib/email";

export type EstadoEmailTeste = { ok?: string; erro?: string };

// Envia um e-mail de teste para o próprio usuário (admin), para conferir a
// chave do Resend e o domínio do remetente.
export async function enviarEmailTeste(): Promise<EstadoEmailTeste> {
  const usuario = await getUsuario();
  if (usuario.papel !== "admin") return { erro: "Apenas admin pode enviar o e-mail de teste." };
  if (!usuario.email) return { erro: "Seu usuário não tem e-mail cadastrado." };

  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const r = await enviarEmail({
    para: usuario.email,
    assunto: "Teste de envio do Worka",
    html: modeloEmail({
      titulo: "O envio de e-mails está funcionando",
      corpo: `<p>Olá, ${escaparHtml(usuario.nome)}.</p><p>Este é um e-mail de teste enviado pelo Worka em ${quando}.</p>`,
    }),
    texto: `Olá, ${usuario.nome}. Este é um e-mail de teste enviado pelo Worka em ${quando}.`,
  });
  if (r.erro) return { erro: `Não enviado: ${r.erro}` };
  return { ok: `Enviado para ${usuario.email}.` };
}
