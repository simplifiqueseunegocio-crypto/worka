import "server-only";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirPdf, linhasDaPagina, paginaComoImagem } from "@/lib/ponto-pdf";
import { lerPaginaSemIa, type PaginaLida } from "@/lib/ponto-texto";
import { fornecedorIa, lerComIa, paginasPorPedido, paraleloIa } from "@/lib/ponto-ia";
import { mesmaEmpresa } from "@/lib/documentos/tipos";
import { nomeComparavel, type DiaPonto, type JornadaDia, type TotalOrigem } from "@/lib/ponto-regras";

// Leitura de uma ficha ponto enviada pelo DP:
// 1. PDF com texto (sistema de ponto, digitado): leitor sem IA (ponto-texto.ts).
// 2. Página escaneada, foto ou imagem: IA (ponto-ia.ts), uma página por vez.
// As fichas do mesmo funcionário (várias páginas) são juntadas no fim, e as
// de empresas diferentes ficam cada uma com o seu cliente (ponto_fichas.cliente_id).

export const BUCKET_PONTO = "ponto";

export type ArquivoPonto = { path: string; nome: string; tipo: string; bytes: number };

// Uma página a ler: já lida sem IA ou uma imagem para a IA. Guarda de que
// arquivo veio (para separar as empresas, cada uma com os seus arquivos).
type Unidade = { rotulo: string; arquivo: number } & ({ lida: PaginaLida } | { imagem: () => Promise<Buffer> });

async function unidadesDoArquivo(a: ArquivoPonto, arquivo: number, conteudo: Buffer, competencia: string | null): Promise<Unidade[]> {
  if (a.tipo === "application/pdf") {
    const doc = await abrirPdf(conteudo);
    const unidades: Unidade[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const rotulo = doc.numPages > 1 ? `${a.nome}, página ${n}` : a.nome;
      const lida = lerPaginaSemIa(await linhasDaPagina(doc, n), competencia);
      unidades.push(lida ? { rotulo, arquivo, lida } : { rotulo, arquivo, imagem: () => paginaComoImagem(doc, n, 2200) });
    }
    return unidades;
  }
  // Foto/imagem: endireita pela orientação da câmera e reduz para a IA.
  return [
    {
      rotulo: a.nome,
      arquivo,
      imagem: () => sharp(conteudo).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Junta as fichas do mesmo funcionário (uma ficha pode ocupar várias páginas)

type FichaLida = PaginaLida["fichas"][number];
type FichaJunta = {
  nome: string;
  cpf: string | null;
  cargo: string | null;
  admissao: string | null;
  jornada: JornadaDia[];
  dias: DiaPonto[];
  totais_origem: TotalOrigem[];
  observacoes: string | null;
};

const soDigitos = (s: string | null) => (s ? s.replace(/\D/g, "") : null) || null;
const dataValida = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const horaOk = (h: string) => /^\d{1,2}:\d{2}$/.test(h.trim());

function juntar(lidas: FichaLida[]): FichaJunta[] {
  const porChave = new Map<string, FichaJunta>();
  for (const f of lidas) {
    const cpf = soDigitos(f.cpf);
    const chave = cpf && cpf.length === 11 ? `cpf:${cpf}` : `nome:${nomeComparavel(f.nome)}`;
    const atual = porChave.get(chave);
    // A IA pode devolver "7:05": completa com zero; o resto a conferência aponta.
    const dias = f.dias
      .filter((d) => dataValida(d.data))
      .map((d) => ({ ...d, marcacoes: d.marcacoes.map((m) => ({ ...m, hora: horaOk(m.hora) ? m.hora.trim().padStart(5, "0") : m.hora })) }));
    if (!atual) {
      porChave.set(chave, {
        nome: f.nome.trim(),
        cpf: cpf && cpf.length === 11 ? cpf : null,
        cargo: f.cargo,
        admissao: dataValida(f.admissao),
        jornada: f.jornada,
        dias,
        totais_origem: f.totais_origem,
        observacoes: f.observacoes,
      });
      continue;
    }
    if (!atual.jornada.length) atual.jornada = f.jornada;
    atual.cargo ??= f.cargo;
    atual.totais_origem.push(...f.totais_origem);
    if (f.observacoes) atual.observacoes = [atual.observacoes, f.observacoes].filter(Boolean).join("\n");
    for (const d of dias) {
      const i = atual.dias.findIndex((x) => x.data === d.data);
      if (i < 0) atual.dias.push(d);
      else if (d.marcacoes.length > atual.dias[i].marcacoes.length) atual.dias[i] = d;
    }
  }
  for (const f of porChave.values()) f.dias.sort((a, b) => a.data.localeCompare(b.data));
  return [...porChave.values()];
}

// ---------------------------------------------------------------------------
// Datas lidas pela IA: em ficha escrita à mão o dia é confiável, o mês e o ano
// nem sempre (a IA pode inventar o ano). Com a competência informada, vale ela
// (aceitando o mês anterior, para fichas de 21 a 20); sem competência, vale o
// ano mais recente em que a data não fica no futuro.

function ajustarDatas(p: PaginaLida, competencia: string | null): PaginaLida {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const ajustar = (data: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
    if (!m) return data;
    let [ano, mes] = [Number(m[1]), Number(m[2])];
    const dia = m[3];
    if (competencia) {
      const [ca, cm] = competencia.split("-").map(Number);
      const anterior = cm === 1 ? [ca - 1, 12] : [ca, cm - 1];
      const ok = (ano === ca && mes === cm) || (ano === anterior[0] && mes === anterior[1]);
      // Fora da competência: fica no mês anterior (ficha de 21 a 20) ou na competência.
      if (!ok) [ano, mes] = mes === anterior[1] ? anterior : [ca, cm];
    } else {
      ano = Number(hoje.slice(0, 4));
      if (`${ano}-${String(mes).padStart(2, "0")}-${dia}` > hoje) ano--;
    }
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${dia}`;
    const valida = new Date(`${iso}T12:00:00Z`);
    return Number.isNaN(valida.getTime()) || valida.getUTCDate() !== Number(dia) ? data : iso;
  };
  return { ...p, fichas: p.fichas.map((f) => ({ ...f, dias: f.dias.map((d) => ({ ...d, data: ajustar(d.data) })) })) };
}

// ---------------------------------------------------------------------------
// Separa as páginas por empresa: fichas de clientes diferentes enviadas juntas
// ficam, cada uma, com o cliente da sua empresa.

type Resultado = { arquivo: number; ordem: number; pagina: PaginaLida };
type Grupo = { empresa: string | null; documento: string | null; resultados: Resultado[]; arquivos: Set<number> };

// Nome da empresa para comparar: sem acento, caixa e tipo societário.
const nomeEmpresa = (s: string | null) =>
  s
    ? nomeComparavel(s)
        .toLowerCase()
        .replace(/\b(ltda|limitada|eireli|me|epp|mei|s\/?a|sa|cia|companhia)\b\.?/g, " ")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || null
    : null;

export function separarPorEmpresa(resultados: Resultado[]): Grupo[] {
  const ordenados = [...resultados].sort((a, b) => a.ordem - b.ordem);
  const docDe = (r: Resultado) => {
    const d = soDigitos(r.pagina.documento_empresa);
    return d && (d.length === 14 || d.length === 11) ? d : null;
  };
  // Nomes lidos de jeitos um pouco diferentes ("X Escola" e "X Escola Eireli")
  // contam como a mesma empresa; o CNPJ lido junto com um nome vale para ele.
  const nomes: string[] = [];
  const nomeCanonico = (r: Resultado) => {
    const n = nomeEmpresa(r.pagina.empresa);
    if (!n) return null;
    const igual = nomes.find((x) => x === n || x.startsWith(n) || n.startsWith(x));
    if (igual) return igual;
    nomes.push(n);
    return n;
  };
  const docDoNome = new Map<string, string>();
  for (const r of ordenados) {
    const d = docDe(r);
    const n = nomeCanonico(r);
    if (d && n && !docDoNome.has(n)) docDoNome.set(n, d);
  }
  const chaveDe = (r: Resultado) => {
    const d = docDe(r);
    if (d) return `doc:${d}`;
    const n = nomeCanonico(r);
    if (!n) return null;
    const dn = docDoNome.get(n);
    return dn ? `doc:${dn}` : `nome:${n}`;
  };
  // Página sem empresa (verso, folha sem cabeçalho): fica com a do mesmo
  // arquivo; sem nenhuma no arquivo, com a primeira empresa lida.
  const chaveDoArquivo = new Map<number, string>();
  for (const r of ordenados) {
    const c = chaveDe(r);
    if (c && !chaveDoArquivo.has(r.arquivo)) chaveDoArquivo.set(r.arquivo, c);
  }
  const primeira = ordenados.map(chaveDe).find(Boolean) ?? "";
  const grupos = new Map<string, Grupo>();
  for (const r of ordenados) {
    const chave = chaveDe(r) ?? chaveDoArquivo.get(r.arquivo) ?? primeira;
    let g = grupos.get(chave);
    if (!g) {
      g = { empresa: null, documento: chave.startsWith("doc:") ? chave.slice(4) : null, resultados: [], arquivos: new Set() };
      grupos.set(chave, g);
    }
    g.resultados.push(r);
    g.arquivos.add(r.arquivo);
    g.empresa ??= r.pagina.empresa?.trim() || null;
  }
  return [...grupos.values()];
}

// ---------------------------------------------------------------------------
// Processa uma leitura inteira (roda depois da resposta, em after()).

export async function processarLeitura(leituraId: string) {
  const db = createAdminClient();
  const falhar = (mensagem: string) =>
    db.from("ponto_leituras").update({ status: "erro", mensagem: mensagem.slice(0, 2000) }).eq("id", leituraId);

  try {
    const { data: leitura, error } = await db
      .from("ponto_leituras")
      .select("id, cliente_id, competencia, arquivos")
      .eq("id", leituraId)
      .single();
    if (error || !leitura) return;
    const competencia = leitura.competencia ? String(leitura.competencia).slice(0, 7) : null;
    const arquivos = leitura.arquivos as ArquivoPonto[];

    // 1. Baixa os arquivos; páginas com texto já saem lidas.
    const unidades: Unidade[] = [];
    for (const [i, a] of arquivos.entries()) {
      const { data: arq, error: e } = await db.storage.from(BUCKET_PONTO).download(a.path);
      if (e || !arq) throw new Error(`Não foi possível abrir ${a.nome}`);
      try {
        unidades.push(...(await unidadesDoArquivo(a, i, Buffer.from(await arq.arrayBuffer()), competencia)));
      } catch (err) {
        console.error("Ponto: arquivo", a.nome, err);
        throw new Error(`Não foi possível ler ${a.nome}: o arquivo está corrompido ou num formato não aceito`);
      }
    }
    const semIa = unidades.filter((u) => "lida" in u).length;
    await db.from("ponto_leituras").update({ paginas_total: unidades.length, paginas_lidas: semIa, status: "lendo", mensagem: null }).eq("id", leituraId);

    // 2. O resto vai para a IA, em paralelo, com o andamento salvo para a tela.
    const resultados: Resultado[] = unidades.flatMap((u, ordem) => ("lida" in u ? [{ arquivo: u.arquivo, ordem, pagina: u.lida }] : []));
    const paraIa = unidades.flatMap((u, ordem) => ("imagem" in u ? [{ ...u, ordem }] : []));
    const fornecedor = fornecedorIa();
    const falhas: string[] = [];
    let falhasIa = 0;
    if (paraIa.length && !fornecedor) {
      falhas.push(`${paraIa.length} ${paraIa.length === 1 ? "página precisa" : "páginas precisam"} de IA (escaneada ou foto), mas nenhuma IA está configurada (GROQ_API_KEY ou ANTHROPIC_API_KEY)`);
    } else if (fornecedor) {
      // Páginas em sequência do mesmo arquivo vão juntas num pedido (frente e
      // verso do mesmo cartão: o nome e o mês da 1ª página valem para a 2ª).
      // Arquivos diferentes nunca se misturam: podem ser de empresas diferentes.
      const porPedido = paginasPorPedido(fornecedor);
      const grupos: (typeof paraIa)[] = [];
      for (const u of paraIa) {
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.length < porPedido && ultimo[0].arquivo === u.arquivo) ultimo.push(u);
        else grupos.push([u]);
      }
      let lidas = semIa;
      let proximo = 0;
      await Promise.all(
        Array.from({ length: Math.min(paraleloIa(fornecedor), grupos.length) }, async () => {
          while (proximo < grupos.length) {
            const g = grupos[proximo++];
            const rotulo = g.length > 1 ? `${g[0].rotulo} a ${g[g.length - 1].rotulo}` : g[0].rotulo;
            try {
              const imagens = await Promise.all(g.map((u) => u.imagem()));
              const pagina = ajustarDatas(await lerComIa(fornecedor, imagens, competencia, rotulo), competencia);
              resultados.push({ arquivo: g[0].arquivo, ordem: g[0].ordem, pagina });
            } catch (e) {
              falhas.push(e instanceof Error ? e.message : `${rotulo}: falha na leitura`);
              falhasIa += g.length;
            }
            lidas += g.length;
            await db.from("ponto_leituras").update({ paginas_lidas: lidas }).eq("id", leituraId);
          }
        }),
      );
    }

    // 3. Cada ficha com a sua empresa (fichas de clientes diferentes podem vir
    // juntas). O cliente de cada empresa vem do CNPJ/CPF lido.
    const empresas = separarPorEmpresa(resultados)
      .map((g) => ({ ...g, fichas: juntar(g.resultados.flatMap((r) => r.pagina.fichas)).filter((f) => f.dias.length) }))
      .filter((g) => g.fichas.length);
    if (!empresas.length) {
      await falhar(falhas.length ? falhas.join(" · ") : "Nenhuma ficha de ponto preenchida encontrada nos arquivos (folha em branco?).");
      return;
    }

    // Cliente escolhido no envio: vale para a empresa dele (pelo CNPJ) ou, se
    // nenhuma bater, para a primeira; as outras acham o cliente pelo CNPJ/CPF.
    const escolhido = leitura.cliente_id
      ? (await db.from("clientes").select("id, documento").eq("id", leitura.cliente_id).maybeSingle()).data
      : null;
    const principal = Math.max(0, escolhido ? empresas.findIndex((g) => g.documento && mesmaEmpresa(g.documento, escolhido.documento)) : 0);
    const clientes: (string | null)[] = [];
    for (const [i, g] of empresas.entries()) {
      if (i === principal && escolhido) clientes.push(escolhido.id as string);
      else if (!g.documento) clientes.push(null);
      else {
        const { data: c } = await db.from("clientes").select("id").eq("documento", g.documento).limit(1).maybeSingle();
        clientes.push((c?.id as string | undefined) ?? null);
      }
    }
    const fichas = empresas.flatMap((g, i) => g.fichas.map((f) => ({ ficha: f, clienteId: clientes[i] })));

    // Sem competência informada: o mês com mais dias lidos.
    const contagem = new Map<string, number>();
    for (const { ficha } of fichas) for (const d of ficha.dias) contagem.set(d.data.slice(0, 7), (contagem.get(d.data.slice(0, 7)) ?? 0) + 1);
    const compFinal = competencia ?? [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];

    await salvarFichas(db, leituraId, fichas);

    const comIa = paraIa.length - falhasIa;
    const origem = [
      semIa && `${semIa} ${semIa === 1 ? "página lida" : "páginas lidas"} sem IA`,
      paraIa.length && fornecedor && `${comIa} com IA (${fornecedor === "groq" ? "Groq" : "Claude"})`,
      empresas.length > 1 && `${empresas.length} empresas diferentes: cada ficha ficou com a sua (confira o cliente de cada uma)`,
    ]
      .filter(Boolean)
      .join(" · ");
    const g0 = empresas[principal];
    await db
      .from("ponto_leituras")
      .update({
        status: "conferir",
        cliente_id: clientes[principal],
        competencia: `${compFinal}-01`,
        empresa_lida: g0.empresa,
        documento_lido: g0.documento,
        lida_em: new Date().toISOString(),
        mensagem: falhas.length ? `${origem}. Não lidas: ${falhas.join(" · ")}` : origem || null,
      })
      .eq("id", leituraId);
  } catch (e) {
    console.error("Leitura de ponto", leituraId, e);
    await falhar(e instanceof Error ? e.message : "Falha na leitura.");
  }
}

// Grava as fichas de uma leitura, cada uma com o seu cliente e ligada ao
// funcionário já cadastrado nele (CPF; senão nome igual). "Ler de novo" substitui.
async function salvarFichas(db: ReturnType<typeof createAdminClient>, leituraId: string, fichas: { ficha: FichaJunta; clienteId: string | null }[]) {
  const ids = [...new Set(fichas.map((f) => f.clienteId).filter((c): c is string => Boolean(c)))];
  const funcionarios = ids.length ? ((await db.from("ponto_funcionarios").select("id, nome, cpf, cliente_id").in("cliente_id", ids)).data ?? []) : [];
  const vinculo = (f: FichaJunta, clienteId: string | null) => {
    const doCliente = funcionarios.filter((x) => x.cliente_id === clienteId);
    return doCliente.find((x) => f.cpf && x.cpf === f.cpf)?.id ?? doCliente.find((x) => nomeComparavel(x.nome) === nomeComparavel(f.nome))?.id ?? null;
  };
  await db.from("ponto_fichas").delete().eq("leitura_id", leituraId);
  const { error } = await db.from("ponto_fichas").insert(
    fichas.map(({ ficha: f, clienteId }, i) => ({
      leitura_id: leituraId,
      cliente_id: clienteId,
      funcionario_id: vinculo(f, clienteId),
      ordem: i,
      nome: f.nome,
      cpf: f.cpf,
      cargo: f.cargo,
      admissao: f.admissao,
      jornada: f.jornada,
      dias: f.dias,
      totais_origem: f.totais_origem,
      observacoes: f.observacoes,
    })),
  );
  if (error) throw new Error(`Falha ao salvar as fichas: ${error.message}`);
}
