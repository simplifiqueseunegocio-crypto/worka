-- CND: onde cada certidão estadual e municipal tem consulta automática.
--
-- Federal, FGTS e trabalhista valem para qualquer cliente. A estadual e a
-- municipal dependem do estado e do município do cliente (uf e
-- codigo_municipio, vindos do Domínio): só entram na fila os clientes de uma
-- UF ou município com rotina pronta. Os demais aparecem na tela como "sem
-- cobertura", em vez de erro.
--
-- Uma linha por UF (estadual) ou por município (municipal). Para cobrir um novo
-- lugar quando a rotina dele estiver pronta, como admin no SQL Editor:
--   insert into cnd_cobertura (tipo, uf, observacao) values ('estadual', 'MG', '...');
--   insert into cnd_cobertura (tipo, uf, codigo_municipio, observacao) values ('municipal', 'SP', 5061, '...');
-- (codigo_municipio = código do município no Domínio, não o do IBGE)

create table public.cnd_cobertura (
  id bigint generated always as identity primary key,
  tipo public.cnd_tipo not null check (tipo in ('estadual', 'municipal')),
  uf char(2) not null,
  codigo_municipio integer,
  observacao text,
  check ((tipo = 'municipal') = (codigo_municipio is not null)),
  unique nulls not distinct (tipo, uf, codigo_municipio)
);

insert into public.cnd_cobertura (tipo, uf, codigo_municipio, observacao) values
  ('estadual', 'SP', null, 'SIDEB (Sefaz/PGE), rotina-estadual.md'),
  ('municipal', 'SP', 5339, 'São José do Rio Preto, ISS Digital, rotina-municipal.md');

alter table public.cnd_cobertura enable row level security;
create policy leitura on public.cnd_cobertura for select to authenticated using (public.is_ativo());
create policy admin on public.cnd_cobertura for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A certidão tem consulta automática para um cliente nesse estado/município?
create function public.cnd_coberto(p_tipo public.cnd_tipo, p_uf text, p_codigo_municipio integer)
returns boolean
language sql stable set search_path = ''
as $$
  select p_tipo not in ('estadual', 'municipal')
    or exists (
      select 1 from public.cnd_cobertura k
      where k.tipo = p_tipo
        and k.uf = p_uf
        and (k.codigo_municipio is null or k.codigo_municipio = p_codigo_municipio)
    )
$$;

-- ============================================================================
-- Enfileiramento: só o que tem cobertura
-- ============================================================================

create or replace function public.enfileirar_cnd_interno(
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
  cross join public.cnd_tipos t
  where t.automatico
    and c.status = 'ativo'
    and c.busca_cnd
    and (p_cliente_id is null or c.id = p_cliente_id)
    and public.cnd_coberto(t.tipo, c.uf, c.codigo_municipio)
  on conflict (cliente_id, tipo) where status in ('na_fila', 'processando') do nothing;

  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

create or replace function public.enfileirar_cnd_selecionados(p_clientes uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  qtd integer;
begin
  if not public.is_ativo() then
    raise exception 'Usuário sem acesso' using errcode = '42501';
  end if;
  if coalesce(array_length(p_clientes, 1), 0) = 0 then
    return 0;
  end if;
  if array_length(p_clientes, 1) > 500 then
    raise exception 'Selecione no máximo 500 clientes por vez' using errcode = '22023';
  end if;

  insert into public.cnd_consultas (cliente_id, tipo, origem, solicitada_por)
  select c.id, t.tipo, 'manual', auth.uid()
  from public.clientes c
  cross join public.cnd_tipos t
  where t.automatico
    and c.status = 'ativo'
    and c.id = any (p_clientes)
    and public.cnd_coberto(t.tipo, c.uf, c.codigo_municipio)
  on conflict (cliente_id, tipo) where status in ('na_fila', 'processando') do nothing;

  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

-- Pedidos que já estavam na fila para quem não tem cobertura nunca seriam
-- consultados: saem da fila.
delete from public.cnd_consultas q
using public.clientes c
where c.id = q.cliente_id
  and q.status = 'na_fila'
  and not public.cnd_coberto(q.tipo, c.uf, c.codigo_municipio);

-- ============================================================================
-- Painel: certidão sem cobertura = 'sem_cobertura', fora das contagens
-- ============================================================================

create or replace view public.cnd_painel with (security_invoker = true) as
with ultima as (
  select distinct on (q.cliente_id, q.tipo) q.cliente_id, q.tipo, q.status, q.processada_em, q.mensagem
  from public.cnd_consultas q
  join public.clientes c on c.id = q.cliente_id
  where q.status in ('regular', 'pendente', 'erro')
    and public.cnd_coberto(q.tipo, c.uf, c.codigo_municipio)
  order by q.cliente_id, q.tipo, q.processada_em desc
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
  p.federal,
  p.fgts,
  p.trabalhista,
  case when public.cnd_coberto('estadual', c.uf, c.codigo_municipio) then p.estadual else 'sem_cobertura' end as estadual,
  case when public.cnd_coberto('municipal', c.uf, c.codigo_municipio) then p.municipal else 'sem_cobertura' end as municipal,
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
