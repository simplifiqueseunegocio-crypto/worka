import { criarBanco, criarVerificador } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const A = "a0000000-0000-0000-0000-00000000000a"; // sai do Domínio
const B = "b0000000-0000-0000-0000-00000000000b"; // suspenso pela equipe
const M = "d0000000-0000-0000-0000-00000000000d"; // sem código do Domínio

await db.exec(`insert into public.clientes (id, documento, razao_social, regime, codigo_dominio, status) values
  ('${A}', '11111111000111', 'Cliente A', 'simples', 10, 'ativo'),
  ('${B}', '22222222000122', 'Cliente B', 'simples', 20, 'ativo');
  insert into public.clientes (id, documento, razao_social, regime, status) values
  ('${M}', '33333333000133', 'Cliente M', 'simples', 'ativo');`);

const dep = (await db.query(`select id from public.departamentos where nome = 'Fiscal'`)).rows[0].id;
const status = ["pendente", "em_andamento", "aguardando_cliente", "concluida", "dispensada"];
for (const [i, s] of status.entries()) {
  const o = (await db.query(`insert into public.obrigacoes (nome, departamento_id, dia_vencimento, regimes)
    values ('O${i}', ${dep}, 20, '{simples}') returning id`)).rows[0].id;
  for (const c of [A, B, M]) {
    await db.query(`insert into public.tarefas (cliente_id, obrigacao_id, departamento_id, competencia, prazo_legal, prazo_meta, status, observacao)
      values ('${c}', ${o}, ${dep}, '2026-10-01', '2026-11-20', '2026-11-18', '${s}', ${s === "dispensada" ? "'x'" : "null"})`);
  }
}
const restantes = async (c) =>
  (await db.query(`select status from public.tarefas where cliente_id = '${c}' order by status`)).rows.map((r) => r.status).join();

// Sincronização: A não veio mais (suspenso, sem status manual)
await db.exec(`update public.clientes set status = 'suspenso' where id = '${A}'`);
check("saiu do Domínio: sobram só concluída e dispensada", (await restantes(A)) === "concluida,dispensada", await restantes(A));

// Equipe suspende B pela tela: nada é apagado
await db.exec(`update public.clientes set status = 'suspenso', status_manual = true, status_alterado_em = now() where id = '${B}'`);
check("suspenso pela equipe mantém as tarefas", (await restantes(B)).split(",").length === 5);

// Cliente sem código do Domínio: nada é apagado
await db.exec(`update public.clientes set status = 'encerrado' where id = '${M}'`);
check("cliente sem código do Domínio mantém as tarefas", (await restantes(M)).split(",").length === 5);

// Volta ao Domínio: nada é recriado
await db.exec(`update public.clientes set status = 'ativo' where id = '${A}'`);
check("ao voltar, nada é recriado", (await restantes(A)) === "concluida,dispensada");

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
