"use server";

import { refresh } from "next/cache";
import { getUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LIMITE_PDF, destinatariosAdiantamento, podeEnviarAdiantamento } from "@/lib/adiantamento";
import { enviarEmail, escaparHtml, modeloEmail } from "@/lib/email";

export type ClienteAdiantamento = {
  id: string;
  razao_social: string;
  fantasia: string | null;
  codigo_dominio: number | null;
  destinatarios: string[];
  origem: "contatos" | "cadastro" | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const CAMPOS = "id, razao_social, fantasia, codigo_dominio, documento";

type Linha = Omit<ClienteAdiantamento, "destinatarios" | "origem"> & { documento: string };

async function comDestinatarios(linhas: Linha[]): Promise<ClienteAdiantamento[]> {
  const mapa = await destinatariosAdiantamento(linhas.map((l) => l.id));
  return linhas.map((l) => ({
    id: l.id,
    razao_social: l.razao_social,
    fantasia: l.fantasia,
    codigo_dominio: l.codigo_dominio,
    destinatarios: mapa.get(l.id)?.emails ?? [],
    origem: mapa.get(l.id)?.origem ?? null,
  }));
}

// Busca de cliente ativo para um arquivo (nome, fantasia, código ou CNPJ/CPF).
export async function buscarClientesAdiantamento(busca: string): Promise<ClienteAdiantamento[]> {
  const termo = busca.replace(/[,()*%\\]/g, " ").trim().slice(0, 80);
  if (termo.length < 2) return [];
  const digitos = termo.replace(/\D/g, "");
  const condicoes = [`razao_social.ilike.*${termo}*`, `fantasia.ilike.*${termo}*`];
  if (digitos.length >= 3) condicoes.push(`documento.like.*${digitos}*`);
  if (/^\d{1,6}$/.test(termo)) condicoes.push(`codigo_dominio.eq.${termo}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select(CAMPOS)
    .eq("status", "ativo")
    .or(condicoes.join(","))
    .order("razao_social")
    .limit(8);
  if (error) return [];
  return comDestinatarios((data ?? []) as Linha[]);
}

// CNPJ/CPF no nome do arquivo, com ou sem pontuação.
const DOCUMENTO = /\d[\d./-]{9,}\d/g;
// Competência ou data no nome ("11-2026", "2026_11", "15.11.2026"): não é código.
const DATA = /\d{1,2}[-_./]\d{1,2}[-_./]\d{2,4}|\d{1,2}[-_./]\d{4}|\d{4}[-_./]\d{1,2}/g;

// Identifica o cliente de cada arquivo pelo nome: um CNPJ/CPF ou um número
// que seja o código da empresa no Domínio. Devolve, na ordem dos nomes, o
// cliente encontrado ou null.
export async function identificarArquivos(nomes: string[]): Promise<(ClienteAdiantamento | null)[]> {
  const candidatos = nomes.slice(0, 200).map((nome) => {
    const base = nome.replace(/\.pdf$/i, "");
    const documentos = (base.match(DOCUMENTO) ?? [])
      .map((d) => d.replace(/\D/g, ""))
      .filter((d) => d.length === 14 || d.length === 11);
    const semDatas = base.replace(DOCUMENTO, " ").replace(DATA, " ");
    const codigos = (semDatas.match(/\d{1,6}/g) ?? []).map(Number).filter((c) => c > 0);
    return { documentos, codigos };
  });
  const documentos = [...new Set(candidatos.flatMap((c) => c.documentos))];
  const codigos = [...new Set(candidatos.flatMap((c) => c.codigos))];
  if (!documentos.length && !codigos.length) return candidatos.map(() => null);

  const condicoes: string[] = [];
  if (documentos.length) condicoes.push(`documento.in.(${documentos.join(",")})`);
  if (codigos.length) condicoes.push(`codigo_dominio.in.(${codigos.join(",")})`);
  const supabase = await createClient();
  const { data } = await supabase.from("clientes").select(CAMPOS).eq("status", "ativo").or(condicoes.join(","));
  const linhas = (data ?? []) as Linha[];
  const encontrados = await comDestinatarios(linhas);

  return candidatos.map((c) => {
    // O documento identifica melhor que um número solto no nome. Se os números
    // apontam para mais de um cliente, não chuta: fica para escolher na tela.
    const porDocumento = linhas.filter((l) => c.documentos.includes(l.documento));
    const porCodigo = linhas.filter((l) => l.codigo_dominio !== null && c.codigos.includes(l.codigo_dominio));
    const achados = porDocumento.length ? porDocumento : porCodigo;
    return achados.length === 1 ? (encontrados.find((e) => e.id === achados[0].id) ?? null) : null;
  });
}

export type ResultadoEnvio = { ok?: string; erro?: string; destinatarios?: string[] };

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// Envia a folha de um cliente: um PDF por chamada, para caber no limite do corpo.
export async function enviarFolhaAdiantamento(form: FormData): Promise<ResultadoEnvio> {
  const arquivo = form.get("arquivo");
  const clienteId = String(form.get("clienteId") ?? "");
  const competencia = String(form.get("competencia") ?? "");
  if (!(arquivo instanceof File) || !arquivo.size) return { erro: "Escolha o PDF." };
  if (!UUID.test(clienteId)) return { erro: "Escolha o cliente." };
  if (!COMPETENCIA.test(competencia)) return { erro: "Competência inválida." };
  if (arquivo.size > LIMITE_PDF) return { erro: "PDF maior que 4 MB." };

  const conteudo = Buffer.from(await arquivo.arrayBuffer());
  if (conteudo.subarray(0, 5).toString("latin1") !== "%PDF-") return { erro: "O arquivo não é um PDF." };

  const usuario = await getUsuario();
  if (!(await podeEnviarAdiantamento(usuario))) {
    return { erro: "Apenas o Departamento Pessoal ou o admin envia a folha." };
  }

  const supabase = await createClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, razao_social, fantasia")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente) return { erro: "Cliente não encontrado." };

  const destinatarios = (await destinatariosAdiantamento([clienteId])).get(clienteId)?.emails ?? [];
  if (!destinatarios.length) return { erro: "O cliente não tem e-mail para receber a folha." };

  const [a, m] = competencia.split("-");
  const mesAno = `${MESES[Number(m) - 1]} de ${a}`;
  const nomeCliente = cliente.fantasia || cliente.razao_social;
  const nomeArquivo = /\.pdf$/i.test(arquivo.name) ? arquivo.name : `${arquivo.name}.pdf`;

  const r = await enviarEmail({
    para: destinatarios,
    assunto: `Folha de adiantamento ${m}/${a} · ${nomeCliente}`,
    html: modeloEmail({
      titulo: `Folha de adiantamento · ${m}/${a}`,
      corpo: `<p>Olá, ${escaparHtml(nomeCliente)}.</p>
<p>Segue em anexo a folha de adiantamento salarial de <strong>${mesAno}</strong>.</p>
<p>Qualquer dúvida, é só responder este e-mail.</p>
<p>Departamento Pessoal · MCONT</p>`,
    }),
    texto: `Olá, ${nomeCliente}.\n\nSegue em anexo a folha de adiantamento salarial de ${mesAno}.\n\nQualquer dúvida, é só responder este e-mail.\n\nDepartamento Pessoal · MCONT`,
    anexos: [{ nome: nomeArquivo, conteudo }],
  });

  const { error } = await supabase.from("adiantamento_envios").insert({
    cliente_id: clienteId,
    competencia: `${competencia}-01`,
    arquivo_nome: nomeArquivo.slice(0, 200),
    arquivo_bytes: conteudo.length,
    destinatarios,
    email_id: r.id ?? null,
    erro: r.erro ? r.erro.slice(0, 500) : null,
    enviado_por: usuario.id,
  });
  refresh();

  if (r.erro) return { erro: `Não enviado: ${r.erro}` };
  if (error) return { ok: "Enviado, mas o registro do envio falhou.", destinatarios };
  return { ok: "Enviado", destinatarios };
}
