-- Clientes: suspender, encerrar e reativar pela tela, e excluir com segurança.
--
-- A sincronização do Domínio grava status = 'ativo' em toda empresa que recebe.
-- Quando a equipe suspende ou encerra um cliente pela tela, status_manual fica
-- true e este trigger mantém o status escolhido nas próximas sincronizações.
-- Toda mudança pela tela grava status_alterado_em, que a sincronização não
-- toca: é assim que o trigger separa uma da outra. "Reativar" volta
-- status_manual para false e a sincronização passa a mandar de novo.
--
-- Excluir (admin, RLS "exclusao") exige o cliente fora de atividade e que não
-- tenha vindo na última sincronização: um cliente ainda no Domínio seria
-- recriado no dia seguinte, sem o histórico.

alter table public.clientes
  add column status_manual boolean not null default false,
  add column status_alterado_em timestamptz;

create function public.tg_clientes_status_manual()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Status definido pela equipe: a sincronização não muda (nem reativa).
  if old.status_manual and new.status_manual
     and new.status is distinct from old.status
     and new.status_alterado_em is not distinct from old.status_alterado_em then
    new.status := old.status;
  end if;
  return new;
end;
$$;

create trigger clientes_status_manual before update on public.clientes
  for each row execute function public.tg_clientes_status_manual();

-- O cliente veio na última sincronização com sucesso? (sincronizado_em é
-- gravado em toda empresa recebida; margem de 1 hora para o registro da execução.)
create function public.cliente_no_dominio(p_cliente_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select c.codigo_dominio is not null
        and c.sincronizado_em >= (
          select max(e.iniciado_em) - interval '1 hour'
          from public.integracao_execucoes e
          where e.integracao = 'dominio_clientes' and e.status = 'sucesso'
        )
     from public.clientes c
     where c.id = p_cliente_id),
    false
  )
$$;

create function public.tg_clientes_exclusao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'ativo' then
    raise exception 'Suspenda ou encerre o cliente antes de excluir' using errcode = '23514';
  end if;
  if public.cliente_no_dominio(old.id) then
    raise exception 'Cliente ainda vem do Domínio: a sincronização o recriaria' using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger clientes_exclusao before delete on public.clientes
  for each row execute function public.tg_clientes_exclusao();
