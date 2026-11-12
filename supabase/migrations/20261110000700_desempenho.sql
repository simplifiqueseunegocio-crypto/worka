-- Desempenho: contadores do menu numa consulta só.
--
-- O menu lateral mostra as tarefas abertas de cada departamento em toda
-- navegação. Eram 6 consultas (departamentos + uma contagem por departamento)
-- em duas rodadas; agora é uma. security invoker: a RLS de tarefas vale como
-- antes, cada pessoa conta o que pode ver.

create function public.abertas_por_departamento()
returns table (departamento text, abertas bigint)
language sql stable security invoker set search_path = ''
as $$
  select d.nome, count(t.id)
  from public.departamentos d
  left join public.tarefas t
    on t.departamento_id = d.id
   and t.status in ('pendente', 'em_andamento', 'aguardando_cliente')
  group by d.nome
$$;

create index if not exists tarefas_abertas_por_departamento
  on public.tarefas (departamento_id)
  where status in ('pendente', 'em_andamento', 'aguardando_cliente');
