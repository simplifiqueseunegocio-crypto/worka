-- Alerta de mudança na situação da CND.
--
-- Quando uma consulta termina (regular ou pendente) com resultado diferente da
-- consulta anterior do mesmo cliente e certidão, nasce um alerta:
--   regular → pendente: o cliente passou a ter pendência (o caso importante)
--   pendente → regular: o cliente regularizou
-- Consultas com erro não contam: não dizem nada sobre a situação. A primeira
-- consulta de um cliente também não gera alerta (não há com o que comparar).
--
-- A automação "Alertas de CND" (/api/automacoes/alertas-cnd) envia por e-mail
-- os alertas ainda não notificados e marca notificado_em.

create table public.cnd_alertas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo public.cnd_tipo not null,
  de public.cnd_status not null check (de in ('regular', 'pendente')),
  para public.cnd_status not null check (para in ('regular', 'pendente')),
  consulta_id bigint not null unique references public.cnd_consultas (id) on delete cascade,
  mensagem text,
  criado_em timestamptz not null default now(),
  notificado_em timestamptz,
  check (de <> para)
);
create index on public.cnd_alertas (criado_em) where notificado_em is null;
create index on public.cnd_alertas (cliente_id, criado_em desc);

alter table public.cnd_alertas enable row level security;

create policy leitura on public.cnd_alertas for select to authenticated using (public.is_ativo());

create function public.tg_cnd_alerta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  anterior public.cnd_status;
begin
  if new.status not in ('regular', 'pendente') then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = new.status then
    return null;
  end if;

  select q.status into anterior
  from public.cnd_consultas q
  where q.cliente_id = new.cliente_id
    and q.tipo = new.tipo
    and q.id <> new.id
    and q.status in ('regular', 'pendente')
    and q.processada_em <= coalesce(new.processada_em, now())
  order by q.processada_em desc, q.id desc
  limit 1;

  if anterior is not null and anterior <> new.status then
    insert into public.cnd_alertas (cliente_id, tipo, de, para, consulta_id, mensagem)
    values (new.cliente_id, new.tipo, anterior, new.status, new.id, left(new.mensagem, 500))
    on conflict (consulta_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger cnd_alerta
  after insert or update of status on public.cnd_consultas
  for each row execute function public.tg_cnd_alerta();
