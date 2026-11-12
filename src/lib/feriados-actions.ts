"use server";

import { refresh } from "next/cache";
import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Cadastro de feriados (só admin; a RLS também exige).

export type EstadoFeriado = { ok?: string; erro?: string };

const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UFS = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "),
);

async function exigirAdmin(): Promise<EstadoFeriado | null> {
  const usuario = await getUsuario();
  return usuario.ativo && usuario.papel === "admin" ? null : { erro: "Só administradores alteram os feriados." };
}

function dataValida(iso: string) {
  return DATA.test(iso) && new Date(`${iso}T12:00:00Z`).toISOString().startsWith(iso);
}

export async function adicionarFeriado(form: FormData): Promise<EstadoFeriado> {
  const negado = await exigirAdmin();
  if (negado) return negado;

  const data = String(form.get("data") ?? "");
  const descricao = String(form.get("descricao") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const tipo = String(form.get("abrangencia") ?? "nacional");
  const uf = tipo === "nacional" ? null : String(form.get("uf") ?? "").toUpperCase();
  const municipio = tipo === "municipal" ? String(form.get("municipio") ?? "").trim().replace(/\s+/g, " ").slice(0, 80) : null;

  if (!dataValida(data)) return { erro: "Informe uma data válida." };
  if (!descricao) return { erro: "Informe o nome do feriado." };
  if (uf !== null && !UFS.has(uf)) return { erro: "Escolha o estado." };
  if (tipo === "municipal" && !municipio) return { erro: "Informe o município." };

  const supabase = await createClient();
  const { error } = await supabase.from("feriados").insert({ data, descricao, uf, municipio });
  if (error) {
    if (error.code === "23505") return { erro: "Já existe um feriado nessa data com essa abrangência." };
    if (error.code === "42501") return { erro: "Só administradores alteram os feriados." };
    return { erro: "Não foi possível salvar agora. Tente de novo." };
  }
  refresh();
  return { ok: `Feriado de ${data.split("-").reverse().join("/")} cadastrado.` };
}

export async function excluirFeriado(f: { data: string; uf: string | null; municipio: string | null }): Promise<EstadoFeriado> {
  const negado = await exigirAdmin();
  if (negado) return negado;
  if (!dataValida(f.data)) return { erro: "Feriado inválido." };

  const supabase = await createClient();
  let q = supabase.from("feriados").delete().eq("data", f.data);
  q = f.uf === null ? q.is("uf", null) : q.eq("uf", f.uf);
  q = f.municipio === null ? q.is("municipio", null) : q.eq("municipio", f.municipio);
  const { data, error } = await q.select("data");
  if (error) return { erro: "Não foi possível excluir agora. Tente de novo." };
  if (!data?.length) return { erro: "Feriado não encontrado. Recarregue a página." };
  refresh();
  return { ok: "Feriado excluído." };
}

// Importa os feriados nacionais do ano pela BrasilAPI. Não mexe nos que já
// existem na mesma data; domingos (ex.: Páscoa) não afetam prazos e ficam de fora.
export async function importarNacionais(ano: number): Promise<EstadoFeriado> {
  const negado = await exigirAdmin();
  if (negado) return negado;
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return { erro: "Ano inválido." };

  let lista: { date: string; name: string; type: string }[];
  try {
    const r = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, {
      headers: { accept: "application/json", "user-agent": "PlataformaMCONT/1.0" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!r.ok) return { erro: `A BrasilAPI não respondeu (código ${r.status}). Tente mais tarde.` };
    lista = await r.json();
  } catch {
    return { erro: "Não foi possível falar com a BrasilAPI. Tente mais tarde." };
  }

  const nacionais = lista.filter(
    (f) => f.type === "national" && dataValida(f.date) && new Date(`${f.date}T12:00:00Z`).getUTCDay() !== 0,
  );
  if (nacionais.length === 0) return { erro: `A BrasilAPI não tem feriados nacionais de ${ano}.` };

  const supabase = await createClient();
  const { data: existentes, error: e1 } = await supabase
    .from("feriados")
    .select("data")
    .is("uf", null)
    .is("municipio", null)
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`);
  if (e1) return { erro: "Não foi possível ler os feriados atuais." };
  const ja = new Set((existentes ?? []).map((f) => f.data as string));
  const novos = nacionais
    .filter((f) => !ja.has(f.date))
    .map((f) => ({ data: f.date, descricao: f.name.charAt(0).toUpperCase() + f.name.slice(1), uf: null, municipio: null }));

  if (novos.length === 0) return { ok: `Os feriados nacionais de ${ano} já estavam todos cadastrados.` };
  const { error } = await supabase.from("feriados").insert(novos);
  if (error) return { erro: error.code === "42501" ? "Só administradores alteram os feriados." : "Não foi possível importar agora." };
  refresh();
  return { ok: `${novos.length} ${novos.length === 1 ? "feriado nacional importado" : "feriados nacionais importados"} para ${ano}.` };
}
