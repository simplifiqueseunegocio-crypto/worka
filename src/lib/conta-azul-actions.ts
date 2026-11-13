"use server";

import { revalidatePath } from "next/cache";
import { getUsuario } from "@/lib/auth";
import { desconectarContaAzul, sincronizarContaAzul } from "@/lib/integracoes/conta-azul";

export type EstadoContaAzul = { ok?: string; erro?: string };

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

// "Sincronizar agora" (admin). forcar: aceita uma queda grande na carteira.
export async function sincronizarAgora(forcar = false): Promise<EstadoContaAzul> {
  const usuario = await getUsuario();
  if (usuario.papel !== "admin" || !usuario.ativo) return { erro: "Apenas administradores podem sincronizar." };

  const r = await sincronizarContaAzul({ origem: `manual: ${usuario.email || usuario.nome}`, forcar });
  revalidatePath("/configuracoes/conta-azul");
  revalidatePath("/clientes");
  if (!r.ok) return { erro: r.mensagem };

  const partes = [
    plural(r.recebidas, "cliente recebido", "clientes recebidos"),
    `${r.inseridas} novos`,
    r.vinculadas ? `${r.vinculadas} vinculados pelo CNPJ` : null,
    r.reativadas ? `${r.reativadas} reativados` : null,
    `${r.suspensas} suspensos`,
    r.ignorados ? `${r.ignorados} sem CPF/CNPJ válido (ignorados)` : null,
  ].filter(Boolean);
  return { ok: `Sincronizado: ${partes.join(" · ")}.` };
}

export async function desconectar(): Promise<EstadoContaAzul> {
  const usuario = await getUsuario();
  if (usuario.papel !== "admin" || !usuario.ativo) return { erro: "Apenas administradores podem desconectar." };
  try {
    await desconectarContaAzul();
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao desconectar." };
  }
  revalidatePath("/configuracoes/conta-azul");
  return { ok: "Conta Azul desconectada. A sincronização diária fica parada até conectar de novo." };
}
