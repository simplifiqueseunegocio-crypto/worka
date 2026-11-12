// Robô da CND municipal nas prefeituras com o SIA da Fiorilli, sem o Claude.
// Roda no servidor do escritório, agendado no Windows (instalar-robo-sia.bat).
//
// Para cada cidade de sia-cidades.json com clientes na fila municipal: reserva
// lotes de 25 só dessa cidade, abre o portal num Chromium sem janela
// (Playwright), executa o mesmo sia-fiorilli-situacao.js da rotina manual e
// grava o resultado na plataforma. O portal é público: sem login, sem captcha.
// Captcha ou módulo ausente param a cidade (o robô não tenta contornar).
//
// Uso:
//   node robo-sia.mjs                         todas as cidades com fila
//   node robo-sia.mjs --cidade "SP/JACI"      só uma cidade
//   node robo-sia.mjs --simular "SP/JACI" <CPF/CNPJ> [...]
//       consulta os documentos e imprime o resultado, sem reservar nem gravar
//
// Log: logs/robo-sia/AAAA-MM-DD.log (30 dias).

import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { comparavel, contar, enviar, lerConfiguracao, reservar } from "./fila-api.mjs";

const pasta = import.meta.dirname;
// O Chromium fica dentro de node_modules (npm run instalar-navegador), para a
// tarefa do Windows rodar como SYSTEM sem depender do perfil de quem instalou.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("playwright");
const LOTE = 25;
const TETO_LOTES = 20; // por cidade e execução (500 clientes)
// A reserva expira em 15 minutos: o lote precisa terminar antes.
const TEMPO_LOTE = 12 * 60_000;
const SCRIPT = readFileSync(join(pasta, "sia-fiorilli-situacao.js"), "utf8");
const CIDADES = JSON.parse(readFileSync(join(pasta, "sia-cidades.json"), "utf8"));

const pastaLog = join(pasta, "logs", "robo-sia");
mkdirSync(pastaLog, { recursive: true });
const hoje = new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD
for (const f of readdirSync(pastaLog)) {
  const d = /^(\d{4}-\d{2}-\d{2})\.log$/.exec(f)?.[1];
  if (d && Date.now() - new Date(d).getTime() > 30 * 86400_000) rmSync(join(pastaLog, f));
}
function log(msg) {
  const linha = `${new Date().toLocaleString("pt-BR")} ${msg}`;
  console.log(linha);
  appendFileSync(join(pastaLog, `${hoje}.log`), linha + "\n");
}

function acharCidade(valor) {
  const m = /^\s*([A-Za-z]{2})\s*\/\s*(.+)$/.exec(valor ?? "");
  const cidade = m && CIDADES.find((c) => c.uf === m[1].toUpperCase() && comparavel(c.municipio) === comparavel(m[2]));
  if (!cidade) throw new Error(`Cidade "${valor}" não está em sia-cidades.json (use UF/NOME, ex.: "SP/JACI").`);
  return cidade;
}

// Executa o script de lote no portal da cidade e devolve { resultados, parar }.
async function consultarLote(navegador, cidade, lista) {
  const contexto = await navegador.newContext({ locale: "pt-BR" });
  try {
    const pagina = await contexto.newPage();
    try {
      await pagina.goto(cidade.url, { waitUntil: "load", timeout: 60_000 });
    } catch (e) {
      return { resultados: [], parar: `portal não abriu (${e.message.split("\n")[0]})` };
    }
    await pagina.evaluate((l) => { window.__lista = l; }, lista);
    await pagina.evaluate(SCRIPT);
    const inicio = Date.now();
    for (;;) {
      await pagina.waitForTimeout(3000);
      const c = await pagina.evaluate(() => {
        const s = window.__cnd;
        return { out: s.out, erro: s.erro, parcial: s.parcial ?? [] };
      });
      if (c.out) return c.out;
      if (c.erro) return { resultados: c.parcial, parar: `erro no script: ${c.erro}` };
      if (Date.now() - inicio > TEMPO_LOTE) return { resultados: c.parcial, parar: "lote passou de 12 minutos" };
    }
  } finally {
    await contexto.close();
  }
}

async function processarCidade(cfg, navegador, cidade) {
  const lugar = { uf: cidade.uf, municipio: cidade.municipio };
  const nome = `${cidade.municipio}-${cidade.uf}`;
  if (!(await contar(cfg, "municipal", null, lugar))) return null;
  const total = { consultados: 0, regular: 0, pendente: 0, erro: 0, repetir: 0, devolvidas: 0 };
  for (let n = 0; n < TETO_LOTES; n++) {
    const reservados = await reservar(cfg, { tipo: "municipal", limite: LOTE, ...lugar });
    if (!reservados.length) break;
    const lista = reservados.map(({ id, documento, razao_social }) => ({ id, documento, razao_social }));
    const lido = await consultarLote(navegador, cidade, lista);
    const r = await enviar(cfg, lido.resultados ?? [], reservados);
    for (const k of Object.keys(total)) total[k] += r[k];
    log(`${nome}: lote ${n + 1} · ${JSON.stringify({ ...r, pendentes: undefined })}${r.pendentes.length ? ` · pendentes: ${r.pendentes.join("; ")}` : ""}`);
    if (lido.parar) {
      log(`${nome}: parou (${lido.parar}); o restante fica para a próxima execução`);
      return { ...total, parou: lido.parar };
    }
  }
  return total;
}

async function simular(navegador, cidade, documentos) {
  const lista = documentos.map((d, i) => ({ id: i + 1, documento: d.replace(/\D/g, ""), razao_social: d }));
  const lido = await consultarLote(navegador, cidade, lista);
  for (const r of lido.resultados ?? []) {
    console.log(`${lista[r.id - 1].documento}: ${r.status}${r.repetir ? " (repetir)" : ""}${r.mensagem ? ` · ${r.mensagem}` : ""}`);
  }
  if (lido.parar) console.log(`parou: ${lido.parar}`);
}

const args = process.argv.slice(2);
const execucao = { inicio: new Date().toISOString(), usuario: userInfo().username, args, cidades: {} };
let navegador;
try {
  navegador = await chromium.launch({ headless: true });
  const iSim = args.indexOf("--simular");
  if (iSim >= 0) {
    await simular(navegador, acharCidade(args[iSim + 1]), args.slice(iSim + 2));
  } else {
    const cfg = lerConfiguracao();
    const iCid = args.indexOf("--cidade");
    const cidades = iCid >= 0 ? [acharCidade(args[iCid + 1])] : CIDADES;
    let falhou = false;
    for (const cidade of cidades) {
      try {
        const r = await processarCidade(cfg, navegador, cidade);
        execucao.cidades[cidade.municipio] = r ?? "sem fila";
        if (r) log(`${cidade.municipio}-${cidade.uf}: total ${JSON.stringify(r)}`);
      } catch (e) {
        falhou = true;
        execucao.cidades[cidade.municipio] = `ERRO ${e.message}`;
        log(`${cidade.municipio}-${cidade.uf}: ERRO ${e.message}`);
      }
    }
    if (falhou) process.exitCode = 1;
  }
} catch (e) {
  execucao.erro = e.message;
  log(`ERRO ${e.message}`);
  process.exitCode = 1;
} finally {
  await navegador?.close();
  // Sinal de vida: a tarefa do Windows roda a cada 30 minutos e, com a fila
  // vazia, não escreve no log. Este arquivo mostra a última execução.
  execucao.fim = new Date().toISOString();
  execucao.codigo = process.exitCode ?? 0;
  try {
    writeFileSync(join(pastaLog, "ultima-execucao.json"), JSON.stringify(execucao, null, 2));
  } catch {}
}
