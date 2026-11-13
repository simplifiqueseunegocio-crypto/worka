"use server";

import { revalidatePath } from "next/cache";
import { getUsuario } from "@/lib/auth";
import { desconectarCliente, sincronizarCliente, sincronizarTodos } from "@/lib/integracoes/conta-azul";

export type EstadoContaAzul = { ok?: string; erro?: string };

async function exigirAdmin() {
  const usuario = await getUsuario();
  return usuario.papel === "admin" && usuario.ativo ? usuario : null;
}

// Sincroniza um cliente agora.
export async function sincronizarClienteAgora(clienteId: string): Promise<EstadoContaAzul> {
  if (!(await exigirAdmin())) return { erro: "Apenas administradores podem sincronizar." };
  const r = await sincronizarCliente(clienteId);
  revalidatePath("/configuracoes/conta-azul");
  if (!r.ok) return { erro: r.erro };
  const texto = `Sincronizado: ${r.pessoas} clientes e fornecedores, ${r.parcelas} parcelas em aberto, ${r.contas} contas.`;
  return r.avisos.length ? { erro: `${texto} Avisos: ${r.avisos.join(" · ")}` } : { ok: texto };
}

// Sincroniza todos os clientes conectados (o mesmo que a rotina das 23:00).
export async function sincronizarTodosAgora(): Promise<EstadoContaAzul> {
  const usuario = await exigirAdmin();
  if (!usuario) return { erro: "Apenas administradores podem sincronizar." };
  const r = await sincronizarTodos({ origem: `manual: ${usuario.email || usuario.nome}`, limiteMs: 50_000 });
  revalidatePath("/configuracoes/conta-azul");
  if (r.conexoes === 0) return { erro: "Nenhum cliente conectado ainda." };
  const partes = [`${r.ok} de ${r.processadas} empresas sincronizadas`];
  if (r.falhas) partes.push(`${r.falhas} com erro (veja a lista)`);
  if (r.pendentes) partes.push(`${r.pendentes} ficam para a rotina das 23:00`);
  return r.falhas && !r.ok ? { erro: partes.join(" · ") } : { ok: `${partes.join(" · ")}.` };
}

export async function desconectarClienteAgora(clienteId: string): Promise<EstadoContaAzul> {
  if (!(await exigirAdmin())) return { erro: "Apenas administradores podem desconectar." };
  try {
    await desconectarCliente(clienteId);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao desconectar." };
  }
  revalidatePath("/configuracoes/conta-azul");
  return { ok: "Desconectado. O cliente continua na plataforma; só para de ser atualizado." };
}
