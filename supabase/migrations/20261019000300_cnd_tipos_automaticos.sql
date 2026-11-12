-- CND: quais certidões a rodada coloca na fila.
--
-- Só entram na fila os tipos com uma rotina automática funcionando. Os demais
-- (sites com captcha ou login) ficam de fora, para não ficarem "na fila" para
-- sempre na tela. Ligar um tipo: update cnd_tipos set automatico = true where tipo = '...'.

create table public.cnd_tipos (
  tipo public.cnd_tipo primary key,
  automatico boolean not null default false,
  observacao text
);

insert into public.cnd_tipos (tipo, automatico, observacao) values
  ('federal', true, 'Tarefa agendada do Claude no navegador do app (rotina-federal.md)'),
  ('fgts', false, 'Rotina pronta no Claude in Chrome (rotina-fgts.md), falta validar'),
  ('trabalhista', false, 'Site do TST exige captcha de imagem em toda consulta'),
  ('estadual', false, 'SEFAZ-SP (SIDEB) exige login gov.br'),
  ('municipal', false, 'Rio Preto exige reCAPTCHA ou login no Portal Cidadão');

alter table public.cnd_tipos enable row level security;
create policy leitura on public.cnd_tipos for select to authenticated using (public.is_ativo());
create policy admin on public.cnd_tipos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.enfileirar_cnd_interno(
  p_cliente_id uuid default null,
  p_origem text default 'agendada',
  p_solicitante uuid default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  qtd integer;
begin
  insert into public.cnd_consultas (cliente_id, tipo, origem, solicitada_por)
  select c.id, t.tipo, p_origem, p_solicitante
  from public.clientes c
  cross join public.cnd_tipos t
  where t.automatico
    and c.status = 'ativo'
    and c.busca_cnd
    and (p_cliente_id is null or c.id = p_cliente_id)
  on conflict (cliente_id, tipo) where status in ('na_fila', 'processando') do nothing;

  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

revoke execute on function public.enfileirar_cnd_interno(uuid, text, uuid) from public, anon, authenticated;
