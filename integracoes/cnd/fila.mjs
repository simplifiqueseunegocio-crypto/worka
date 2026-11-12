// Acesso à fila de CND da plataforma pela linha de comando, para as tarefas
// agendadas do Claude (rotina-lotes.md). Usa API_URL e CND_WORKER_TOKEN do
// worker.config.
//
// Uso:
//   node fila.mjs pendentes <tipo> [origem]
//       só conta, sem reservar (não gasta tentativa): imprime o número de
//       consultas do tipo que podem ser reservadas agora
//   node fila.mjs reservar <tipo> [limite] [origem] [--salvar arquivo.json]
//       reserva até [limite] consultas do tipo (padrão 10) e imprime JSON;
//       [origem] = manual (pedidos feitos na tela) ou agendada (rodada do dia 23):
//       [{ "id": 1, "documento": "54635227000132", "razao_social": "..." }]
//       --salvar também grava esse JSON no arquivo (para o `enviar`)
//   node fila.mjs enviar <resultados.json> <reservados.json>
//       grava de uma vez o que um script de lote leu ({ "resultados": [{ id,
//       status, mensagem, repetir }] }). Reservado que não está nos resultados
//       (o lote parou antes dele) volta à fila sem gastar tentativa.
//       Imprime o resumo: { consultados, regular, pendente, erro, repetir,
//       devolvidas, pendentes: [nomes] }
//   node fila.mjs resultado <id> <regular|pendente|erro> [mensagem]
//       devolve o resultado de uma consulta reservada
//   node fila.mjs repetir <id> [mensagem]
//       erro temporário: devolve a consulta para a fila (até 3 tentativas)
//   node fila.mjs gravar <tipo> <situacao.json> [origem]
//       reserva lotes do tipo até a fila esvaziar e grava cada consulta pela
//       situação já lida do site (sem navegador por cliente). O arquivo:
//       { "regular": ["documento", ...],
//         "pendente": { "documento": "mensagem" },
//         "repetir": { "documento": "mensagem" },
//         "ausente": ["erro", "mensagem"] }   (documento que não está no arquivo)
//       Imprime o resumo: { regular, pendente, erro, repetir, pendentes: [nomes] }
//
//   --municipio UF/NOME (em pendentes, reservar e gravar): só clientes desse
//       município, ex.: --municipio "SP/JACI". Obrigatório para reservar a
//       municipal: cada prefeitura tem a sua rotina e o seu script, e uma
//       rotina nunca deve pegar (nem marcar como erro) cliente de outra. No
//       gravar municipal, sem a opção, vale Rio Preto (ISS Digital).

import { readFileSync, writeFileSync } from "node:fs";
import { api, contar, enviar, lerConfiguracao, reservar } from "./fila-api.mjs";

// Situação de cada consulta pelo documento (só dígitos) a partir do arquivo de gravar.
function situacaoDe(situacao, documento) {
  const doc = String(documento ?? "").replace(/\D/g, "");
  if ((situacao.regular ?? []).includes(doc)) return { status: "regular", mensagem: null, repetir: false };
  if (situacao.pendente?.[doc]) return { status: "pendente", mensagem: situacao.pendente[doc], repetir: false };
  if (situacao.repetir?.[doc]) return { status: "erro", mensagem: situacao.repetir[doc], repetir: true };
  const [status = "erro", mensagem = "Documento fora da lista lida do site"] = situacao.ausente ?? [];
  return { status, mensagem, repetir: false };
}

// --municipio "UF/NOME" → { uf, municipio } (tira a opção de args).
function tirarMunicipio(args) {
  const i = args.indexOf("--municipio");
  if (i < 0) return {};
  const valor = args.splice(i, 2)[1] ?? "";
  const m = /^\s*([A-Za-z]{2})\s*\/\s*(.{2,})$/.exec(valor);
  if (!m) throw new Error(`--municipio deve ser UF/NOME, ex.: "SP/JACI" (veio "${valor}")`);
  return { uf: m[1].toUpperCase(), municipio: m[2].trim() };
}

function exigirMunicipio(tipo, lugar) {
  if (tipo === "municipal" && !lugar.municipio) {
    throw new Error('A municipal é por cidade: informe --municipio UF/NOME (ex.: --municipio "SP/SAO JOSE DO RIO PRETO").');
  }
}

async function gravar(cfg, tipo, situacao, origem, lugar) {
  const resumo = { regular: 0, pendente: 0, erro: 0, repetir: 0, pendentes: [] };
  // Consulta devolvida com repetir só volta à fila 1 hora depois, então o laço termina.
  for (;;) {
    const consultas = await reservar(cfg, { tipo, limite: 50, origem, ...lugar });
    if (!consultas.length) break;
    const resultados = consultas.map((c) => {
      const r = situacaoDe(situacao, c.documento);
      if (r.repetir) resumo.repetir++;
      else resumo[r.status]++;
      if (r.status === "pendente") resumo.pendentes.push(c.razao_social);
      return { id: c.id, ...r };
    });
    await api(cfg, "/api/integracoes/cnd/resultados", { resultados });
  }
  return resumo;
}

const [comando, ...args] = process.argv.slice(2);
try {
  const cfg = lerConfiguracao();
  const lugar = tirarMunicipio(args);
  if (comando === "pendentes") {
    const [tipo, origem] = args;
    if (!tipo) throw new Error("Uso: node fila.mjs pendentes <tipo> [origem] [--municipio UF/NOME]");
    console.log(await contar(cfg, tipo, origem, lugar));
  } else if (comando === "reservar") {
    const i = args.indexOf("--salvar");
    const salvar = i >= 0 ? args.splice(i, 2)[1] : null;
    const [tipo, limite = "10", origem] = args;
    if (!tipo) throw new Error("Uso: node fila.mjs reservar <tipo> [limite] [origem] [--salvar arquivo.json] [--municipio UF/NOME]");
    exigirMunicipio(tipo, lugar);
    const consultas = await reservar(cfg, { tipo, limite: Number(limite), origem, ...lugar });
    const lista = JSON.stringify(consultas.map(({ id, documento, razao_social }) => ({ id, documento, razao_social })));
    if (salvar) writeFileSync(salvar, lista);
    console.log(lista);
  } else if (comando === "enviar") {
    const [arquivo, reservados] = args;
    if (!arquivo || !reservados) throw new Error("Uso: node fila.mjs enviar <resultados.json> <reservados.json>");
    const lido = JSON.parse(readFileSync(arquivo, "utf8"));
    const resumo = await enviar(cfg, lido.resultados ?? [], JSON.parse(readFileSync(reservados, "utf8")));
    console.log(JSON.stringify({ ...resumo, parar: lido.parar ?? "" }));
  } else if (comando === "resultado" || comando === "repetir") {
    const [id, ...resto] = args;
    const status = comando === "repetir" ? "erro" : resto.shift();
    const mensagem = resto.join(" ") || null;
    if (!/^\d+$/.test(id ?? "") || !["regular", "pendente", "erro"].includes(status)) {
      throw new Error("Uso: node fila.mjs resultado <id> <regular|pendente|erro> [mensagem]  ou  repetir <id> [mensagem]");
    }
    const r = await api(cfg, "/api/integracoes/cnd/resultados", {
      resultados: [{ id: Number(id), status, mensagem, repetir: comando === "repetir" }],
    });
    console.log(JSON.stringify(r));
  } else if (comando === "gravar") {
    const [tipo, arquivo, origem] = args;
    if (!tipo || !arquivo) throw new Error("Uso: node fila.mjs gravar <tipo> <situacao.json> [origem] [--municipio UF/NOME]");
    // O gravar municipal é o da leitura em lote do ISS Digital de Rio Preto: sem
    // --municipio, fica em Rio Preto (as tarefas agendadas antigas não passam a cidade).
    const onde = tipo === "municipal" && !lugar.municipio ? { uf: "SP", municipio: "SAO JOSE DO RIO PRETO" } : lugar;
    console.log(JSON.stringify(await gravar(cfg, tipo, JSON.parse(readFileSync(arquivo, "utf8")), origem, onde)));
  } else {
    throw new Error("Comandos: pendentes, reservar, resultado, repetir, gravar, enviar (veja o início de fila.mjs).");
  }
} catch (e) {
  console.error(`ERRO: ${e.message}`);
  process.exitCode = 1;
}
