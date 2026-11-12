-- CND: fila municipal separada por cidade.
--
-- Cada prefeitura tem a sua rotina (ISS Digital em Rio Preto, SIA da Fiorilli
-- em Jaci, Bady Bassitt...), e cada script roda na página de uma cidade só.
-- Reservar e contar passam a aceitar UF e município: a rotina de uma cidade
-- nunca reserva (nem marca como erro) clientes de outra. O município é
-- comparado sem acento nem maiúsculas (nome_comparavel), como em cnd_cobertura.

drop function public.reservar_cnd(integer, public.cnd_tipo, text);

create function public.reservar_cnd(
  p_limite integer default 10,
  p_tipo public.cnd_tipo default null,
  p_origem text default null,
  p_uf text default null,
  p_municipio text default null
)
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
  inscricao_municipal text,
  municipio text
)
language sql security definer set search_path = ''
as $$
  with lote as (
    select q.id
    from public.cnd_consultas q
    join public.clientes c on c.id = q.cliente_id
    where (p_tipo is null or q.tipo = p_tipo)
      and (p_origem is null or q.origem = p_origem)
      and (p_uf is null or c.uf = upper(p_uf))
      and (p_municipio is null or public.nome_comparavel(c.municipio) = public.nome_comparavel(p_municipio))
      and ((q.status = 'na_fila' and q.disponivel_em <= now())
           or (q.status = 'processando' and q.iniciada_em < now() - interval '15 minutes'))
    order by q.solicitada_em, q.id
    limit p_limite
    for update of q skip locked
  ),
  reservadas as (
    update public.cnd_consultas q
    set status = 'processando', iniciada_em = now(), tentativas = q.tentativas + 1
    from lote
    where q.id = lote.id
    returning q.id, q.tipo, q.tentativas, q.cliente_id
  )
  select r.id, r.tipo, r.tentativas, c.id, c.documento, c.tipo_inscricao, c.razao_social,
         c.uf, c.codigo_municipio, c.inscricao_estadual, c.inscricao_municipal, c.municipio
  from reservadas r
  join public.clientes c on c.id = r.cliente_id
$$;

drop function public.contar_cnd_pendentes();

create function public.contar_cnd_pendentes(p_uf text default null, p_municipio text default null)
returns table (tipo public.cnd_tipo, origem text, quantidade integer)
language sql stable security definer set search_path = ''
as $$
  select q.tipo, q.origem, count(*)::int
  from public.cnd_consultas q
  join public.clientes c on c.id = q.cliente_id
  where ((q.status = 'na_fila' and q.disponivel_em <= now())
         or (q.status = 'processando' and q.iniciada_em < now() - interval '15 minutes'))
    and (p_uf is null or c.uf = upper(p_uf))
    and (p_municipio is null or public.nome_comparavel(c.municipio) = public.nome_comparavel(p_municipio))
  group by q.tipo, q.origem
$$;

revoke execute on function public.reservar_cnd(integer, public.cnd_tipo, text, text, text) from public, anon, authenticated;
revoke execute on function public.contar_cnd_pendentes(text, text) from public, anon, authenticated;
