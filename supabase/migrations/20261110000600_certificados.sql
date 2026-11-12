-- Certificado digital A1 da MCONT (.pfx), guardado na plataforma para a equipe
-- baixar quando precisar (ex.: instalar no computador, robô do DET).
--
-- A SENHA NÃO É GUARDADA: só o arquivo. Sem a senha, o .pfx não serve.
--
-- O arquivo fica no bucket privado "certificados", sem política de acesso para
-- a equipe: quem lê e grava é só o servidor (chave secreta), depois de checar o
-- usuário. Cada download é registrado em certificado_downloads.

create table public.certificados (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 1 and 120),
  valido_ate date not null,
  arquivo_path text not null unique,
  arquivo_nome text not null,
  arquivo_bytes integer not null check (arquivo_bytes between 1 and 102400),
  observacao text check (length(observacao) <= 500),
  enviado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  enviado_em timestamptz not null default now()
);
create index on public.certificados (enviado_em desc);

alter table public.certificados enable row level security;
create policy leitura on public.certificados for select to authenticated using (public.is_ativo());
create policy inclusao on public.certificados for insert to authenticated
  with check (public.is_admin() and enviado_por = auth.uid());
create policy exclusao on public.certificados for delete to authenticated using (public.is_admin());

create table public.certificado_downloads (
  id bigint generated always as identity primary key,
  certificado_id uuid references public.certificados (id) on delete set null,
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  baixado_em timestamptz not null default now()
);
create index on public.certificado_downloads (baixado_em desc);

alter table public.certificado_downloads enable row level security;
-- Cada um registra o próprio download; só o admin vê o registro de todos.
create policy registro on public.certificado_downloads for insert to authenticated
  with check (public.is_ativo() and profile_id = auth.uid());
create policy leitura on public.certificado_downloads for select to authenticated
  using (public.is_admin() or profile_id = auth.uid());

insert into storage.buckets (id, name, public) values ('certificados', 'certificados', false)
on conflict (id) do nothing;
