-- Leitura de ficha ponto (Automações). O DP envia a ficha (PDF, foto, imagem),
-- a IA transcreve as marcações e o DP confere e confirma na tela.
--
-- ponto_leituras     um envio (um ou mais arquivos), com o andamento da leitura
-- ponto_fichas       uma ficha por funcionário: jornada, dias e marcações (jsonb)
-- ponto_funcionarios cadastro mínimo por cliente, criado na confirmação
--
-- Os dias ficam em jsonb na ficha (uma linha por funcionário por mês), não uma
-- linha por dia: leve para o banco e fácil de editar na conferência.
-- Os arquivos ficam no bucket privado "ponto" (sem política: só o servidor).
-- Acesso: Departamento Pessoal, gestores e admins (fichas têm CPF e atestados).

create function public.pode_ponto()
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_gestor_ou_admin() or public.no_departamento('Pessoal') $$;

create table public.ponto_funcionarios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text not null,
  cpf text check (cpf ~ '^\d{11}$'),
  cargo text,
  criado_em timestamptz not null default now(),
  unique (cliente_id, cpf)
);
create index on public.ponto_funcionarios (cliente_id);

create table public.ponto_leituras (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes (id) on delete set null,
  competencia date check (competencia = date_trunc('month', competencia)::date),
  status text not null default 'enviando'
    check (status in ('enviando', 'lendo', 'conferir', 'confirmada', 'erro')),
  mensagem text,
  arquivos jsonb not null default '[]',  -- [{ path, nome, tipo, bytes }]
  paginas_total integer not null default 0,
  paginas_lidas integer not null default 0,
  empresa_lida text,                      -- como veio na ficha
  documento_lido text,                    -- CNPJ/CPF do empregador, só dígitos
  enviada_por uuid references public.profiles (id) on delete set null default auth.uid(),
  enviada_em timestamptz not null default now(),
  lida_em timestamptz,
  confirmada_por uuid references public.profiles (id) on delete set null,
  confirmada_em timestamptz
);
create index on public.ponto_leituras (enviada_em desc);
create index on public.ponto_leituras (cliente_id, competencia);

create table public.ponto_fichas (
  id uuid primary key default gen_random_uuid(),
  leitura_id uuid not null references public.ponto_leituras (id) on delete cascade,
  funcionario_id uuid references public.ponto_funcionarios (id) on delete set null,
  ordem integer not null default 0,
  nome text not null,
  cpf text,
  cargo text,
  admissao date,
  jornada jsonb not null default '[]',        -- [{ dia, entrada, saida, intervalo_inicio, intervalo_fim, carga }]
  dias jsonb not null default '[]',           -- [{ data, marcacoes: [{ hora, manual }], ocorrencia, observacao, duvida }]
  totais_origem jsonb not null default '[]',  -- totais impressos pelo sistema de ponto: [{ rotulo, valor }]
  observacoes text,
  conferida boolean not null default false,
  conferida_por uuid references public.profiles (id) on delete set null,
  conferida_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index on public.ponto_fichas (leitura_id, ordem);
create index on public.ponto_fichas (funcionario_id);

alter table public.ponto_funcionarios enable row level security;
alter table public.ponto_leituras enable row level security;
alter table public.ponto_fichas enable row level security;
create policy dp on public.ponto_funcionarios for all to authenticated using (public.pode_ponto()) with check (public.pode_ponto());
create policy dp on public.ponto_leituras for all to authenticated using (public.pode_ponto()) with check (public.pode_ponto());
create policy dp on public.ponto_fichas for all to authenticated using (public.pode_ponto()) with check (public.pode_ponto());

insert into storage.buckets (id, name, public) values ('ponto', 'ponto', false)
on conflict (id) do nothing;
