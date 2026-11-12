-- Certidões negativas de débito (CND): situação de regularidade dos clientes.
--
-- A plataforma só aponta quem está regular e quem tem pendência; a emissão da
-- certidão continua com a equipe. As consultas entram numa fila (cnd_consultas)
-- consumida pelo worker que roda no servidor do escritório
-- (integracoes/cnd), pela API /api/integracoes/cnd/*.
-- Só entram na fila os clientes ativos com busca_cnd ligada.

-- ============================================================================
-- Tipos e campos
-- ============================================================================

create type public.cnd_tipo as enum ('federal', 'fgts', 'trabalhista', 'estadual', 'municipal');

-- na_fila → processando → regular | pendente | erro
create type public.cnd_status as enum ('na_fila', 'processando', 'regular', 'pendente', 'erro');

alter table public.clientes add column busca_cnd boolean not null default false;

-- ============================================================================
-- Fila e histórico de consultas
-- ============================================================================

create table public.cnd_consultas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo public.cnd_tipo not null,
  status public.cnd_status not null default 'na_fila',
  origem text not null default 'agendada',     -- agendada | manual
  solicitada_por uuid references public.profiles (id) on delete set null,
  solicitada_em timestamptz not null default now(),
  iniciada_em timestamptz,
  processada_em timestamptz,
  tentativas smallint not null default 0,
  mensagem text,
  detalhes jsonb
);

-- No máximo uma consulta em aberto por cliente e certidão: enfileirar de novo não duplica.
create unique index cnd_consultas_em_aberto
  on public.cnd_consultas (cliente_id, tipo) where status in ('na_fila', 'processando');
create index on public.cnd_consultas (cliente_id, tipo, processada_em desc)
  where status in ('regular', 'pendente', 'erro');
create index on public.cnd_consultas (solicitada_em) where status in ('na_fila', 'processando');

-- ============================================================================
-- Painel: um registro por cliente com a última situação de cada certidão
-- ============================================================================

create view public.cnd_painel with (security_invoker = true) as
with ultima as (
  select distinct on (cliente_id, tipo) cliente_id, tipo, status, processada_em, mensagem
  from public.cnd_consultas
  where status in ('regular', 'pendente', 'erro')
  order by cliente_id, tipo, processada_em desc
),
por_cliente as (
  select
    cliente_id,
    max(status::text) filter (where tipo = 'federal') as federal,
    max(status::text) filter (where tipo = 'fgts') as fgts,
    max(status::text) filter (where tipo = 'trabalhista') as trabalhista,
    max(status::text) filter (where tipo = 'estadual') as estadual,
    max(status::text) filter (where tipo = 'municipal') as municipal,
    count(*) filter (where status = 'pendente') as pendencias,
    count(*) filter (where status = 'erro') as erros,
    count(*) filter (where status = 'regular') as regulares,
    max(processada_em) as consultado_em,
    jsonb_object_agg(tipo, mensagem) filter (where mensagem is not null) as mensagens
  from ultima
  group by cliente_id
)
select
  c.id as cliente_id,
  c.codigo_dominio,
  c.tipo_inscricao,
  c.documento,
  c.razao_social,
  c.fantasia,
  c.uf,
  c.codigo_municipio,
  c.status as cliente_status,
  c.busca_cnd,
  p.federal, p.fgts, p.trabalhista, p.estadual, p.municipal,
  coalesce(p.pendencias, 0)::int as pendencias,
  coalesce(p.erros, 0)::int as erros,
  p.consultado_em,
  p.mensagens,
  exists (
    select 1 from public.cnd_consultas f
    where f.cliente_id = c.id and f.status in ('na_fila', 'processando')
  ) as na_fila,
  case
    when coalesce(p.pendencias, 0) > 0 then 'pendente'
    when coalesce(p.erros, 0) > 0 then 'erro'
    when coalesce(p.regulares, 0) > 0 then 'regular'
    else 'sem_consulta'
  end as situacao
from public.clientes c
left join por_cliente p on p.cliente_id = c.id
where c.busca_cnd or p.cliente_id is not null;

-- ============================================================================
-- Enfileiramento
-- ============================================================================

-- Interna: sem checagem de permissão. Usada pelo cron e pela função pública.
-- p_cliente_id nulo = toda a carteira com busca_cnd ligada.
create function public.enfileirar_cnd_interno(
  p_cliente_id uuid default null,
  p_origem text default 'agendada',
  p_solicitante uuid default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  qtd integer;
begin
  insert into public.cnd_consultas (cliente_id, tipo, origem, solicitada_por)
  select c.id, t.tipo, p_origem, p_solicitante
  from public.clientes c
  cross join unnest(enum_range(null::public.cnd_tipo)) as t (tipo)
  where c.status = 'ativo'
    and c.busca_cnd
    and (p_cliente_id is null or c.id = p_cliente_id)
  on conflict (cliente_id, tipo) where status in ('na_fila', 'processando') do nothing;

  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

-- Pública (RPC): um cliente, qualquer usuário ativo; a carteira toda, só admin e gestor.
create function public.enfileirar_cnd(p_cliente_id uuid default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if p_cliente_id is null and not public.is_gestor_ou_admin() then
    raise exception 'Apenas admin ou gestor pode consultar a carteira inteira' using errcode = '42501';
  end if;
  if not public.is_ativo() then
    raise exception 'Usuário sem acesso' using errcode = '42501';
  end if;
  return public.enfileirar_cnd_interno(p_cliente_id, 'manual', auth.uid());
end;
$$;

-- ============================================================================
-- Worker: reserva um lote da fila
-- ============================================================================

-- Marca até p_limite consultas como 'processando' e devolve com os dados do
-- cliente. Consultas presas em 'processando' há mais de 15 minutos (worker
-- que caiu no meio) voltam a ser reservadas. skip locked: dois workers ao
-- mesmo tempo não pegam a mesma consulta.
create function public.reservar_cnd(p_limite integer default 10)
returns table (
  id bigint,
  tipo public.cnd_tipo,
  tentativas smallint,
  cliente_id uuid,
  documento text,
  tipo_inscricao smallint,
  razao_social text,
  uf char(2),
  codigo_municipio integer,
  inscricao_estadual text,
  inscricao_municipal text
)
language sql security definer set search_path = ''
as $$
  with lote as (
    select q.id
    from public.cnd_consultas q
    where q.status = 'na_fila'
       or (q.status = 'processando' and q.iniciada_em < now() - interval '15 minutes')
    order by q.solicitada_em, q.id
    limit p_limite
    for update skip locked
  ),
  reservadas as (
    update public.cnd_consultas q
    set status = 'processando', iniciada_em = now(), tentativas = q.tentativas + 1
    from lote
    where q.id = lote.id
    returning q.id, q.tipo, q.tentativas, q.cliente_id
  )
  select r.id, r.tipo, r.tentativas, c.id, c.documento, c.tipo_inscricao, c.razao_social,
         c.uf, c.codigo_municipio, c.inscricao_estadual, c.inscricao_municipal
  from reservadas r
  join public.clientes c on c.id = r.cliente_id
$$;

-- ============================================================================
-- Worker: devolve os resultados
-- ============================================================================

-- p_resultados: [{ id, status: regular|pendente|erro, mensagem?, detalhes?, repetir? }]
-- Só altera consultas em 'processando'. Erro com repetir = true (site fora do
-- ar, tempo esgotado) volta para a fila enquanto houver tentativas (máx. 3).
create function public.registrar_cnd_resultados(p_resultados jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  qtd_gravadas integer;
  qtd_repetir integer;
begin
  with r as (
    select *
    from jsonb_to_recordset(p_resultados) as x(
      id bigint, status text, mensagem text, detalhes jsonb, repetir boolean
    )
    where x.status in ('regular', 'pendente', 'erro')
  ),
  alteradas as (
    update public.cnd_consultas q
    set status = case
          when r.status = 'erro' and coalesce(r.repetir, false) and q.tentativas < 3 then 'na_fila'
          else r.status
        end::public.cnd_status,
        processada_em = case
          when r.status = 'erro' and coalesce(r.repetir, false) and q.tentativas < 3 then null
          else now()
        end,
        mensagem = left(r.mensagem, 2000),
        detalhes = r.detalhes
    from r
    where q.id = r.id and q.status = 'processando'
    returning q.status
  )
  select count(*) filter (where status <> 'na_fila'), count(*) filter (where status = 'na_fila')
  into qtd_gravadas, qtd_repetir
  from alteradas;

  return jsonb_build_object('gravadas', qtd_gravadas, 'repetir', qtd_repetir);
end;
$$;

-- ============================================================================
-- Permissões e RLS
-- ============================================================================

revoke execute on function public.enfileirar_cnd_interno(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.reservar_cnd(integer) from public, anon, authenticated;
revoke execute on function public.registrar_cnd_resultados(jsonb) from public, anon, authenticated;
revoke execute on function public.enfileirar_cnd(uuid) from public, anon;
grant execute on function public.enfileirar_cnd(uuid) to authenticated;

-- Escrita só pelas funções acima e pelo worker (chave secreta).
alter table public.cnd_consultas enable row level security;
create policy leitura on public.cnd_consultas for select to authenticated using (public.is_ativo());
