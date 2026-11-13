-- Conta Azul: uma conexão por cliente (substitui a conexão única de 20261113000000).
--
-- Cada empresa cliente tem a sua Conta Azul Pro. O escritório entra em cada
-- uma com um usuário próprio (um e-mail por empresa: a Conta Azul não aceita o
-- mesmo e-mail em duas contas Pro) e autoriza o app. A plataforma guarda os
-- tokens de cada cliente e, todo dia, lê o cadastro da empresa e os clientes e
-- fornecedores dela.
--
-- Conectar uma empresa cria o cliente na plataforma (ou vincula ao que já
-- existe com o mesmo CNPJ/CPF). A sincronização não suspende nem apaga clientes:
-- desconectar só para a atualização.

-- ============================================================================
-- Sai o modelo de conexão única
-- ============================================================================

drop function if exists public.sincronizar_clientes_conta_azul(jsonb, boolean);
drop table if exists public.conta_azul_conexao;

-- A saída automática (suspender + apagar tarefas em aberto) volta a valer só
-- para o histórico do Domínio.
create or replace function public.tg_clientes_fora_dominio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'ativo'
     and new.status <> 'ativo'
     and new.codigo_dominio is not null
     and not new.status_manual then
    delete from public.tarefas
    where cliente_id = new.id
      and status in ('pendente', 'em_andamento', 'aguardando_cliente');
  end if;
  return null;
end;
$$;

-- A integração do Domínio foi desligada: nenhum cliente "ainda vem" de uma
-- sincronização que recriaria o cadastro, então excluir volta a depender só
-- do status. (Nome mantido: lib/clientes.ts chama esta função.)
create or replace function public.cliente_no_dominio(p_cliente_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select false
$$;

create or replace function public.tg_clientes_exclusao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'ativo' then
    raise exception 'Suspenda ou encerre o cliente antes de excluir' using errcode = '23514';
  end if;
  return old;
end;
$$;

alter table public.clientes drop column if exists conta_azul_id;

-- ============================================================================
-- Conexões (uma por cliente)
-- ============================================================================
-- O refresh_token muda a cada renovação, por isso fica no banco. Só o servidor
-- (service_role) lê e grava: RLS ligada e nenhuma policy.

create table public.conta_azul_conexoes (
  cliente_id uuid primary key references public.clientes (id) on delete cascade,
  access_token text,
  refresh_token text not null,
  expira_em timestamptz,
  empresa_nome text,
  empresa_documento text,
  conectado_por uuid references public.profiles (id) on delete set null,
  conectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  sincronizado_em timestamptz,
  ultimo_erro text
);

create index on public.conta_azul_conexoes (sincronizado_em nulls first);

alter table public.conta_azul_conexoes enable row level security;
revoke all on table public.conta_azul_conexoes from anon, authenticated;

-- ============================================================================
-- Clientes e fornecedores de cada empresa (lidos da Conta Azul Pro dela)
-- ============================================================================

create table public.conta_azul_pessoas (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  id text not null,                         -- id da pessoa na Conta Azul
  nome text not null,
  documento text,
  email text,
  telefone text,
  tipo_pessoa text,                         -- Física, Jurídica ou Estrangeira
  perfis text[] not null default '{}',      -- Cliente, Fornecedor, Transportadora
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, id)
);

alter table public.conta_azul_pessoas enable row level security;
-- A equipe lê; só a sincronização (service_role) grava.
create policy leitura on public.conta_azul_pessoas for select to authenticated using (public.is_ativo());
