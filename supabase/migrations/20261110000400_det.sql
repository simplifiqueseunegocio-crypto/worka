-- Robô do DET (consignado / Crédito do Trabalhador).
--
-- Mesmo molde da fila de CND: a plataforma enfileira os clientes ativos, o robô
-- do computador do escritório (integracoes/det) reserva lotes pela API, lê só a
-- LISTA da Caixa Postal de cada empresa no DET (nunca abre mensagem: abrir
-- registra ciência) e devolve o resultado.
--
--   det_consultas: fila e histórico (na_fila → processando → concluida |
--                  sem_procuracao | erro)
--   det_avisos:    mensagens vistas na lista. A mesma mensagem aparece em toda
--                  leitura (ninguém abre), então a chave natural evita duplicar.
--
-- Aviso novo de consignado vira tarefa para o responsável do DP do cliente, na
-- obrigação de sistema "Desconto de consignado (DET)", competência do desconto.
-- "Sem procuração" fica como pendência na consulta e aparece em Automações.

-- ============================================================================
-- Obrigação de sistema
-- ============================================================================

-- Obrigação de sistema: as tarefas nascem de uma automação, nunca da geração
-- mensal. Sem regimes, não é vinculada a nenhum cliente.
alter table public.obrigacoes add column sistema boolean not null default false;
alter table public.obrigacoes add constraint obrigacoes_sistema_sem_regime check (not sistema or regimes = '{}');

-- Prazo: último dia útil do mês da competência (dia 31 limitado ao fim do mês,
-- meses_apos 0, antecipa), com meta interna 5 dias antes.
insert into public.obrigacoes (nome, departamento_id, periodicidade, dia_vencimento, meses_apos, ajuste, meta_dias_antes, regimes, sistema)
select 'Desconto de consignado (DET)', d.id, 'mensal', 31, 0, 'antecipa', 5, '{}', true
from public.departamentos d
where d.nome = 'Pessoal';

-- ============================================================================
-- Fila
-- ============================================================================

create table public.det_consultas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1), -- mês da rodada
  status text not null default 'na_fila'
    check (status in ('na_fila', 'processando', 'concluida', 'sem_procuracao', 'erro')),
  origem text not null default 'agendada',
  solicitada_em timestamptz not null default now(),
  disponivel_em timestamptz not null default now(),
  iniciada_em timestamptz,
  processada_em timestamptz,
  tentativas smallint not null default 0,
  mensagem text,
  avisos smallint,       -- mensagens na lista na última leitura
  nao_lidas smallint
);
create unique index det_consultas_em_aberto on public.det_consultas (cliente_id) where status in ('na_fila', 'processando');
create index on public.det_consultas (solicitada_em) where status in ('na_fila', 'processando');
create index on public.det_consultas (cliente_id, processada_em desc);

alter table public.det_consultas enable row level security;
create policy leitura on public.det_consultas for select to authenticated using (public.is_ativo());

create table public.det_avisos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  consulta_id bigint references public.det_consultas (id) on delete set null,
  enviada_em date not null,          -- data da mensagem na Caixa Postal
  assunto text not null,
  periodo_averbacao text,
  competencia_desconto date check (competencia_desconto is null or extract(day from competencia_desconto) = 1),
  lida boolean,
  consignado boolean not null,
  tarefa_id uuid references public.tarefas (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (cliente_id, enviada_em, assunto)
);
create index on public.det_avisos (criado_em desc);

alter table public.det_avisos enable row level security;
create policy leitura on public.det_avisos for select to authenticated using (public.is_ativo());

-- ============================================================================
-- Funções (só a API do robô e o cron chamam)
-- ============================================================================

-- Coloca na fila os clientes ativos (ou um só) para a competência do mês.
create function public.enfileirar_det_interno(p_cliente_id uuid default null, p_origem text default 'agendada')
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  qtd integer;
begin
  insert into public.det_consultas (cliente_id, competencia, origem)
  select c.id, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, p_origem
  from public.clientes c
  where c.status = 'ativo'
    and (p_cliente_id is null or c.id = p_cliente_id)
  on conflict (cliente_id) where status in ('na_fila', 'processando') do nothing;
  get diagnostics qtd = row_count;
  return qtd;
end;
$$;

-- Reserva um lote. Reserva esquecida há 15 minutos volta a ser reservável.
create function public.reservar_det(p_limite integer default 10)
returns table (id bigint, tentativas smallint, competencia date, cliente_id uuid, documento text, tipo_inscricao smallint, razao_social text)
language sql security definer set search_path = ''
as $$
  with lote as (
    select q.id
    from public.det_consultas q
    where (q.status = 'na_fila' and q.disponivel_em <= now())
       or (q.status = 'processando' and q.iniciada_em < now() - interval '15 minutes')
    order by q.solicitada_em, q.id
    limit least(greatest(p_limite, 1), 50)
    for update skip locked
  ),
  reservadas as (
    update public.det_consultas q
    set status = 'processando', iniciada_em = now(), tentativas = q.tentativas + 1
    from lote
    where q.id = lote.id
    returning q.id, q.tentativas, q.competencia, q.cliente_id
  )
  select r.id, r.tentativas, r.competencia, c.id, c.documento, c.tipo_inscricao, c.razao_social
  from reservadas r
  join public.clientes c on c.id = r.cliente_id
$$;

-- Grava os resultados. Cada item:
--   { id, status: concluida | sem_procuracao | erro, mensagem, repetir, devolver,
--     avisos: [{ data: "AAAA-MM-DD", assunto, periodo_averbacao, competencia_desconto: "AAAA-MM", lida }] }
-- erro + repetir: volta à fila em 1 hora (até 3 tentativas).
-- devolver: o lote parou antes desta consulta; volta à fila sem gastar tentativa.
create function public.registrar_det_resultados(p_resultados jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  a jsonb;
  q public.det_consultas;
  obrig public.obrigacoes;
  status_final text;
  comp date;
  tarefa uuid;
  aviso_id bigint;
  e_consignado boolean;
  qtd_gravadas integer := 0;
  qtd_repetir integer := 0;
  qtd_devolvidas integer := 0;
  qtd_avisos integer := 0;
  qtd_tarefas integer := 0;
begin
  select * into obrig from public.obrigacoes where nome = 'Desconto de consignado (DET)' and sistema;

  for r in select * from jsonb_array_elements(p_resultados) loop
    select * into q from public.det_consultas
    where id = (r ->> 'id')::bigint and status = 'processando'
    for update;
    if not found then
      continue;
    end if;

    if coalesce((r ->> 'devolver')::boolean, false) then
      update public.det_consultas
      set status = 'na_fila', iniciada_em = null, tentativas = greatest(tentativas - 1, 0),
          disponivel_em = now() + interval '1 hour'
      where id = q.id;
      qtd_devolvidas := qtd_devolvidas + 1;
      continue;
    end if;

    status_final := r ->> 'status';
    if status_final not in ('concluida', 'sem_procuracao', 'erro') then
      continue;
    end if;

    if status_final = 'erro' and coalesce((r ->> 'repetir')::boolean, false) and q.tentativas < 3 then
      update public.det_consultas
      set status = 'na_fila', iniciada_em = null, disponivel_em = now() + interval '1 hour',
          mensagem = left(r ->> 'mensagem', 2000)
      where id = q.id;
      qtd_repetir := qtd_repetir + 1;
      continue;
    end if;

    update public.det_consultas
    set status = status_final,
        processada_em = now(),
        mensagem = left(r ->> 'mensagem', 2000),
        avisos = case when status_final = 'concluida' then coalesce(jsonb_array_length(r -> 'avisos'), 0) end,
        nao_lidas = case when status_final = 'concluida' then (
          select count(*) from jsonb_array_elements(coalesce(r -> 'avisos', '[]')) x
          where coalesce((x ->> 'lida')::boolean, false) = false
        ) end
    where id = q.id;
    qtd_gravadas := qtd_gravadas + 1;

    if status_final <> 'concluida' then
      continue;
    end if;

    for a in select * from jsonb_array_elements(coalesce(r -> 'avisos', '[]')) loop
      continue when (a ->> 'data') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(trim(a ->> 'assunto'), '') = '';

      e_consignado := (a ->> 'assunto') ~* '(consignad|cr[eé]dito do trabalhador|averba)';
      comp := case when (a ->> 'competencia_desconto') ~ '^\d{4}-(0[1-9]|1[0-2])$'
                   then ((a ->> 'competencia_desconto') || '-01')::date end;

      insert into public.det_avisos (cliente_id, consulta_id, enviada_em, assunto, periodo_averbacao, competencia_desconto, lida, consignado)
      values (q.cliente_id, q.id, (a ->> 'data')::date, left(trim(a ->> 'assunto'), 500),
              left(a ->> 'periodo_averbacao', 200), comp, (a ->> 'lida')::boolean, e_consignado)
      on conflict (cliente_id, enviada_em, assunto) do nothing
      returning id into aviso_id;

      if aviso_id is null then
        continue; -- já visto em leitura anterior
      end if;
      qtd_avisos := qtd_avisos + 1;

      if e_consignado and obrig.id is not null then
        comp := coalesce(comp, q.competencia);
        insert into public.tarefas (cliente_id, obrigacao_id, departamento_id, competencia, prazo_legal, prazo_meta, responsavel_id, observacao)
        select q.cliente_id, obrig.id, obrig.departamento_id, comp, pl.prazo,
               public.ajusta_dia_util(pl.prazo - obrig.meta_dias_antes, 'antecipa'),
               (select cr.profile_id from public.cliente_responsaveis cr
                 where cr.cliente_id = q.cliente_id and cr.departamento_id = obrig.departamento_id),
               left('Aviso do DET de ' || to_char((a ->> 'data')::date, 'DD/MM/YYYY') || ': ' || trim(a ->> 'assunto')
                    || coalesce(' · Averbação: ' || nullif(a ->> 'periodo_averbacao', ''), ''), 2000)
        from (select public.calcula_prazo_legal(obrig, comp) as prazo) pl
        on conflict (cliente_id, obrigacao_id, competencia) do nothing
        returning id into tarefa;

        if tarefa is not null then
          qtd_tarefas := qtd_tarefas + 1;
        else
          select t.id into tarefa from public.tarefas t
          where t.cliente_id = q.cliente_id and t.obrigacao_id = obrig.id and t.competencia = comp;
        end if;
        update public.det_avisos set tarefa_id = tarefa where id = aviso_id;
        tarefa := null;
      end if;
      aviso_id := null;
    end loop;
  end loop;

  return jsonb_build_object(
    'gravadas', qtd_gravadas, 'repetir', qtd_repetir, 'devolvidas', qtd_devolvidas,
    'avisos_novos', qtd_avisos, 'tarefas_criadas', qtd_tarefas
  );
end;
$$;

revoke execute on function public.enfileirar_det_interno(uuid, text) from public, anon, authenticated;
revoke execute on function public.reservar_det(integer) from public, anon, authenticated;
revoke execute on function public.registrar_det_resultados(jsonb) from public, anon, authenticated;
