// Funções da fila de CND da plataforma, usadas pelo fila.mjs (tarefas do
// Claude) e pelo robo-sia.mjs (robô sem Claude). Lê API_URL e CND_WORKER_TOKEN
// do worker.config desta pasta.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pasta = import.meta.dirname;

export function lerConfiguracao() {
  const caminho = join(pasta, "worker.config");
  if (!existsSync(caminho)) throw new Error(`Configuração não encontrada: ${caminho} (copie de worker.config.example).`);
  const cfg = {};
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) cfg[m[1]] = m[2];
  }
  for (const chave of ["API_URL", "CND_WORKER_TOKEN"]) {
    if (!cfg[chave]) throw new Error(`Configuração '${chave}' está vazia em worker.config.`);
  }
  return cfg;
}

export async function api(cfg, caminho, corpo) {
  const resposta = await fetch(`${cfg.API_URL.replace(/\/$/, "")}${caminho}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.CND_WORKER_TOKEN}`,
      "Content-Type": "application/json",
      "X-Origem": "rotina-cnd",
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(60_000),
  });
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`${caminho} respondeu ${resposta.status}: ${json.erro ?? "sem detalhes"}`);
  return json;
}

export const comparavel = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

// Quantas consultas do tipo podem ser reservadas agora (sem reservar).
export async function contar(cfg, tipo, origem, lugar = {}) {
  const { pendentes } = await api(cfg, "/api/integracoes/cnd/pendentes", lugar);
  const porOrigem = pendentes[tipo] ?? {};
  return origem ? (porOrigem[origem] ?? 0) : Object.values(porOrigem).reduce((a, b) => a + b, 0);
}

// Reserva e confere que a API respeitou o município (uma versão antiga da API
// ignora o filtro): o que vier de outro lugar volta para a fila sem gastar tentativa.
export async function reservar(cfg, corpo) {
  const { consultas } = await api(cfg, "/api/integracoes/cnd/reservar", corpo);
  if (!corpo.municipio) return consultas;
  const fora = consultas.filter((c) => comparavel(c.municipio) !== comparavel(corpo.municipio) || c.uf !== corpo.uf);
  if (fora.length) {
    await api(cfg, "/api/integracoes/cnd/resultados", {
      resultados: consultas.map((c) => ({ id: c.id, status: "erro", mensagem: "Reservada fora do município pedido", repetir: true, devolver: true })),
    });
    throw new Error(`A API devolveu ${fora.length} consulta(s) de outro município (versão antiga da plataforma?). Todas voltaram para a fila.`);
  }
  return consultas;
}

// Grava o que um script de lote leu. Reservado que não está nos resultados (o
// lote parou antes dele) volta à fila sem gastar tentativa.
export async function enviar(cfg, resultados, reservados) {
  const porId = new Map(reservados.map((c) => [c.id, c]));
  const lidos = resultados.filter((r) => porId.has(r.id));
  const lidosIds = new Set(lidos.map((r) => r.id));
  const devolver = reservados
    .filter((c) => !lidosIds.has(c.id))
    .map((c) => ({ id: c.id, status: "erro", mensagem: "Não consultado: o lote parou antes", repetir: true, devolver: true }));
  const resumo = { consultados: lidos.length, regular: 0, pendente: 0, erro: 0, repetir: 0, devolvidas: devolver.length, pendentes: [] };
  for (const r of lidos) {
    if (r.repetir) resumo.repetir++;
    else resumo[r.status]++;
    if (r.status === "pendente") resumo.pendentes.push(porId.get(r.id).razao_social);
  }
  const todos = [...lidos, ...devolver];
  for (let i = 0; i < todos.length; i += 200) {
    await api(cfg, "/api/integracoes/cnd/resultados", { resultados: todos.slice(i, i + 200) });
  }
  return resumo;
}
