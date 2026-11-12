-- Histórico das automações da plataforma (resumo diário por e-mail e as que
-- vierem depois). Cada execução grava uma linha; quem grava é a rota do
-- servidor com a chave secreta, então não há política de inclusão.
--
-- referencia: o dia (ou competência) a que a execução se refere. Serve para
-- não repetir o envio do mesmo dia quando o agendador chama duas vezes.

create table public.automacao_execucoes (
  id bigint generated always as identity primary key,
  automacao text not null check (automacao ~ '^[a-z0-9_]+$'),
  referencia date not null,
  status text not null check (status in ('sucesso', 'parcial', 'erro', 'ignorado')),
  origem text not null default 'agendada',
  iniciado_em timestamptz not null default now(),
  duracao_ms integer,
  enviados integer not null default 0,
  falhas integer not null default 0,
  mensagem text,
  detalhes jsonb
);
create index on public.automacao_execucoes (automacao, iniciado_em desc);

alter table public.automacao_execucoes enable row level security;

create policy leitura on public.automacao_execucoes for select to authenticated
  using (public.is_gestor_ou_admin());
