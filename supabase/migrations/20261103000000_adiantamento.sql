-- Folha de adiantamento: o Departamento Pessoal gera o PDF no Domínio Folha,
-- envia pela plataforma e ela manda por e-mail aos contatos do cliente.
-- O PDF não fica guardado: cada envio é registrado em adiantamento_envios.

-- Contatos marcados recebem a folha. Sem nenhum marcado, vale o e-mail do
-- cadastro do cliente (vindo do Domínio).
alter table public.cliente_contatos
  add column recebe_adiantamento boolean not null default false;

-- Admin, ou usuário ativo ligado ao departamento (qualquer papel).
create function public.no_departamento(dep_nome text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or (
    public.is_ativo()
    and exists (
      select 1
      from public.profile_departamentos pd
      join public.departamentos d on d.id = pd.departamento_id
      where pd.profile_id = auth.uid() and d.nome = dep_nome
    )
  )
$$;

-- O Pessoal também cadastra os contatos que recebem a folha.
create policy pessoal on public.cliente_contatos for all to authenticated
  using (public.no_departamento('Pessoal'))
  with check (public.no_departamento('Pessoal'));

create table public.adiantamento_envios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),
  arquivo_nome text not null,
  arquivo_bytes integer not null check (arquivo_bytes > 0),
  destinatarios text[] not null,
  email_id text,   -- id do Resend; nulo quando o envio falhou
  erro text,
  enviado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  enviado_em timestamptz not null default now(),
  check ((email_id is null) <> (erro is null))
);
create index on public.adiantamento_envios (competencia, cliente_id);

alter table public.adiantamento_envios enable row level security;

create policy leitura on public.adiantamento_envios for select to authenticated
  using (public.is_ativo());
-- Registro imutável: só inclusão, pelo próprio usuário, do Pessoal ou admin.
create policy envio on public.adiantamento_envios for insert to authenticated
  with check (public.no_departamento('Pessoal') and enviado_por = auth.uid());
