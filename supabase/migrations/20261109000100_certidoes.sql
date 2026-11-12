-- Certidões: catálogo de tipos, escolha por cliente e certidões lançadas.
--
-- 1. certidao_tipos: os 5 tipos com consulta automática (ligados ao enum
--    cnd_tipo) e os que o admin cadastrar (ex.: certidão de falência).
-- 2. cliente_certidao_tipos: em cada cliente, acompanhar ou não um tipo. Sem
--    linha, vale o padrão do tipo. Um tipo automático desligado sai da fila e
--    aparece no painel como 'dispensada', fora das contagens (como 'sem_cobertura').
-- 3. certidoes: certidão emitida lançada pela equipe (situação, emissão,
--    validade e o PDF no Storage, bucket "certidoes").

-- ============================================================================
-- Catálogo de tipos
-- ============================================================================

create table public.certidao_tipos (
  id smallint generated always as identity primary key,
  nome text not null unique check (length(trim(nome)) between 1 and 80),
  orgao text,
  validade_dias smallint check (validade_dias between 1 and 3650), -- sugere a validade ao lançar
  padrao boolean not null default false,  -- acompanhado em todo cliente, salvo escolha no cliente
  cnd_tipo public.cnd_tipo unique,        -- tipo da consulta automática, se houver
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

insert into public.certidao_tipos (nome, orgao, validade_dias, padrao, cnd_tipo) values
  ('Federal', 'RFB/PGFN e INSS', 180, true, 'federal'),
  ('FGTS', 'CRF da Caixa', 30, true, 'fgts'),
  ('Trabalhista', 'CNDT do TST', 180, true, 'trabalhista'),
  ('Estadual', 'SEFAZ da UF', null, true, 'estadual'),
  ('Municipal', 'Prefeitura', null, true, 'municipal');

alter table public.certidao_tipos enable row level security;
create policy leitura on public.certidao_tipos for select to authenticated using (public.is_ativo());
create policy inclusao on public.certidao_tipos for insert to authenticated
  with check (public.is_admin() and cnd_tipo is null);
create policy edicao on public.certidao_tipos for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Os tipos automáticos não são excluídos (podem ser desativados).
create policy exclusao on public.certidao_tipos for delete to authenticated
  using (public.is_admin() and cnd_tipo is null);

-- O vínculo com a consulta automática não muda pela tela.
create function public.tg_certidao_tipos_fixo()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.cnd_tipo is distinct from old.cnd_tipo then
    raise exception 'O tipo da consulta automática não pode ser alterado' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger certidao_tipos_fixo before update on public.certidao_tipos
  for each row execute function public.tg_certidao_tipos_fixo();

-- ============================================================================
-- Tipos acompanhados em cada cliente
-- ============================================================================

create table public.cliente_certidao_tipos (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo_id smallint not null references public.certidao_tipos (id) on delete cascade,
  acompanha boolean not null,
  primary key (cliente_id, tipo_id)
);

alter table public.cliente_certidao_tipos enable row level security;
create policy leitura on public.cliente_certidao_tipos for select to authenticated using (public.is_ativo());
create policy escrita on public.cliente_certidao_tipos for all to authenticated
  using (public.is_gestor_ou_admin()) with check (public.is_gestor_ou_admin());

-- O cliente acompanha a certidão automática desse tipo? Sem tipo no catálogo, sim.
create function public.cnd_acompanha(p_cliente_id uuid, p_tipo public.cnd_tipo)
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(
    (select coalesce(e.acompanha, t.padrao and t.ativo)
     from public.certidao_tipos t
     left join public.cliente_certidao_tipos e on e.tipo_id = t.id and e.cliente_id = p_cliente_id
     where t.cnd_tipo = p_tipo),
    true
  )
$$;

-- Deixou de acompanhar: o que estava na fila desse tipo sai (não seria mais mostrado).
create function public.tg_cliente_certidao_tipos_fila()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.cnd_consultas q
  using public.certidao_tipos t
  where t.id = new.tipo_id
    and t.cnd_tipo is not null
    and q.cliente_id = new.cliente_id
    and q.tipo = t.cnd_tipo
    and q.status = 'na_fila'
    and not public.cnd_acompanha(new.cliente_id, t.cnd_tipo);
  return null;
end;
$$;

create trigger cliente_certidao_tipos_fila after insert or update on public.cliente_certidao_tipos
  for each row execute function public.tg_cliente_certidao_tipos_fila();

-- ============================================================================
-- Fila: só o que o cliente acompanha (mesmas funções de municipio_nome + cnd_acompanha)
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
    and public.cnd_coberto(t.tipo, c.uf, c.municipio)
    and public.cnd_acompanha(c.id, t.tipo)
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
    and public.cnd_acompanha(c.id, t.tipo)
  on conflict (cliente_id, tipo) where status in ('na_fila', 'processando') do nothing;

  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

-- ============================================================================
-- Painel: tipo não acompanhado = 'dispensada', fora das contagens
-- ============================================================================

create or replace view public.cnd_painel with (security_invoker = true) as
with ultima as (
  select distinct on (q.cliente_id, q.tipo) q.cliente_id, q.tipo, q.status, q.processada_em, q.mensagem
  from public.cnd_consultas q
  join public.clientes c on c.id = q.cliente_id
  where q.status in ('regular', 'pendente', 'erro')
    and public.cnd_coberto(q.tipo, c.uf, c.municipio)
    and public.cnd_acompanha(q.cliente_id, q.tipo)
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
  case when public.cnd_acompanha(c.id, 'federal') then p.federal else 'dispensada' end as federal,
  case when public.cnd_acompanha(c.id, 'fgts') then p.fgts else 'dispensada' end as fgts,
  case when public.cnd_acompanha(c.id, 'trabalhista') then p.trabalhista else 'dispensada' end as trabalhista,
  case
    when not public.cnd_acompanha(c.id, 'estadual') then 'dispensada'
    when public.cnd_coberto('estadual', c.uf, c.municipio) then p.estadual
    else 'sem_cobertura'
  end as estadual,
  case
    when not public.cnd_acompanha(c.id, 'municipal') then 'dispensada'
    when public.cnd_coberto('municipal', c.uf, c.municipio) then p.municipal
    else 'sem_cobertura'
  end as municipal,
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

-- ============================================================================
-- Certidões lançadas
-- ============================================================================

create table public.certidoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo_id smallint not null references public.certidao_tipos (id) on delete restrict,
  situacao text not null check (situacao in ('negativa', 'positiva_efeito_negativa', 'positiva')),
  emitida_em date not null,
  valida_ate date check (valida_ate >= emitida_em),
  arquivo_path text,  -- caminho no bucket "certidoes"
  arquivo_nome text,
  observacao text check (length(observacao) <= 500),
  criado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index on public.certidoes (cliente_id, tipo_id, emitida_em desc);
create index on public.certidoes (valida_ate);

alter table public.certidoes enable row level security;
create policy leitura on public.certidoes for select to authenticated using (public.is_ativo());
-- Qualquer pessoa da equipe lança, em nome próprio.
create policy inclusao on public.certidoes for insert to authenticated
  with check (public.is_ativo() and criado_por = auth.uid());
-- Exclui quem lançou, o gestor ou o admin.
create policy exclusao on public.certidoes for delete to authenticated
  using (public.is_ativo() and (criado_por = auth.uid() or public.is_gestor_ou_admin()));

-- ============================================================================
-- PDFs no Storage (bucket privado "certidoes"; caminho "<cliente_id>/<arquivo>")
-- ============================================================================

insert into storage.buckets (id, name, public) values ('certidoes', 'certidoes', false)
on conflict (id) do nothing;

create policy certidoes_leitura on storage.objects for select to authenticated
  using (bucket_id = 'certidoes' and public.is_ativo());
create policy certidoes_envio on storage.objects for insert to authenticated
  with check (bucket_id = 'certidoes' and public.is_ativo());
-- Só sai o arquivo que não pertence mais a nenhuma certidão: a tela exclui
-- primeiro o registro (com as regras de quem pode excluir) e depois o PDF.
create policy certidoes_exclusao on storage.objects for delete to authenticated
  using (
    bucket_id = 'certidoes'
    and public.is_ativo()
    and not exists (select 1 from public.certidoes c where c.arquivo_path = storage.objects.name)
  );
