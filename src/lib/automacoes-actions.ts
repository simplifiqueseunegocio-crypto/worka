"use server";

import { getUsuario } from "@/lib/auth";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { enderecoPlataforma } from "@/lib/equipe";
import { coletarResumos, montarEmailResumo, temConteudo } from "@/lib/resumo-diario";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeISO } from "@/lib/tarefas";

export type EstadoPrevia = { ok?: string; erro?: string };

// Envia ao próprio usuário o resumo diário dele, como sairia hoje. Lê só as
// tarefas de quem pediu, então qualquer pessoa ativa pode usar.
export async function enviarPreviaResumo(): Promise<EstadoPrevia> {
  const usuario = await getUsuario();
  if (!usuario.ativo) return { erro: "Seu acesso ainda não foi ativado." };
  if (!usuario.email) return { erro: "Seu usuário não tem e-mail cadastrado." };
  if (!emailConfigurado()) return { erro: "Envio de e-mail não configurado (RESEND_API_KEY e EMAIL_REMETENTE)." };

  const hoje = hojeISO();
  const [resumo] = await coletarResumos(createAdminClient(), hoje, usuario.id);
  if (!resumo || !temConteudo(resumo)) {
    return { ok: "Você não tem tarefas atrasadas nem vencendo nos próximos 7 dias: hoje não receberia o resumo." };
  }

  const email = montarEmailResumo(resumo, hoje, await enderecoPlataforma());
  const r = await enviarEmail({ para: usuario.email, ...email, assunto: `[Prévia] ${email.assunto}` });
  if (r.erro) return { erro: `Não enviado: ${r.erro}` };
  return { ok: `Prévia enviada para ${usuario.email}.` };
}
