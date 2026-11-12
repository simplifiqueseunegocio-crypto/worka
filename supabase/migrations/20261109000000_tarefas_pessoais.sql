-- Tarefas pessoais: lembretes que cada pessoa cria para si, fora do catálogo
-- de obrigações. Só o dono vê e altera (nem o admin acessa).
--
-- Repetição mensal ou anual: ao concluir, nasce a próxima ocorrência, no mesmo
-- dia do mês seguinte (ou do ano seguinte). Em meses mais curtos vale o último
-- dia (31/01 → 28/02 → 31/03), guardado em dia_base para não "escorregar".

create table public.tarefas_pessoais (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) between 1 and 200),
  descricao text check (length(descricao) <= 2000),
  cliente_id uuid references public.clientes (id) on delete set null,
  prazo date not null,
  recorrencia text not null default 'nenhuma' check (recorrencia in ('nenhuma', 'mensal', 'anual')),
  dia_base smallint not null default 1 check (dia_base between 1 and 31),
  concluida_em timestamptz,
  anterior_id uuid unique references public.tarefas_pessoais (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.tarefas_pessoais (dono_id, concluida_em, prazo);

-- dia_base acompanha o prazo escolhido pela pessoa (na criação e quando ela muda o prazo).
create function public.tg_tarefas_pessoais_dia_base()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.anterior_id is not null then
    return new; -- ocorrência gerada: mantém o dia_base herdado
  end if;
  if tg_op = 'INSERT' or new.prazo is distinct from old.prazo then
    new.dia_base := extract(day from new.prazo);
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger tarefas_pessoais_dia_base before insert or update on public.tarefas_pessoais
  for each row execute function public.tg_tarefas_pessoais_dia_base();

-- Próximo prazo de uma repetição: o mesmo dia_base no mês (ou ano) seguinte,
-- limitado ao último dia do mês.
create function public.proximo_prazo_pessoal(p_prazo date, p_recorrencia text, p_dia_base smallint)
returns date
language sql immutable set search_path = ''
as $$
  select least(
    (inicio + (p_dia_base - 1))::date,
    ((inicio + interval '1 month')::date - 1)
  )
  from (
    select (date_trunc('month', p_prazo)
      + case p_recorrencia when 'anual' then interval '1 year' else interval '1 month' end)::date as inicio
  ) m
$$;

-- Ao concluir uma tarefa que se repete, cria a próxima (uma só, mesmo que a
-- pessoa reabra e conclua de novo: anterior_id é único).
create function public.tg_tarefas_pessoais_repetir()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.recorrencia <> 'nenhuma' and new.concluida_em is not null and old.concluida_em is null then
    insert into public.tarefas_pessoais
      (dono_id, titulo, descricao, cliente_id, prazo, recorrencia, dia_base, anterior_id)
    values
      (new.dono_id, new.titulo, new.descricao, new.cliente_id,
       public.proximo_prazo_pessoal(new.prazo, new.recorrencia, new.dia_base),
       new.recorrencia, new.dia_base, new.id)
    on conflict (anterior_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger tarefas_pessoais_repetir after update on public.tarefas_pessoais
  for each row execute function public.tg_tarefas_pessoais_repetir();

alter table public.tarefas_pessoais enable row level security;

create policy dono on public.tarefas_pessoais for all to authenticated
  using (public.is_ativo() and dono_id = auth.uid())
  with check (public.is_ativo() and dono_id = auth.uid());
