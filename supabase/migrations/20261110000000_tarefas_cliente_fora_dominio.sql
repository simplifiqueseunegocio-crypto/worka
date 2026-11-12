-- Empresa que sai do Domínio perde as tarefas em aberto.
--
-- A sincronização suspende o cliente que não vem mais na lista de empresas
-- ativas. Nesse momento, as tarefas pendentes, em andamento e aguardando
-- cliente dele são apagadas: não serão feitas e inflavam as contagens. As
-- concluídas e dispensadas ficam, como histórico dos relatórios.
--
-- Vale só para a saída do Domínio (cliente com código do Domínio, suspenso sem
-- status_manual). Suspender ou encerrar pela tela não apaga nada. Se a empresa
-- voltar ao Domínio, recebe tarefas a partir da próxima geração.

create function public.tg_clientes_fora_dominio()
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

create trigger clientes_fora_dominio after update of status on public.clientes
  for each row execute function public.tg_clientes_fora_dominio();

-- Limpeza do que já existe: empresas que já tinham saído do Domínio.
delete from public.tarefas t
using public.clientes c
where c.id = t.cliente_id
  and c.codigo_dominio is not null
  and c.status <> 'ativo'
  and not c.status_manual
  and t.status in ('pendente', 'em_andamento', 'aguardando_cliente');
