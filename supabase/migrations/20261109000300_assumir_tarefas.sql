-- "Pegar para mim": qualquer pessoa da equipe assume tarefas abertas e sem
-- responsável dos departamentos a que pertence (admin e gestor, as que gerem).
--
-- O colaborador continua sem poder trocar o responsável de uma tarefa (RLS e
-- tarefas_regras). A única exceção passa por assumir_tarefas(): ela marca a
-- transação (mcont.assumindo) e o trigger aceita só sem responsável → o próprio
-- usuário, sem mudar mais nada.

create or replace function public.tg_tarefas_regras()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.gere_departamento(old.departamento_id) then
    if current_setting('mcont.assumindo', true) = 'on'
       and old.responsavel_id is null
       and new.responsavel_id = auth.uid()
       and (new.cliente_id, new.obrigacao_id, new.departamento_id, new.competencia,
            new.prazo_legal, new.prazo_meta, new.status, new.observacao)
           is not distinct from
           (old.cliente_id, old.obrigacao_id, old.departamento_id, old.competencia,
            old.prazo_legal, old.prazo_meta, old.status, old.observacao) then
      null; -- assumir a tarefa: permitido
    elsif (new.cliente_id, new.obrigacao_id, new.departamento_id, new.competencia,
        new.prazo_legal, new.prazo_meta, new.responsavel_id)
       is distinct from
       (old.cliente_id, old.obrigacao_id, old.departamento_id, old.competencia,
        old.prazo_legal, old.prazo_meta, old.responsavel_id) then
      raise exception 'Você só pode alterar o status e a observação desta tarefa'
        using errcode = '42501';
    end if;
  end if;

  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    new.concluida_em := now();
    new.concluida_por := auth.uid();
  elsif new.status <> 'concluida' then
    new.concluida_em := null;
    new.concluida_por := null;
  end if;

  return new;
end;
$$;

-- Assume as tarefas da lista que estiverem abertas, sem responsável e num
-- departamento do usuário (ou que ele gere). Devolve quantas assumiu; as
-- demais (já pegas por alguém, concluídas, de outro departamento) ficam como estão.
create function public.assumir_tarefas(p_tarefas uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  qtd integer;
begin
  if not public.is_ativo() then
    raise exception 'Usuário sem acesso' using errcode = '42501';
  end if;
  if coalesce(array_length(p_tarefas, 1), 0) > 500 then
    raise exception 'Selecione no máximo 500 tarefas por vez' using errcode = '22023';
  end if;

  perform set_config('mcont.assumindo', 'on', true);
  update public.tarefas t
  set responsavel_id = auth.uid()
  where t.id = any (p_tarefas)
    and t.responsavel_id is null
    and t.status in ('pendente', 'em_andamento', 'aguardando_cliente')
    and (
      public.gere_departamento(t.departamento_id)
      or exists (
        select 1 from public.profile_departamentos pd
        where pd.profile_id = auth.uid() and pd.departamento_id = t.departamento_id
      )
    );
  get diagnostics qtd = row_count;
  perform set_config('mcont.assumindo', 'off', true);
  return qtd;
end;
$$;

revoke execute on function public.assumir_tarefas(uuid[]) from public, anon;
grant execute on function public.assumir_tarefas(uuid[]) to authenticated;
