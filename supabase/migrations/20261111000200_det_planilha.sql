-- Robô do DET: a lista de empresas vem de uma planilha (Fechamento Mensal,
-- abas "Sem Variaveis" e "Com Variaveis", com AP, Empresa e CNPJ), enviada
-- pela tela do robô. Cada linha é casada com o cliente da plataforma pelo
-- CNPJ/CPF; as que não casam (CNPJ incompleto, inválido ou não cadastrado)
-- ficam como pendência e não entram na fila.
--
-- Sem planilha enviada, a fila continua sendo os clientes ativos.
-- Também: botão "Iniciar" (enfileirar_det, gestor ou admin).

create table public.det_planilhas (
  id uuid primary key default gen_random_uuid(),
  arquivo_nome text not null,
  linhas integer not null,
  validas integer not null,
  enviada_por uuid references public.profiles (id) on delete set null default auth.uid(),
  enviada_em timestamptz not null default now()
);

create table public.det_empresas (
  id bigint generated always as identity primary key,
  planilha_id uuid not null references public.det_planilhas (id) on delete cascade,
  aba_origem text,
  codigo text,            -- AP (código no Domínio), como veio na planilha
  empresa text not null,
  documento text,         -- só dígitos
  cliente_id uuid references public.clientes (id) on delete set null,
  problema text           -- por que não entra na fila (null = ok)
);
create index on public.det_empresas (planilha_id);
create index on public.det_empresas (cliente_id);

alter table public.det_planilhas enable row level security;
alter table public.det_empresas enable row level security;
create policy leitura on public.det_planilhas for select to authenticated using (public.is_ativo());
create policy leitura on public.det_empresas for select to authenticated using (public.is_ativo());
create policy envio on public.det_planilhas for insert to authenticated
  with check (public.is_gestor_ou_admin() and enviada_por = auth.uid());
create policy exclusao on public.det_planilhas for delete to authenticated using (public.is_gestor_ou_admin());
create policy envio on public.det_empresas for insert to authenticated with check (public.is_gestor_ou_admin());

-- Planilha atual: a mais recente.
create function public.det_planilha_atual()
returns uuid
language sql stable security invoker set search_path = ''
as $$ select id from public.det_planilhas order by enviada_em desc, id limit 1 $$;

-- Fila: as empresas da planilha atual casadas com clientes; sem planilha, os
-- clientes ativos (como antes).
create or replace function public.enfileirar_det_interno(p_cliente_id uuid default null, p_origem text default 'agendada')
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  planilha uuid := (select id from public.det_planilhas order by enviada_em desc, id limit 1);
  qtd integer;
begin
  insert into public.det_consultas (cliente_id, competencia, origem)
  select distinct c.id, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, p_origem
  from public.clientes c
  where (p_cliente_id is null or c.id = p_cliente_id)
    and case
          when planilha is null then c.status = 'ativo'
          else exists (
            select 1 from public.det_empresas e
            where e.planilha_id = planilha and e.cliente_id = c.id and e.problema is null
          )
        end
  on conflict (cliente_id) where status in ('na_fila', 'processando') do nothing;
  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

revoke execute on function public.enfileirar_det_interno(uuid, text) from public, anon, authenticated;

-- Botão "Iniciar" da tela do robô: só gestor ou admin.
create function public.enfileirar_det()
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_gestor_ou_admin() then
    raise exception 'Apenas admin ou gestor inicia o robô do DET' using errcode = '42501';
  end if;
  return public.enfileirar_det_interno(null, 'manual');
end;
$$;

-- Painel: acrescenta a aba de origem da planilha atual.
create or replace view public.det_painel with (security_invoker = true) as
with ultima as (
  select distinct on (q.cliente_id)
    q.cliente_id, q.id as consulta_id, q.competencia, q.status, q.processada_em, q.mensagem,
    q.avisos, q.nao_lidas, q.avisos_consignado
  from public.det_consultas q
  where q.status in ('concluida', 'sem_procuracao', 'erro')
  order by q.cliente_id, q.processada_em desc, q.id desc
),
consignado as (
  select a.cliente_id, max(a.enviada_em) as ultimo_aviso
  from public.det_avisos a
  where a.consignado
  group by a.cliente_id
),
origem as (
  select distinct on (e.cliente_id) e.cliente_id, e.aba_origem
  from public.det_empresas e
  where e.planilha_id = public.det_planilha_atual() and e.cliente_id is not null
  order by e.cliente_id, e.id
)
select
  c.id as cliente_id,
  c.codigo_dominio,
  c.razao_social,
  c.fantasia,
  c.documento,
  c.tipo_inscricao,
  u.consulta_id,
  u.competencia,
  u.status,
  u.processada_em,
  u.mensagem,
  u.avisos,
  u.nao_lidas,
  u.avisos_consignado,
  k.ultimo_aviso,
  k.ultimo_aviso is not null as tem_consignado,
  coalesce(date_trunc('month', k.ultimo_aviso)::date = u.competencia, false) as no_ciclo,
  o.aba_origem
from ultima u
join public.clientes c on c.id = u.cliente_id
left join consignado k on k.cliente_id = u.cliente_id
left join origem o on o.cliente_id = u.cliente_id;
