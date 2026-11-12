import { criarBanco, criarVerificador } from "./_setup.mjs";

const db = await criarBanco();
const { check, placar } = criarVerificador();
console.log("migrations aplicadas");

const A = "a0000000-0000-0000-0000-00000000000a";
await db.exec(`insert into public.clientes (id, documento, razao_social, regime, status, busca_cnd)
  values ('${A}', '11111111000111', 'Cliente A', 'simples', 'ativo', true)`);

// Simula o ciclo do worker: entra na fila, é reservada e recebe o resultado.
let minuto = 0;
async function consultar(tipo, status, mensagem = null) {
  minuto++;
  const id = (await db.query(`insert into public.cnd_consultas (cliente_id, tipo) values ('${A}', '${tipo}') returning id`)).rows[0].id;
  await db.query(`update public.cnd_consultas set status = 'processando', iniciada_em = now() where id = ${id}`);
  await db.query(
    `update public.cnd_consultas set status = $1, processada_em = '2026-11-01'::timestamptz + make_interval(mins => $2), mensagem = $3 where id = $4`,
    [status, minuto, mensagem, id],
  );
  return id;
}
const alertas = async () =>
  (await db.query(`select tipo, de, para, mensagem from public.cnd_alertas order by id`)).rows;

await consultar("federal", "regular");
check("primeira consulta não gera alerta", (await alertas()).length === 0);

await consultar("federal", "regular");
check("mesmo resultado não gera alerta", (await alertas()).length === 0);

await consultar("federal", "erro");
check("erro não gera alerta", (await alertas()).length === 0);

const idPendente = await consultar("federal", "pendente", "Débito de IRPJ");
let a = await alertas();
check("regular → pendente gera alerta", a.length === 1 && a[0].de === "regular" && a[0].para === "pendente", JSON.stringify(a));
check("alerta guarda a mensagem da consulta", a[0]?.mensagem === "Débito de IRPJ");

await consultar("fgts", "pendente");
check("outra certidão é comparada só com ela mesma", (await alertas()).length === 1);

await consultar("federal", "regular");
a = await alertas();
check("pendente → regular gera alerta", a.length === 2 && a[1].de === "pendente" && a[1].para === "regular");

// Regravar o mesmo status não duplica
await db.query(`update public.cnd_consultas set status = 'pendente' where id = ${idPendente}`);
check("regravar a mesma consulta não duplica o alerta", (await db.query(`select count(*)::int n from public.cnd_alertas where consulta_id = ${idPendente}`)).rows[0].n === 1);

console.log(`\n${placar.ok} ok, ${placar.falhas} falhas`);
process.exit(placar.falhas ? 1 : 0);
