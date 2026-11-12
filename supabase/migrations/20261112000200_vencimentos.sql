-- Monitor de vencimentos: certificados digitais dos clientes, alvarás,
-- licenças, procurações... cadastrados com a data de vencimento. A automação
-- diária (api/automacoes/monitor-vencimentos) avisa por e-mail em marcos:
-- "avisar_dias" antes, 15, 7 e 1 dia antes, no dia e quando vence.
-- Cada marco é avisado uma vez (ultimo_marco); renovar (nova data) zera.
--
-- cliente_id nulo = item do próprio escritório (avisa gestores e admins).

create table public.vencimentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes (id) on delete cascade,
  tipo text not null check (tipo in ('certificado_digital', 'alvara', 'licenca', 'procuracao', 'contrato', 'outro')),
  descricao text not null check (length(trim(descricao)) between 1 and 200),
  identificador text check (length(identificador) <= 200),  -- nº do alvará, titular do certificado...
  vence_em date not null,
  avisar_dias integer not null default 30 check (avisar_dias between 1 and 180),
  observacao text check (length(observacao) <= 1000),
  ativo boolean not null default true,  -- false: arquivado (não avisa mais)
  ultimo_marco integer,                  -- menor marco já avisado (dias antes; -1 = vencido)
  ultimo_aviso_em timestamptz,
  criado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.vencimentos (vence_em) where ativo;
create index on public.vencimentos (cliente_id);

-- Data nova (renovação) volta a avisar desde o primeiro marco.
create function public.tg_vencimentos_renovacao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.vence_em is distinct from old.vence_em then
    new.ultimo_marco := null;
    new.ultimo_aviso_em := null;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger vencimentos_renovacao before update on public.vencimentos
  for each row execute function public.tg_vencimentos_renovacao();

alter table public.vencimentos enable row level security;
create policy leitura on public.vencimentos for select to authenticated using (public.is_ativo());
create policy cadastro on public.vencimentos for insert to authenticated with check (public.is_ativo());
create policy edicao on public.vencimentos for update to authenticated using (public.is_ativo()) with check (public.is_ativo());
create policy exclusao on public.vencimentos for delete to authenticated using (public.is_gestor_ou_admin());
