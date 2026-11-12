-- Nome do município do cliente, vindo do Domínio (bethadba.gemunicipio), e
-- cobertura das CNDs municipais pelo nome em vez do código do Domínio.
--
-- A sincronização diária passa a mandar "municipio" (empresas-ativas.sql). Os
-- municípios abaixo já são preenchidos aqui; os demais, na próxima sincronização.

alter table public.clientes add column municipio text;

update public.clientes set municipio = case codigo_municipio
    when 5339 then 'SAO JOSE DO RIO PRETO'
    when 5338 then 'SAO JOSE DO RIO PARDO'
    when 5061 then 'JACI'
    when 5123 then 'MIRASSOL'
    when 4833 then 'BADY BASSITT'
  end
where codigo_municipio in (5339, 5338, 5061, 5123, 4833);

-- ============================================================================
-- Sincronização do Domínio: grava também o nome do município
-- ============================================================================

create or replace function public.sincronizar_clientes_dominio(p_empresas jsonb, p_forcar boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  qtd_recebidas integer := jsonb_array_length(p_empresas);
  codigos integer[];
  qtd_ativas_hoje integer;
  qtd_inseridas integer;
  qtd_atualizadas integer;
  qtd_reativadas integer;
  qtd_suspensas integer;
  lista_inseridos jsonb;
  lista_reativados jsonb;
  lista_regimes jsonb;
  lista_suspensos jsonb;
begin
  if qtd_recebidas = 0 then
    raise exception 'Lista de empresas vazia' using errcode = '22023';
  end if;

  -- Proteção: uma consulta que falhou pela metade não pode suspender a carteira.
  select count(*) into qtd_ativas_hoje
  from public.clientes where codigo_dominio is not null and status = 'ativo';

  if not p_forcar and qtd_ativas_hoje >= 20 and qtd_recebidas < qtd_ativas_hoje * 0.8 then
    raise exception 'Recebidas % empresas, mas há % ativas vindas do Domínio. Envie com forcar=true se a queda for real.',
      qtd_recebidas, qtd_ativas_hoje using errcode = '22023';
  end if;

  codigos := array(select (e ->> 'codigo_dominio')::integer from jsonb_array_elements(p_empresas) e);

  with dados as (
    select e.*, public.regime_do_dominio(e.regime_federal) as regime
    from jsonb_to_recordset(p_empresas) as e(
      codigo_dominio integer,
      tipo_inscricao smallint,
      documento text,
      razao_social text,
      nome_fantasia text,
      inscricao_estadual text,
      inscricao_municipal text,
      cnae text,
      ramo_atividade text,
      data_inicio_atividade date,
      logradouro text,
      numero text,
      complemento text,
      bairro text,
      codigo_municipio integer,
      municipio text,
      uf text,
      cep text,
      telefone text,
      email text,
      responsavel_legal text,
      regime_federal smallint,
      regime_vigencia date
    )
  ),
  -- Foto de antes da gravação (CTEs enxergam o estado anterior ao insert).
  antes as (
    select c.codigo_dominio, c.status, c.regime
    from public.clientes c
    where c.codigo_dominio = any (codigos)
  ),
  gravados as (
    insert into public.clientes as c (
      codigo_dominio, tipo_inscricao, documento, razao_social, fantasia,
      inscricao_estadual, inscricao_municipal, cnae, ramo_atividade,
      data_inicio_atividade, logradouro, numero, complemento, bairro,
      codigo_municipio, municipio, uf, cep, telefone, email, responsavel_legal,
      regime, regime_federal_dominio, regime_vigencia,
      status, sincronizado_em
    )
    select
      codigo_dominio, tipo_inscricao, documento, razao_social, nome_fantasia,
      inscricao_estadual, inscricao_municipal, cnae, ramo_atividade,
      data_inicio_atividade, logradouro, numero, complemento, bairro,
      codigo_municipio, municipio, uf, cep, telefone, email, responsavel_legal,
      regime, regime_federal, regime_vigencia,
      'ativo', now()
    from dados
    on conflict (codigo_dominio) do update set
      tipo_inscricao         = excluded.tipo_inscricao,
      documento              = excluded.documento,
      razao_social           = excluded.razao_social,
      fantasia               = excluded.fantasia,
      inscricao_estadual     = excluded.inscricao_estadual,
      inscricao_municipal    = excluded.inscricao_municipal,
      cnae                   = excluded.cnae,
      ramo_atividade         = excluded.ramo_atividade,
      data_inicio_atividade  = excluded.data_inicio_atividade,
      logradouro             = excluded.logradouro,
      numero                 = excluded.numero,
      complemento            = excluded.complemento,
      bairro                 = excluded.bairro,
      codigo_municipio       = excluded.codigo_municipio,
      -- Envio antigo, sem o campo, não apaga o nome já gravado.
      municipio              = coalesce(excluded.municipio, c.municipio),
      uf                     = excluded.uf,
      cep                    = excluded.cep,
      telefone               = excluded.telefone,
      email                  = excluded.email,
      responsavel_legal      = excluded.responsavel_legal,
      regime                 = coalesce(excluded.regime, c.regime),
      regime_federal_dominio = excluded.regime_federal_dominio,
      regime_vigencia        = excluded.regime_vigencia,
      status                 = 'ativo',
      sincronizado_em        = excluded.sincronizado_em
    returning c.codigo_dominio, c.regime, (xmax = 0) as inserido
  )
  select
    count(*) filter (where g.inserido),
    count(*) filter (where not g.inserido),
    count(*) filter (where a.status <> 'ativo'),
    coalesce(jsonb_agg(g.codigo_dominio) filter (where g.inserido), '[]'),
    coalesce(jsonb_agg(g.codigo_dominio) filter (where a.status <> 'ativo'), '[]'),
    coalesce(jsonb_agg(jsonb_build_object('codigo', g.codigo_dominio, 'de', a.regime, 'para', g.regime))
               filter (where not g.inserido and a.regime is distinct from g.regime), '[]')
  into qtd_inseridas, qtd_atualizadas, qtd_reativadas, lista_inseridos, lista_reativados, lista_regimes
  from gravados g
  left join antes a on a.codigo_dominio = g.codigo_dominio;

  with suspensos as (
    update public.clientes c
    set status = 'suspenso'
    where c.codigo_dominio is not null
      and c.status = 'ativo'
      and c.codigo_dominio <> all (codigos)
    returning c.codigo_dominio
  )
  select count(*), coalesce(jsonb_agg(codigo_dominio), '[]')
  into qtd_suspensas, lista_suspensos
  from suspensos;

  return jsonb_build_object(
    'recebidas', qtd_recebidas,
    'inseridas', qtd_inseridas,
    'atualizadas', qtd_atualizadas,
    'reativadas', qtd_reativadas,
    'suspensas', qtd_suspensas,
    'regimes_alterados', jsonb_array_length(lista_regimes),
    'detalhes', jsonb_build_object(
      'inseridos', lista_inseridos,
      'reativados', lista_reativados,
      'suspensos', lista_suspensos,
      'regimes', lista_regimes
    )
  );
end;
$$;

revoke execute on function public.sincronizar_clientes_dominio(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sincronizar_clientes_dominio(jsonb, boolean) to service_role;

-- ============================================================================
-- Cobertura municipal pelo nome do município
-- ============================================================================
--
-- Novo município (como admin, no SQL Editor), com o nome como está no Domínio:
--   insert into cnd_cobertura (tipo, uf, municipio, observacao) values ('municipal', 'SP', 'MIRASSOL', '...');
-- Maiúsculas e acentos não importam na comparação.

-- Nome sem acento e em maiúsculas, para "São José" bater com "SAO JOSE".
create function public.nome_comparavel(p_nome text)
returns text
language sql immutable set search_path = ''
as $$
  select upper(translate(trim(p_nome),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
$$;

alter table public.cnd_cobertura add column municipio text;
update public.cnd_cobertura set municipio = 'SAO JOSE DO RIO PRETO' where tipo = 'municipal' and codigo_municipio = 5339;
alter table public.cnd_cobertura drop column codigo_municipio; -- leva junto o check e o unique antigos
alter table public.cnd_cobertura
  add check ((tipo = 'municipal') = (municipio is not null)),
  add unique nulls not distinct (tipo, uf, municipio);

create function public.cnd_coberto(p_tipo public.cnd_tipo, p_uf text, p_municipio text)
returns boolean
language sql stable set search_path = ''
as $$
  select p_tipo not in ('estadual', 'municipal')
    or exists (
      select 1 from public.cnd_cobertura k
      where k.tipo = p_tipo
        and k.uf = p_uf
        and (k.municipio is null or public.nome_comparavel(k.municipio) = public.nome_comparavel(p_municipio))
    )
$$;

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
    and public.cnd_coberto(t.tipo, c.uf, c.municipio)
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
    and public.cnd_coberto(t.tipo, c.uf, c.municipio)
  on conflict (cliente_id, tipo) where status in ('na_fila', 'processando') do nothing;

  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

-- ============================================================================
-- Painel: cobertura pelo nome e o nome do município (no fim da view)
-- ============================================================================

create or replace view public.cnd_painel with (security_invoker = true) as
with ultima as (
  select distinct on (q.cliente_id, q.tipo) q.cliente_id, q.tipo, q.status, q.processada_em, q.mensagem
  from public.cnd_consultas q
  join public.clientes c on c.id = q.cliente_id
  where q.status in ('regular', 'pendente', 'erro')
    and public.cnd_coberto(q.tipo, c.uf, c.municipio)
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
  case when public.cnd_coberto('estadual', c.uf, c.municipio) then p.estadual else 'sem_cobertura' end as estadual,
  case when public.cnd_coberto('municipal', c.uf, c.municipio) then p.municipal else 'sem_cobertura' end as municipal,
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
  end as situacao,
  c.municipio
from public.clientes c
left join por_cliente p on p.cliente_id = c.id
where c.busca_cnd or p.cliente_id is not null;

drop function public.cnd_coberto(public.cnd_tipo, text, integer);
