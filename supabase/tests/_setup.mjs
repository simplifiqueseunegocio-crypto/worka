import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";

// Simula o mínimo do Supabase (roles e schema auth) e aplica as migrations em
// ordem. As que dependem de extensões do Supabase (pg_cron) ficam de fora.
const stub = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export async function criarBanco() {
  const db = new PGlite();
  await db.exec(stub);
  const dir = new URL("../migrations/", import.meta.url);
  for (const arquivo of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (arquivo.includes("_cron_")) continue; // pg_cron só existe no Supabase
    await db.exec(readFileSync(new URL(arquivo, dir), "utf8"));
  }
  return db;
}

export function criarVerificador() {
  const placar = { ok: 0, falhas: 0 };
  const check = (nome, cond, extra = "") => {
    if (cond) { placar.ok++; console.log("  ok  ", nome); }
    else { placar.falhas++; console.log("  FALHA", nome, extra); }
  };
  return { check, placar };
}

export async function erro(fn) {
  try { await fn(); return null; } catch (e) { return e.message; }
}
