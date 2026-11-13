-- Conta Azul, etapa 2: financeiro, vendas e notas de cada cliente conectado.
--
-- A sincronização diária (lib/integracoes/conta-azul.ts) regrava, por cliente:
--   * conta_azul_parcelas: contas a receber e a pagar EM ABERTO (inclui atrasadas
--     e parcialmente pagas), com vencimento nos últimos ~11 meses até 30 dias à frente;
--   * conta_azul_contas: contas financeiras ativas e o saldo atual de cada uma;
--   * conta_azul_mensal: vendas, NFS-e e NF-e dos últimos 3 meses (totais por mês).
-- A equipe lê; só a sincronização (service_role) grava.

create table public.conta_azul_parcelas (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo text not null check (tipo in ('receber', 'pagar')),
  id text not null,                 -- id da parcela na Conta Azul
  descricao text,
  contraparte text,                 -- cliente (a receber) ou fornecedor (a pagar)
  vencimento date,
  competencia date,
  total numeric(14, 2) not null default 0,
  pago numeric(14, 2) not null default 0,
  nao_pago numeric(14, 2) not null default 0,
  status text,                      -- status traduzido da Conta Azul
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, tipo, id)
);
create index on public.conta_azul_parcelas (cliente_id, tipo, vencimento);

create table public.conta_azul_contas (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  id text not null,
  nome text not null,
  tipo text,                        -- CONTA_CORRENTE, POUPANCA, CARTAO_CREDITO...
  banco text,
  saldo numeric(14, 2),
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, id)
);

create table public.conta_azul_mensal (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  competencia date not null,        -- primeiro dia do mês
  vendas_total numeric(14, 2),      -- vendas aprovadas no mês
  vendas_qtd integer,
  nfse_total numeric(14, 2),        -- NFS-e emitidas no mês
  nfse_qtd integer,
  nfe_qtd integer,                  -- NF-e emitidas no mês (a API não traz o valor na lista)
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, competencia)
);

alter table public.conta_azul_parcelas enable row level security;
alter table public.conta_azul_contas enable row level security;
alter table public.conta_azul_mensal enable row level security;
create policy leitura on public.conta_azul_parcelas for select to authenticated using (public.is_ativo());
create policy leitura on public.conta_azul_contas for select to authenticated using (public.is_ativo());
create policy leitura on public.conta_azul_mensal for select to authenticated using (public.is_ativo());
