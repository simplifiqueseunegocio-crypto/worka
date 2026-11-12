-- Leitura de documentos (pipeline genérico): o DP/fiscal/contábil envia o
-- documento, a IA extrai os campos do tipo (atestado, NFS-e, contrato...), as
-- regras do tipo apontam o que conferir, alguém confere e confirma, e a
-- confirmação grava o resultado no lugar certo (ex.: atestado → afastamento).
--
-- documentos_leituras  um envio (um ou mais arquivos) de um tipo
-- documentos_itens     cada documento extraído (campos em jsonb, editáveis)
-- pessoal_afastamentos afastamentos lançados a partir dos atestados
--
-- O primeiro tipo é "atestado" (Departamento Pessoal). Atestado tem dado de
-- saúde: a extração não pede nem guarda CID ou diagnóstico.
-- Arquivos no bucket privado "documentos" (sem política: só o servidor).

-- Quem lê cada tipo. Tipo novo entra aqui.
create function public.pode_documento(p_tipo text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case p_tipo
    when 'atestado' then public.pode_ponto()  -- DP, gestores e admins
    else public.is_gestor_ou_admin()
  end
$$;

create table public.documentos_leituras (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo ~ '^[a-z_]+$'),
  cliente_id uuid references public.clientes (id) on delete set null,
  status text not null default 'enviando'
    check (status in ('enviando', 'lendo', 'conferir', 'confirmada', 'erro')),
  mensagem text,
  arquivos jsonb not null default '[]',  -- [{ path, nome, tipo, bytes }]
  paginas_total integer not null default 0,
  paginas_lidas integer not null default 0,
  enviada_por uuid references public.profiles (id) on delete set null default auth.uid(),
  enviada_em timestamptz not null default now(),
  lida_em timestamptz,
  confirmada_por uuid references public.profiles (id) on delete set null,
  confirmada_em timestamptz
);
create index on public.documentos_leituras (tipo, enviada_em desc);

create table public.documentos_itens (
  id uuid primary key default gen_random_uuid(),
  leitura_id uuid not null references public.documentos_leituras (id) on delete cascade,
  ordem integer not null default 0,
  dados jsonb not null,                -- campos do tipo, como extraídos/corrigidos
  origem jsonb,                        -- { arquivo, pagina } de onde veio
  funcionario_id uuid references public.ponto_funcionarios (id) on delete set null,
  conferido boolean not null default false,
  conferido_por uuid references public.profiles (id) on delete set null,
  conferido_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index on public.documentos_itens (leitura_id, ordem);

create table public.pessoal_afastamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  funcionario_id uuid not null references public.ponto_funcionarios (id) on delete cascade,
  tipo text not null default 'atestado' check (tipo in ('atestado', 'comparecimento')),
  inicio date not null,
  fim date not null check (fim >= inicio),
  dias integer check (dias > 0),
  hora_inicio time,
  hora_fim time,
  medico text,
  crm text,
  origem_item_id uuid references public.documentos_itens (id) on delete set null,
  criado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (funcionario_id, tipo, inicio)
);
create index on public.pessoal_afastamentos (cliente_id, inicio);

alter table public.documentos_leituras enable row level security;
alter table public.documentos_itens enable row level security;
alter table public.pessoal_afastamentos enable row level security;
create policy leitor on public.documentos_leituras for all to authenticated
  using (public.pode_documento(tipo)) with check (public.pode_documento(tipo));
create policy leitor on public.documentos_itens for all to authenticated
  using (exists (select 1 from public.documentos_leituras l where l.id = leitura_id and public.pode_documento(l.tipo)))
  with check (exists (select 1 from public.documentos_leituras l where l.id = leitura_id and public.pode_documento(l.tipo)));
create policy dp on public.pessoal_afastamentos for all to authenticated
  using (public.pode_ponto()) with check (public.pode_ponto());

insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false)
on conflict (id) do nothing;
