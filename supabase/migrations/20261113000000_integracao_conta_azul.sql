-- Integração com a Conta Azul: cadastro de clientes (substitui o Domínio).
--
-- A plataforma lê, pela API da Conta Azul (OAuth 2.0), as pessoas com perfil
-- "Cliente" da conta do escritório e sincroniza a tabela clientes, com as
-- mesmas regras que valiam para o Domínio:
--   * cliente novo entra como ativo; o que já existe é atualizado;
--   * cliente vindo da Conta Azul que não vem mais (ou foi inativado lá) passa
--     para suspenso e perde as tarefas em aberto (tg_clientes_fora_dominio);
--   * status definido pela equipe (status_manual) não é mexido;
--   * regime, observações e responsáveis continuam sendo da plataforma.
--
-- Transição: na primeira sincronização, clientes que já existem (vindos do
-- Domínio ou cadastrados à mão) são VINCULADOS pela correspondência de CNPJ/CPF,
-- sem duplicar e sem perder histórico. A coluna codigo_dominio fica como
-- referência histórica.

-- ============================================================================
-- Vínculo do cliente com a pessoa da Conta Azul
-- ============================================================================

alter table public.clientes add column conta_azul_id text unique;

-- ============================================================================
-- Conexão OAuth (uma só, a conta Conta Azul do escritório)
-- ============================================================================
-- O refresh_token muda a cada renovação, por isso fica no banco. Só o servidor
-- (service_role) lê e grava: RLS ligada e nenhuma policy.

create table public.conta_azul_conexao (
  id smallint primary key default 1 check (id = 1),
  access_token text,
  refresh_token text not null,
  expira_em timestamptz,
  conta_nome text,
  conta_documento text,
  conectado_por uuid references public.profiles (id) on delete set null,
  conectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.conta_azul_conexao enable row level security;
revoke all on table public.conta_azul_conexao from anon, authenticated;

-- ============================================================================
-- Sincronização
-- ============================================================================

-- p_clientes: array JSON normalizado pelo servidor (lib/integracoes/conta-azul.ts)
--   { conta_azul_id, documento, razao_social, email, telefone, logradouro,
--     numero, complemento, bairro, municipio, uf, cep }
-- Só pessoas ATIVAS na Conta Azul vêm na lista.
-- p_forcar: ignora a proteção contra listas muito menores que a carteira atual.
create function public.sincronizar_clientes_conta_azul(p_clientes jsonb, p_forcar boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  qtd_recebidas integer := jsonb_array_length(p_clientes);
  ids text[];
  qtd_ativas_hoje integer;
  qtd_vinculadas integer;
  qtd_inseridas integer;
  qtd_atualizadas integer;
  qtd_reativadas integer;
  qtd_suspensas integer;
  lista_vinculados jsonb;
  lista_inseridos jsonb;
  lista_reativados jsonb;
  lista_suspensos jsonb;
begin
  if qtd_recebidas = 0 then
    raise exception 'Lista de clientes vazia' using errcode = '22023';
  end if;

  -- Proteção: uma leitura que falhou pela metade não pode suspender a carteira.
  select count(*) into qtd_ativas_hoje
  from public.clientes where conta_azul_id is not null and status = 'ativo';

  if not p_forcar and qtd_ativas_hoje >= 20 and qtd_recebidas < qtd_ativas_hoje * 0.8 then
    raise exception 'Recebidos % clientes, mas há % ativos vindos da Conta Azul. Sincronize com "forçar" se a queda for real.',
      qtd_recebidas, qtd_ativas_hoje using errcode = '22023';
  end if;

  create temporary table _ca_dados on commit drop as
  select *
  from jsonb_to_recordset(p_clientes) as e(
    conta_azul_id text,
    documento text,
    razao_social text,
    email text,
    telefone text,
    logradouro text,
    numero text,
    complemento text,
    bairro text,
    municipio text,
    uf text,
    cep text
  );

  ids := array(select conta_azul_id from _ca_dados);

  -- 1) Vínculo pelo documento: cliente sem conta_azul_id e com o mesmo CNPJ/CPF
  --    de uma pessoa ainda não vinculada. Um cliente por documento (prefere o
  --    ativo e o mais antigo) e uma pessoa por documento.
  with pessoas as (
    select distinct on (d.documento) d.documento, d.conta_azul_id
    from _ca_dados d
    where not exists (select 1 from public.clientes x where x.conta_azul_id = d.conta_azul_id)
    order by d.documento, d.conta_azul_id
  ),
  alvos as (
    select distinct on (c.documento) c.id, p.conta_azul_id
    from public.clientes c
    join pessoas p on p.documento = c.documento
    where c.conta_azul_id is null
    order by c.documento, (c.status = 'ativo') desc, c.criado_em
  ),
  vinculados as (
    update public.clientes c
    set conta_azul_id = a.conta_azul_id
    from alvos a
    where c.id = a.id
    returning c.razao_social, c.documento
  )
  select count(*), coalesce(jsonb_agg(razao_social || ' · ' || documento), '[]')
  into qtd_vinculadas, lista_vinculados
  from vinculados;

  -- 2) Grava: insere os novos e atualiza os vinculados. Campo vazio na Conta
  --    Azul não apaga o que a plataforma já tem.
  with antes as (
    select c.conta_azul_id, c.status
    from public.clientes c
    where c.conta_azul_id = any (ids)
  ),
  gravados as (
    insert into public.clientes as c (
      conta_azul_id, tipo_inscricao, documento, razao_social,
      logradouro, numero, complemento, bairro, municipio, uf, cep,
      telefone, email, status, sincronizado_em
    )
    select
      d.conta_azul_id,
      case when length(d.documento) = 14 then 1 end,
      d.documento, d.razao_social,
      d.logradouro, d.numero, d.complemento, d.bairro, d.municipio, d.uf, d.cep,
      d.telefone, d.email, 'ativo', now()
    from _ca_dados d
    on conflict (conta_azul_id) do update set
      documento       = excluded.documento,
      razao_social    = excluded.razao_social,
      logradouro      = coalesce(excluded.logradouro, c.logradouro),
      numero          = coalesce(excluded.numero, c.numero),
      complemento     = coalesce(excluded.complemento, c.complemento),
      bairro          = coalesce(excluded.bairro, c.bairro),
      municipio       = coalesce(excluded.municipio, c.municipio),
      uf              = coalesce(excluded.uf, c.uf),
      cep             = coalesce(excluded.cep, c.cep),
      telefone        = coalesce(excluded.telefone, c.telefone),
      email           = coalesce(excluded.email, c.email),
      tipo_inscricao  = coalesce(c.tipo_inscricao, excluded.tipo_inscricao),
      status          = 'ativo',
      sincronizado_em = excluded.sincronizado_em
    returning c.conta_azul_id, c.razao_social, c.documento, (xmax = 0) as inserido
  )
  select
    count(*) filter (where g.inserido),
    count(*) filter (where not g.inserido),
    count(*) filter (where a.status <> 'ativo'),
    coalesce(jsonb_agg(g.razao_social || ' · ' || g.documento) filter (where g.inserido), '[]'),
    coalesce(jsonb_agg(g.razao_social || ' · ' || g.documento) filter (where a.status <> 'ativo'), '[]')
  into qtd_inseridas, qtd_atualizadas, qtd_reativadas, lista_inseridos, lista_reativados
  from gravados g
  left join antes a on a.conta_azul_id = g.conta_azul_id;

  -- 3) Suspende quem veio da Conta Azul e não veio agora (saiu ou foi inativado).
  with suspensos as (
    update public.clientes c
    set status = 'suspenso'
    where c.conta_azul_id is not null
      and c.status = 'ativo'
      and c.conta_azul_id <> all (ids)
    returning c.razao_social, c.documento
  )
  select count(*), coalesce(jsonb_agg(razao_social || ' · ' || documento), '[]')
  into qtd_suspensas, lista_suspensos
  from suspensos;

  return jsonb_build_object(
    'recebidas', qtd_recebidas,
    'inseridas', qtd_inseridas,
    'atualizadas', qtd_atualizadas,
    'reativadas', qtd_reativadas,
    'suspensas', qtd_suspensas,
    'vinculadas', qtd_vinculadas,
    'detalhes', jsonb_build_object(
      'vinculados', lista_vinculados,
      'inseridos', lista_inseridos,
      'reativados', lista_reativados,
      'suspensos', lista_suspensos
    )
  );
end;
$$;

-- Só o servidor (chave secreta / service_role) pode sincronizar.
revoke execute on function public.sincronizar_clientes_conta_azul(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sincronizar_clientes_conta_azul(jsonb, boolean) to service_role;

-- ============================================================================
-- Regras que valiam só para o Domínio passam a valer para a Conta Azul
-- ============================================================================

-- Cliente que sai da integração (suspenso pela sincronização, sem status
-- manual) perde as tarefas em aberto.
create or replace function public.tg_clientes_fora_dominio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'ativo'
     and new.status <> 'ativo'
     and (new.codigo_dominio is not null or new.conta_azul_id is not null)
     and not new.status_manual then
    delete from public.tarefas
    where cliente_id = new.id
      and status in ('pendente', 'em_andamento', 'aguardando_cliente');
  end if;
  return null;
end;
$$;

-- "Ainda vem da integração?": veio na última sincronização com sucesso, do
-- Domínio (histórico) ou da Conta Azul. Bloqueia excluir um cliente que a
-- próxima sincronização recriaria. O nome foi mantido por compatibilidade.
create or replace function public.cliente_no_dominio(p_cliente_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select
        (c.codigo_dominio is not null
          and c.sincronizado_em >= (
            select max(e.iniciado_em) - interval '1 hour'
            from public.integracao_execucoes e
            where e.integracao = 'dominio_clientes' and e.status = 'sucesso'
          ))
        or
        (c.conta_azul_id is not null
          and c.sincronizado_em >= (
            select max(e.iniciado_em) - interval '1 hour'
            from public.integracao_execucoes e
            where e.integracao = 'conta_azul_clientes' and e.status = 'sucesso'
          ))
     from public.clientes c
     where c.id = p_cliente_id),
    false
  )
$$;

create or replace function public.tg_clientes_exclusao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'ativo' then
    raise exception 'Suspenda ou encerre o cliente antes de excluir' using errcode = '23514';
  end if;
  if public.cliente_no_dominio(old.id) then
    raise exception 'Cliente ainda vem da Conta Azul: a sincronização o recriaria' using errcode = '23514';
  end if;
  return old;
end;
$$;
