-- CND sob demanda: consulta só dos clientes selecionados na plataforma.
--
-- A equipe seleciona clientes na tela Clientes e pede a consulta: entram na
-- fila com origem 'manual' as certidões automáticas de cada um (mesmo sem a
-- busca mensal ligada). A tarefa "CND sob demanda" reserva só a origem
-- 'manual'; a rodada do dia 23 continua com origem 'agendada'.

-- Reserva com filtro opcional de origem ('manual' | 'agendada').
drop function public.reservar_cnd(integer, public.cnd_tipo);

create function public.reservar_cnd(
  p_limite integer default 10,
  p_tipo public.cnd_tipo default null,
  p_origem text default null
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
  inscricao_municipal text
)
language sql security definer set search_path = ''
as $$
  with lote as (
    select q.id
    from public.cnd_consultas q
    where (p_tipo is null or q.tipo = p_tipo)
      and (p_origem is null or q.origem = p_origem)
      and ((q.status = 'na_fila' and q.disponivel_em <= now())
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

-- Coloca na fila (origem 'manual') as certidões automáticas dos clientes
-- selecionados. Só clientes ativos; não exige a busca mensal ligada.
create function public.enfileirar_cnd_selecionados(p_clientes uuid[])
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
  on conflict (cliente_id, tipo) where status in ('na_fila', 'processando') do nothing;

  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

revoke execute on function public.reservar_cnd(integer, public.cnd_tipo, text) from public, anon, authenticated;
revoke execute on function public.enfileirar_cnd_selecionados(uuid[]) from public, anon;
grant execute on function public.enfileirar_cnd_selecionados(uuid[]) to authenticated;
