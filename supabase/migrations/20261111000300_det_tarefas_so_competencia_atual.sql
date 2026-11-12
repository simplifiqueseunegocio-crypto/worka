-- Robô do DET: na primeira leitura de cada empresa vem o histórico inteiro da
-- Caixa Postal, e cada aviso antigo de consignado virava tarefa (competências
-- já fechadas). Agora o aviso é guardado sempre, mas só vira tarefa do DP
-- quando a competência do desconto é a atual ou uma futura.

create or replace function public.registrar_det_resultados(p_resultados jsonb)
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
        ) end,
        avisos_consignado = case when status_final = 'concluida' then (
          select count(*) from jsonb_array_elements(coalesce(r -> 'avisos', '[]')) x
          where public.det_e_consignado(x ->> 'assunto')
        ) end
    where id = q.id;
    qtd_gravadas := qtd_gravadas + 1;

    if status_final <> 'concluida' then
      continue;
    end if;

    for a in select * from jsonb_array_elements(coalesce(r -> 'avisos', '[]')) loop
      continue when (a ->> 'data') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(trim(a ->> 'assunto'), '') = '';

      e_consignado := public.det_e_consignado(a ->> 'assunto');
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

      comp := coalesce(comp, q.competencia);
      -- Aviso de competência já fechada fica só no histórico (sem tarefa).
      if e_consignado and obrig.id is not null
         and comp >= date_trunc('month', now() at time zone 'America/Sao_Paulo')::date then
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

revoke execute on function public.registrar_det_resultados(jsonb) from public, anon, authenticated;
