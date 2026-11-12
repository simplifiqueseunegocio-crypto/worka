-- CND: reserva da fila por tipo de certidão.
--
-- Cada rotina consulta um tipo (ex.: a federal roda no navegador do app,
-- as demais no worker), então cada uma reserva só as consultas do seu tipo.
-- p_tipo nulo mantém o comportamento anterior (qualquer tipo).

drop function public.reservar_cnd(integer);

create function public.reservar_cnd(p_limite integer default 10, p_tipo public.cnd_tipo default null)
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
    where (p_tipo is null or q.tipo = p_tipo)
      and (q.status = 'na_fila'
           or (q.status = 'processando' and q.iniciada_em < now() - interval '15 minutes'))
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

revoke execute on function public.reservar_cnd(integer, public.cnd_tipo) from public, anon, authenticated;
