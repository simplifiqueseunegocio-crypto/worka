-- Dados das automações: lembrete de cobrança, CND perto de vencer e
-- conferência cadastral na Receita. O alerta de atraso para o gestor usa só
-- o que já existe em tarefas.

-- ============================================================================
-- Lembrete de cobrança: desde quando a tarefa espera o cliente
-- ============================================================================

alter table public.tarefas add column aguardando_desde timestamptz;

-- Tarefas que já estão aguardando: a melhor estimativa é a última alteração.
update public.tarefas set aguardando_desde = atualizado_em where status = 'aguardando_cliente';

create function public.tg_tarefas_aguardando()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'aguardando_cliente' then
    if tg_op = 'INSERT' or old.status is distinct from 'aguardando_cliente' then
      new.aguardando_desde := now();
    end if;
  else
    new.aguardando_desde := null;
  end if;
  return new;
end;
$$;

create trigger tarefas_aguardando before insert or update of status on public.tarefas
  for each row execute function public.tg_tarefas_aguardando();

-- Um lembrete por tarefa e envio, para repetir a cada N dias úteis.
create table public.tarefa_lembretes (
  id bigint generated always as identity primary key,
  tarefa_id uuid not null references public.tarefas (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  enviado_em timestamptz not null default now()
);
create index on public.tarefa_lembretes (tarefa_id, enviado_em desc);

alter table public.tarefa_lembretes enable row level security;
create policy leitura on public.tarefa_lembretes for select to authenticated using (public.is_gestor_ou_admin());

-- ============================================================================
-- CND perto de vencer: aviso enviado uma vez por certidão lançada
-- ============================================================================

alter table public.certidoes add column aviso_vencimento_em timestamptz;
create index on public.certidoes (valida_ate) where aviso_vencimento_em is null;

-- ============================================================================
-- Conferência na Receita (BrasilAPI)
-- ============================================================================

-- Última foto cadastral de cada cliente, para comparar com a próxima.
create table public.cliente_receita (
  cliente_id uuid primary key references public.clientes (id) on delete cascade,
  verificado_em timestamptz not null default now(),
  situacao text,
  data_situacao date,
  cnae integer,
  cnae_descricao text,
  endereco text,
  simples boolean,
  mei boolean,
  erro text  -- última falha na consulta (a foto anterior é mantida)
);
create index on public.cliente_receita (verificado_em);

alter table public.cliente_receita enable row level security;
create policy leitura on public.cliente_receita for select to authenticated using (public.is_ativo());

create table public.receita_alertas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  campo text not null check (campo in ('situacao', 'cnae', 'endereco', 'simples', 'mei')),
  de text,
  para text,
  criado_em timestamptz not null default now(),
  notificado_em timestamptz
);
create index on public.receita_alertas (criado_em) where notificado_em is null;
create index on public.receita_alertas (cliente_id, criado_em desc);

alter table public.receita_alertas enable row level security;
create policy leitura on public.receita_alertas for select to authenticated using (public.is_ativo());
