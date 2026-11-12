-- Novos leitores do pipeline de documentos (ver 20261112000100_documentos.sql):
--
-- nfse         NFS-e em PDF/foto (Fiscal)          → fiscal_nfse
-- guia         DAS, DARF, GPS, FGTS, boletos...      → guias
-- comprovante  comprovantes de pagamento (Contábil) → contabil_comprovantes
--
-- O comprovante confirmado é ligado à guia que ele paga (pelo código de barras
-- ou pelo valor); a guia fica com a data do pagamento (guias.pago_em), mantida
-- por trigger, para quem vê as guias sem ver os comprovantes.
--
-- Tudo o que a confirmação grava guarda o item de origem (origem_item_id):
-- "reabrir" a leitura apaga o que ela lançou.

-- Quem lê cada tipo (gestores e admins sempre). Igual ao campo
-- "departamentos" de cada tipo em src/lib/documentos/tipos.ts.
create or replace function public.pode_documento(p_tipo text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case p_tipo
    when 'atestado' then public.pode_ponto()  -- DP, gestores e admins
    when 'nfse' then public.is_gestor_ou_admin() or public.no_departamento('Fiscal')
    when 'guia' then public.is_gestor_ou_admin() or public.no_departamento('Fiscal')
      or public.no_departamento('Contábil') or public.no_departamento('Pessoal')
    when 'comprovante' then public.is_gestor_ou_admin() or public.no_departamento('Contábil')
      or public.no_departamento('Financeiro')
    else public.is_gestor_ou_admin()
  end
$$;

-- NFS-e: "prestada" quando o cliente é o prestador; "tomada" quando é o tomador.
create table public.fiscal_nfse (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  papel text not null check (papel in ('prestada', 'tomada')),
  numero text not null,
  codigo_verificacao text,
  emitida_em date not null,
  competencia date,
  municipio text,
  prestador_documento text not null check (prestador_documento ~ '^(\d{11}|\d{14})$'),
  prestador_nome text,
  tomador_documento text check (tomador_documento ~ '^(\d{11}|\d{14})$'),
  tomador_nome text,
  codigo_servico text,
  discriminacao text,
  valor_servicos numeric(14, 2) not null check (valor_servicos >= 0),
  deducoes numeric(14, 2),
  desconto_incondicionado numeric(14, 2),
  base_calculo numeric(14, 2),
  aliquota_iss numeric(7, 4),
  valor_iss numeric(14, 2),
  iss_retido boolean not null default false,
  valor_pis numeric(14, 2),
  valor_cofins numeric(14, 2),
  valor_csll numeric(14, 2),
  valor_irrf numeric(14, 2),
  valor_inss numeric(14, 2),
  valor_liquido numeric(14, 2),
  origem_item_id uuid references public.documentos_itens (id) on delete set null,
  criado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (cliente_id, prestador_documento, numero)
);
create index on public.fiscal_nfse (cliente_id, competencia);
create index on public.fiscal_nfse (origem_item_id);

create table public.guias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo text not null check (tipo in ('das', 'darf', 'gps', 'fgts', 'dae', 'gare', 'boleto', 'outro')),
  contribuinte_documento text check (contribuinte_documento ~ '^(\d{11}|\d{14})$'),
  codigo_receita text,
  periodo date,                          -- primeiro dia do mês de apuração
  vencimento date not null,
  valor_principal numeric(14, 2),
  valor_multa numeric(14, 2),
  valor_juros numeric(14, 2),
  valor_total numeric(14, 2) not null check (valor_total > 0),
  codigo_barras text check (codigo_barras ~ '^\d{44}$'),
  numero_documento text,
  pago_em date,                          -- do comprovante ligado (trigger)
  origem_item_id uuid references public.documentos_itens (id) on delete set null,
  criado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  -- Mesma guia (mesmo código) não entra duas vezes; sem código, não há como saber.
  unique (cliente_id, tipo, codigo_barras)
);
create index on public.guias (cliente_id, vencimento);
create index on public.guias (vencimento) where pago_em is null;
create index on public.guias (origem_item_id);

create table public.contabil_comprovantes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  pago_em date not null,
  valor numeric(14, 2) not null check (valor > 0),
  forma text not null default 'outro'
    check (forma in ('pix', 'boleto', 'tributo', 'ted', 'transferencia', 'cartao', 'outro')),
  beneficiario_nome text,
  beneficiario_documento text check (beneficiario_documento ~ '^(\d{11}|\d{14})$'),
  pagador_nome text,
  pagador_documento text check (pagador_documento ~ '^(\d{11}|\d{14})$'),
  banco text,
  autenticacao text,
  codigo_barras text check (codigo_barras ~ '^\d{44}$'),
  descricao text,
  guia_id uuid references public.guias (id) on delete set null,
  origem_item_id uuid references public.documentos_itens (id) on delete set null,
  criado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  -- O mesmo pagamento (mesma autenticação) não entra duas vezes.
  unique (cliente_id, autenticacao)
);
create index on public.contabil_comprovantes (guia_id);
create index on public.contabil_comprovantes (cliente_id, pago_em);
create index on public.contabil_comprovantes (origem_item_id);

-- guias.pago_em acompanha os comprovantes ligados (o primeiro pagamento).
create function public.atualizar_pagamento_guia()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_guia uuid;
begin
  foreach v_guia in array array_remove(array[
    case when tg_op <> 'INSERT' then old.guia_id end,
    case when tg_op <> 'DELETE' then new.guia_id end
  ], null) loop
    update public.guias g
       set pago_em = (select min(c.pago_em) from public.contabil_comprovantes c where c.guia_id = v_guia)
     where g.id = v_guia;
  end loop;
  return null;
end
$$;
create trigger pagamento_guia
after insert or update of guia_id, pago_em or delete on public.contabil_comprovantes
for each row execute function public.atualizar_pagamento_guia();

alter table public.fiscal_nfse enable row level security;
alter table public.guias enable row level security;
alter table public.contabil_comprovantes enable row level security;

create policy fiscal on public.fiscal_nfse for all to authenticated
  using (public.pode_documento('nfse')) with check (public.pode_documento('nfse'));

-- Guias: quem lê guias grava; quem lê comprovantes também vê (para a baixa).
create policy leitura on public.guias for select to authenticated
  using (public.pode_documento('guia') or public.pode_documento('comprovante'));
create policy inclusao on public.guias for insert to authenticated
  with check (public.pode_documento('guia'));
create policy alteracao on public.guias for update to authenticated
  using (public.pode_documento('guia')) with check (public.pode_documento('guia'));
create policy exclusao on public.guias for delete to authenticated
  using (public.pode_documento('guia'));

create policy contabil on public.contabil_comprovantes for all to authenticated
  using (public.pode_documento('comprovante')) with check (public.pode_documento('comprovante'));
