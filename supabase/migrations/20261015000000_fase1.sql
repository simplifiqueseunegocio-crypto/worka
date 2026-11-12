-- Plataforma MCONT — Fase 1 (MVP)
-- Equipe, clientes, catálogo de obrigações, tarefas por competência e RLS.

-- ============================================================================
-- Tipos
-- ============================================================================

create type public.papel as enum ('admin', 'gestor', 'colaborador');
create type public.regime as enum ('mei', 'simples', 'presumido', 'real');
create type public.cliente_status as enum ('ativo', 'suspenso', 'encerrado');
create type public.periodicidade as enum ('mensal', 'trimestral', 'anual');
create type public.ajuste_dia_util as enum ('antecipa', 'posterga', 'nenhum');
create type public.tarefa_status as enum (
  'pendente', 'em_andamento', 'aguardando_cliente', 'concluida', 'dispensada'
);

-- ============================================================================
-- Tabelas
-- ============================================================================

create table public.departamentos (
  id smallint generated always as identity primary key,
  nome text not null unique
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null,
  papel public.papel not null default 'colaborador',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.profile_departamentos (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  departamento_id smallint not null references public.departamentos (id) on delete cascade,
  primary key (profile_id, departamento_id)
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  documento text not null unique check (documento ~ '^(\d{11}|\d{14})$'),
  razao_social text not null,
  fantasia text,
  regime public.regime not null,
  status public.cliente_status not null default 'ativo',
  inicio_em date,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.cliente_contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text not null,
  email text,
  telefone text,
  cargo text
);
create index on public.cliente_contatos (cliente_id);

create table public.cliente_responsaveis (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  departamento_id smallint not null references public.departamentos (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  primary key (cliente_id, departamento_id)
);
create index on public.cliente_responsaveis (profile_id);

create table public.feriados (
  data date not null,
  descricao text not null,
  uf char(2),
  municipio text,
  unique nulls not distinct (data, uf, municipio)
);

-- meses_apos: quantos meses depois do mês da competência fica o vencimento.
-- Ex.: DAS da competência 09/2026 vence em 20/10/2026 → dia 20, meses_apos 1.
-- Trimestrais são geradas nas competências 03, 06, 09 e 12; anuais na 12
-- (ano-base). Ex.: DEFIS do ano-base 2026 → competência 12/2026, meses_apos 3.
create table public.obrigacoes (
  id smallint generated always as identity primary key,
  nome text not null unique,
  departamento_id smallint not null references public.departamentos (id),
  periodicidade public.periodicidade not null default 'mensal',
  dia_vencimento smallint not null check (dia_vencimento between 1 and 31),
  meses_apos smallint not null default 1 check (meses_apos between 0 and 12),
  ajuste public.ajuste_dia_util not null default 'antecipa',
  meta_dias_antes smallint not null default 0 check (meta_dias_antes >= 0),
  regimes public.regime[] not null,
  ativo boolean not null default true
);

create table public.cliente_obrigacoes (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  obrigacao_id smallint not null references public.obrigacoes (id) on delete cascade,
  ativo boolean not null default true,
  primary key (cliente_id, obrigacao_id)
);

create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  obrigacao_id smallint not null references public.obrigacoes (id) on delete restrict,
  departamento_id smallint not null references public.departamentos (id),
  competencia date not null check (extract(day from competencia) = 1),
  prazo_legal date not null,
  prazo_meta date not null,
  responsavel_id uuid references public.profiles (id) on delete set null,
  status public.tarefa_status not null default 'pendente',
  observacao text,
  concluida_em timestamptz,
  concluida_por uuid references public.profiles (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, obrigacao_id, competencia),
  check (status <> 'dispensada' or coalesce(trim(observacao), '') <> '')
);
create index on public.tarefas (competencia, departamento_id);
create index on public.tarefas (responsavel_id, status);
create index on public.tarefas (prazo_legal) where status not in ('concluida', 'dispensada');

-- ============================================================================
-- Funções auxiliares de permissão (usadas pelas policies)
-- ============================================================================

create function public.meu_papel()
returns public.papel
language sql stable security definer set search_path = ''
as $$
  select papel from public.profiles where id = auth.uid() and ativo
$$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.meu_papel() = 'admin', false)
$$;

-- Admin, ou gestor ligado ao departamento.
create function public.gere_departamento(dep smallint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or (
    public.meu_papel() = 'gestor'
    and exists (
      select 1 from public.profile_departamentos
      where profile_id = auth.uid() and departamento_id = dep
    )
  )
$$;

create function public.is_gestor_ou_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.meu_papel() in ('admin', 'gestor'), false)
$$;

create function public.is_ativo()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.meu_papel() is not null
$$;

-- ============================================================================
-- Cálculo de prazos
-- ============================================================================

create function public.is_dia_util(d date)
returns boolean
language sql stable set search_path = ''
as $$
  select extract(isodow from d) < 6
     and not exists (select 1 from public.feriados f where f.data = d and f.uf is null)
$$;

create function public.ajusta_dia_util(d date, modo public.ajuste_dia_util)
returns date
language plpgsql stable set search_path = ''
as $$
begin
  if modo = 'nenhum' then
    return d;
  end if;
  while not public.is_dia_util(d) loop
    d := d + case when modo = 'antecipa' then -1 else 1 end;
  end loop;
  return d;
end;
$$;

-- Vencimento legal: dia_vencimento no mês (competência + meses_apos),
-- limitado ao último dia do mês e ajustado para dia útil.
create function public.calcula_prazo_legal(o public.obrigacoes, competencia date)
returns date
language sql stable set search_path = ''
as $$
  select public.ajusta_dia_util(
    least(
      (date_trunc('month', competencia) + make_interval(months => o.meses_apos))::date
        + (o.dia_vencimento - 1),
      (date_trunc('month', competencia) + make_interval(months => o.meses_apos + 1))::date - 1
    ),
    o.ajuste
  )
$$;

-- ============================================================================
-- Geração de tarefas
-- ============================================================================

-- Interna: sem checagem de permissão. Usada pelo cron e pela função pública.
create function public.gerar_tarefas_interno(p_competencia date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  comp date := date_trunc('month', p_competencia)::date;
  qtd integer;
begin
  insert into public.tarefas (
    cliente_id, obrigacao_id, departamento_id, competencia,
    prazo_legal, prazo_meta, responsavel_id
  )
  select
    c.id,
    o.id,
    o.departamento_id,
    comp,
    pl.prazo,
    public.ajusta_dia_util(pl.prazo - o.meta_dias_antes, 'antecipa'),
    r.profile_id
  from public.cliente_obrigacoes co
  join public.clientes c on c.id = co.cliente_id
  join public.obrigacoes o on o.id = co.obrigacao_id
  cross join lateral (select public.calcula_prazo_legal(o, comp) as prazo) pl
  left join public.cliente_responsaveis r
    on r.cliente_id = c.id and r.departamento_id = o.departamento_id
  where co.ativo
    and o.ativo
    and c.status = 'ativo'
    and (c.inicio_em is null or date_trunc('month', c.inicio_em) <= comp)
    and case o.periodicidade
          when 'mensal' then true
          when 'trimestral' then extract(month from comp) in (3, 6, 9, 12)
          when 'anual' then extract(month from comp) = 12
        end
  on conflict (cliente_id, obrigacao_id, competencia) do nothing;

  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

-- Pública (RPC): só admin e gestor. Pode ser chamada de novo sem duplicar.
create function public.gerar_tarefas(p_competencia date)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_gestor_ou_admin() then
    raise exception 'Apenas admin ou gestor pode gerar tarefas' using errcode = '42501';
  end if;
  return public.gerar_tarefas_interno(p_competencia);
end;
$$;

-- Vincula ao cliente as obrigações padrão do seu regime (não remove as que já existem).
create function public.vincular_obrigacoes_padrao(p_cliente_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.cliente_obrigacoes (cliente_id, obrigacao_id)
  select c.id, o.id
  from public.clientes c
  join public.obrigacoes o on c.regime = any (o.regimes) and o.ativo
  where c.id = p_cliente_id
  on conflict do nothing
$$;

-- ============================================================================
-- Triggers
-- ============================================================================

create function public.tg_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger clientes_atualizado_em before update on public.clientes
  for each row execute function public.tg_atualizado_em();
create trigger tarefas_atualizado_em before update on public.tarefas
  for each row execute function public.tg_atualizado_em();

create function public.tg_clientes_vincula()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.vincular_obrigacoes_padrao(new.id);
  return new;
end;
$$;

create trigger clientes_vincula_insert after insert on public.clientes
  for each row execute function public.tg_clientes_vincula();
create trigger clientes_vincula_regime after update of regime on public.clientes
  for each row when (old.regime is distinct from new.regime)
  execute function public.tg_clientes_vincula();

-- Nova obrigação: vincula aos clientes existentes dos regimes indicados.
create function public.tg_obrigacoes_vincula()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.cliente_obrigacoes (cliente_id, obrigacao_id)
  select c.id, new.id from public.clientes c where c.regime = any (new.regimes)
  on conflict do nothing;
  return new;
end;
$$;

create trigger obrigacoes_vincula after insert on public.obrigacoes
  for each row execute function public.tg_obrigacoes_vincula();

-- Quem não gere o departamento só pode mudar status e observação.
-- Também registra quem concluiu e quando.
create function public.tg_tarefas_regras()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.gere_departamento(old.departamento_id) then
    if (new.cliente_id, new.obrigacao_id, new.departamento_id, new.competencia,
        new.prazo_legal, new.prazo_meta, new.responsavel_id)
       is distinct from
       (old.cliente_id, old.obrigacao_id, old.departamento_id, old.competencia,
        old.prazo_legal, old.prazo_meta, old.responsavel_id) then
      raise exception 'Você só pode alterar o status e a observação desta tarefa'
        using errcode = '42501';
    end if;
  end if;

  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    new.concluida_em := now();
    new.concluida_por := auth.uid();
  elsif new.status <> 'concluida' then
    new.concluida_em := null;
    new.concluida_por := null;
  end if;

  return new;
end;
$$;

create trigger tarefas_regras before update on public.tarefas
  for each row execute function public.tg_tarefas_regras();

-- Cria o profile quando um usuário é criado no Auth.
-- O primeiro usuário do sistema vira admin automaticamente.
create function public.tg_novo_usuario()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, email, papel)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    new.email,
    (case when exists (select 1 from public.profiles) then 'colaborador' else 'admin' end)::public.papel
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_novo_usuario();

-- ============================================================================
-- Permissões de execução
-- ============================================================================

revoke execute on function public.gerar_tarefas_interno(date) from public, anon, authenticated;
revoke execute on function public.vincular_obrigacoes_padrao(uuid) from public, anon, authenticated;
revoke execute on function public.gerar_tarefas(date) from public, anon;
grant execute on function public.gerar_tarefas(date) to authenticated;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.departamentos enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_departamentos enable row level security;
alter table public.clientes enable row level security;
alter table public.cliente_contatos enable row level security;
alter table public.cliente_responsaveis enable row level security;
alter table public.feriados enable row level security;
alter table public.obrigacoes enable row level security;
alter table public.cliente_obrigacoes enable row level security;
alter table public.tarefas enable row level security;

-- Leitura: qualquer usuário ativo da equipe.
create policy leitura on public.departamentos for select to authenticated using (public.is_ativo());
create policy leitura on public.profiles for select to authenticated using (public.is_ativo() or id = auth.uid());
create policy leitura on public.profile_departamentos for select to authenticated using (public.is_ativo());
create policy leitura on public.clientes for select to authenticated using (public.is_ativo());
create policy leitura on public.cliente_contatos for select to authenticated using (public.is_ativo());
create policy leitura on public.cliente_responsaveis for select to authenticated using (public.is_ativo());
create policy leitura on public.feriados for select to authenticated using (public.is_ativo());
create policy leitura on public.obrigacoes for select to authenticated using (public.is_ativo());
create policy leitura on public.cliente_obrigacoes for select to authenticated using (public.is_ativo());
create policy leitura on public.tarefas for select to authenticated using (public.is_ativo());

-- Configuração: só admin.
create policy admin on public.departamentos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin on public.profile_departamentos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin on public.feriados for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin on public.obrigacoes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Carteira: admin e gestores cadastram e editam; só admin exclui.
create policy escrita on public.clientes for insert to authenticated
  with check (public.is_gestor_ou_admin());
create policy edicao on public.clientes for update to authenticated
  using (public.is_gestor_ou_admin()) with check (public.is_gestor_ou_admin());
create policy exclusao on public.clientes for delete to authenticated
  using (public.is_admin());

create policy escrita on public.cliente_contatos for all to authenticated
  using (public.is_gestor_ou_admin()) with check (public.is_gestor_ou_admin());

create policy escrita on public.cliente_obrigacoes for all to authenticated
  using (public.is_gestor_ou_admin()) with check (public.is_gestor_ou_admin());

-- Responsável por departamento: admin ou gestor daquele departamento.
create policy escrita on public.cliente_responsaveis for all to authenticated
  using (public.gere_departamento(departamento_id))
  with check (public.gere_departamento(departamento_id));

-- Tarefas: gestor do departamento cria, edita e exclui;
-- o responsável atualiza as dele (limitado pelo trigger tarefas_regras).
create policy criacao on public.tarefas for insert to authenticated
  with check (public.gere_departamento(departamento_id));
create policy edicao on public.tarefas for update to authenticated
  using (public.gere_departamento(departamento_id) or (public.is_ativo() and responsavel_id = auth.uid()))
  with check (public.gere_departamento(departamento_id) or (public.is_ativo() and responsavel_id = auth.uid()));
create policy exclusao on public.tarefas for delete to authenticated
  using (public.gere_departamento(departamento_id));

-- ============================================================================
-- Dados iniciais
-- ============================================================================

insert into public.departamentos (nome) values
  ('Fiscal'), ('Contábil'), ('Pessoal'), ('Societário'), ('Financeiro');

-- Feriados nacionais fixos de 2026 e 2027 (os móveis estão incluídos).
insert into public.feriados (data, descricao) values
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-02-16', 'Carnaval'),
  ('2026-02-17', 'Carnaval'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-06-04', 'Corpus Christi'),
  ('2026-09-07', 'Independência'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-11-20', 'Dia da Consciência Negra'),
  ('2026-12-25', 'Natal'),
  ('2027-01-01', 'Confraternização Universal'),
  ('2027-02-08', 'Carnaval'),
  ('2027-02-09', 'Carnaval'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'),
  ('2027-05-27', 'Corpus Christi'),
  ('2027-09-07', 'Independência'),
  ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'),
  ('2027-11-15', 'Proclamação da República'),
  ('2027-11-20', 'Dia da Consciência Negra'),
  ('2027-12-25', 'Natal');

-- Catálogo inicial — PRAZOS DE EXEMPLO: revisar com cada departamento.
insert into public.obrigacoes
  (nome, departamento_id, periodicidade, dia_vencimento, meses_apos, ajuste, meta_dias_antes, regimes)
select v.nome, d.id, v.periodicidade::public.periodicidade, v.dia, v.meses, v.ajuste::public.ajuste_dia_util, v.meta, v.regimes::public.regime[]
from (values
  ('DAS - Simples Nacional', 'Fiscal',     'mensal', 20, 1, 'posterga', 3, '{simples}'),
  ('DAS-MEI',                'Fiscal',     'mensal', 20, 1, 'posterga', 3, '{mei}'),
  ('EFD-Reinf',              'Fiscal',     'mensal', 15, 1, 'antecipa', 3, '{simples,presumido,real}'),
  ('EFD ICMS/IPI',           'Fiscal',     'mensal', 20, 1, 'antecipa', 3, '{presumido,real}'),
  ('EFD-Contribuições',      'Fiscal',     'mensal', 15, 2, 'antecipa', 5, '{presumido,real}'),
  ('Folha de pagamento / eSocial', 'Pessoal', 'mensal', 15, 1, 'antecipa', 3, '{simples,presumido,real}'),
  ('DCTFWeb',                'Pessoal',    'mensal', 15, 1, 'antecipa', 3, '{simples,presumido,real}'),
  ('FGTS Digital',           'Pessoal',    'mensal', 20, 1, 'antecipa', 3, '{simples,presumido,real}'),
  ('Balancete mensal',       'Contábil',   'mensal', 25, 1, 'antecipa', 0, '{presumido,real}'),
  ('DEFIS',                  'Fiscal',     'anual',  31, 3, 'antecipa', 10, '{simples}'),
  ('DASN-SIMEI',             'Fiscal',     'anual',  31, 5, 'antecipa', 10, '{mei}'),
  ('ECD',                    'Contábil',   'anual',  30, 6, 'antecipa', 15, '{presumido,real}'),
  ('ECF',                    'Contábil',   'anual',  31, 7, 'antecipa', 15, '{presumido,real}')
) as v(nome, dep, periodicidade, dia, meses, ajuste, meta, regimes)
join public.departamentos d on d.nome = v.dep;
