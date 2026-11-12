-- Log das sincronizações com o Domínio, exibido em Configurações.
--
-- Cada chamada à API (e cada falha que a rotina consegue reportar) vira uma
-- linha em integracao_execucoes. Só o servidor grava; admin e gestores leem.
-- A sincronização passa a devolver o que mudou em cada execução.

create table public.integracao_execucoes (
  id bigint generated always as identity primary key,
  integracao text not null default 'dominio_clientes',
  iniciado_em timestamptz not null default now(),
  duracao_ms integer,
  status text not null check (status in ('sucesso', 'recusado', 'erro')),
  origem text,
  recebidas integer,
  inseridas integer,
  atualizadas integer,
  reativadas integer,
  suspensas integer,
  regimes_alterados integer,
  forcar boolean not null default false,
  mensagem text,
  detalhes jsonb
);
create index on public.integracao_execucoes (iniciado_em desc);

alter table public.integracao_execucoes enable row level security;
create policy leitura on public.integracao_execucoes for select to authenticated
  using (public.is_gestor_ou_admin());

-- ============================================================================
-- Sincronização com detalhes do que mudou
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
      codigo_municipio, uf, cep, telefone, email, responsavel_legal,
      regime, regime_federal_dominio, regime_vigencia,
      status, sincronizado_em
    )
    select
      codigo_dominio, tipo_inscricao, documento, razao_social, nome_fantasia,
      inscricao_estadual, inscricao_municipal, cnae, ramo_atividade,
      data_inicio_atividade, logradouro, numero, complemento, bairro,
      codigo_municipio, uf, cep, telefone, email, responsavel_legal,
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
