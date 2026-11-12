-- Integração Domínio: regime tributário a partir de efparametro_vigencia.rfed_par.
--
-- O regime passa a vir do Domínio quando o código é conhecido. Código
-- desconhecido ou ausente mantém o regime que já está na plataforma.
-- Ao mudar o regime, o trigger clientes_vincula_regime vincula as
-- obrigações padrão do novo regime.

alter table public.clientes
  add column regime_federal_dominio smallint,
  add column regime_vigencia date;

-- Tradução do código rfed_par do Domínio para o regime da plataforma.
create function public.regime_do_dominio(codigo smallint)
returns public.regime
language sql immutable set search_path = ''
as $$
  select case codigo
    when 1 then 'real'::public.regime
    when 2 then 'simples'::public.regime
    when 5 then 'presumido'::public.regime
  end
$$;

create or replace function public.sincronizar_clientes_dominio(p_empresas jsonb, p_forcar boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  qtd_recebidas integer := jsonb_array_length(p_empresas);
  qtd_ativas_hoje integer;
  qtd_inseridas integer;
  qtd_atualizadas integer;
  qtd_suspensas integer;
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
    returning (xmax = 0) as inserido
  )
  select count(*) filter (where inserido), count(*) filter (where not inserido)
  into qtd_inseridas, qtd_atualizadas
  from gravados;

  update public.clientes c
  set status = 'suspenso'
  where c.codigo_dominio is not null
    and c.status = 'ativo'
    and not exists (
      select 1 from jsonb_array_elements(p_empresas) e
      where (e ->> 'codigo_dominio')::integer = c.codigo_dominio
    );
  get diagnostics qtd_suspensas = row_count;

  return jsonb_build_object(
    'recebidas', qtd_recebidas,
    'inseridas', qtd_inseridas,
    'atualizadas', qtd_atualizadas,
    'suspensas', qtd_suspensas
  );
end;
$$;

revoke execute on function public.sincronizar_clientes_dominio(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sincronizar_clientes_dominio(jsonb, boolean) to service_role;
