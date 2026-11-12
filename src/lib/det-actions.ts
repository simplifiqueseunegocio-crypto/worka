"use server";

import ExcelJS from "exceljs";
import { refresh } from "next/cache";
import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { lerAbas } from "@/lib/det-leitura";

// Ações da tela do Robô do DET (gestor ou admin): iniciar a fila e enviar a
// planilha de empresas que é a fonte do robô.

export type EstadoDet = { ok?: string; erro?: string; problemas?: { empresa: string; motivo: string }[] };

const LIMITE_PLANILHA = 4 * 1024 * 1024;

async function podeOperar() {
  const u = await getUsuario();
  return u.ativo && (u.papel === "admin" || u.papel === "gestor");
}

// Coloca as empresas na fila agora. O robô do escritório pega na próxima verificação.
export async function iniciarDet(): Promise<EstadoDet> {
  if (!(await podeOperar())) return { erro: "Só gestores e administradores iniciam o robô." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enfileirar_det");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { erro: "Aplique a migration 20261111000200_det_planilha.sql." };
    return { erro: "Não foi possível iniciar agora. Tente de novo." };
  }
  const n = Number(data ?? 0);
  refresh();
  return n
    ? { ok: `${n} ${n === 1 ? "empresa colocada" : "empresas colocadas"} na fila. O robô começa na próxima verificação do computador do escritório.` }
    : { ok: "As empresas já estavam na fila. O robô começa na próxima verificação." };
}

// ---------------------------------------------------------------------------
// Planilha (a leitura fica em det-leitura.ts)

export async function enviarPlanilhaDet(form: FormData): Promise<EstadoDet> {
  if (!(await podeOperar())) return { erro: "Só gestores e administradores enviam a planilha." };
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { erro: "Escolha a planilha." };
  if (!/\.xlsx$/i.test(arquivo.name)) return { erro: "Envie em .xlsx (no Excel: Salvar como → Pasta de Trabalho do Excel)." };
  if (arquivo.size > LIMITE_PLANILHA) return { erro: "Planilha maior que 4 MB." };

  const livro = new ExcelJS.Workbook();
  try {
    await livro.xlsx.load(await arquivo.arrayBuffer());
  } catch {
    return { erro: "Não foi possível ler a planilha. Confira se é um .xlsx válido." };
  }
  const linhas = lerAbas(livro);
  if (linhas.length === 0) return { erro: "Nenhuma aba com coluna de CNPJ encontrada na planilha." };

  // Casa com os clientes pelo documento.
  const supabase = await createClient();
  const docs = [...new Set(linhas.filter((l) => !l.problema).map((l) => l.documento))];
  const clientePorDoc = new Map<string, string>();
  for (let i = 0; i < docs.length; i += 300) {
    const { data, error } = await supabase.from("clientes").select("id, documento").in("documento", docs.slice(i, i + 300));
    if (error) return { erro: "Não foi possível consultar os clientes. Tente de novo." };
    for (const c of data ?? []) clientePorDoc.set(c.documento as string, c.id as string);
  }
  const empresas = linhas.map((l) => {
    const cliente_id = l.problema ? null : (clientePorDoc.get(l.documento) ?? null);
    return { ...l, cliente_id, problema: l.problema ?? (cliente_id ? null : "CNPJ não cadastrado na plataforma") };
  });
  const validas = empresas.filter((e) => !e.problema).length;

  const { data: planilha, error: e1 } = await supabase
    .from("det_planilhas")
    .insert({ arquivo_nome: arquivo.name.slice(0, 200), linhas: empresas.length, validas })
    .select("id")
    .single();
  if (e1 || !planilha) {
    if (e1?.code === "42P01" || e1?.code === "PGRST205") return { erro: "Aplique a migration 20261111000200_det_planilha.sql." };
    return { erro: "Não foi possível salvar a planilha. Tente de novo." };
  }
  for (let i = 0; i < empresas.length; i += 500) {
    const { error } = await supabase
      .from("det_empresas")
      .insert(empresas.slice(i, i + 500).map((e) => ({ ...e, planilha_id: planilha.id })));
    if (error) {
      await supabase.from("det_planilhas").delete().eq("id", planilha.id);
      return { erro: "Não foi possível salvar as empresas da planilha. Tente de novo." };
    }
  }
  // Só a planilha atual importa: apaga as anteriores (e as empresas delas).
  await supabase.from("det_planilhas").delete().neq("id", planilha.id);

  refresh();
  const problemas = empresas.filter((e) => e.problema).map((e) => ({ empresa: e.empresa, motivo: e.problema! }));
  return {
    ok: `${empresas.length} empresas lidas · ${validas} entram na fila${problemas.length ? ` · ${problemas.length} com pendência` : ""}.`,
    problemas,
  };
}
