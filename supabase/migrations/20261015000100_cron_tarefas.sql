-- Geração automática das tarefas: todo dia 1º às 06:00 (horário de Brasília),
-- cria as tarefas da competência do mês anterior.
-- Ex.: em 01/11/2026 gera a competência 10/2026 (DAS que vence em 20/11 etc.).

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'gerar-tarefas-mensal',
  '0 9 1 * *',  -- 09:00 UTC = 06:00 BRT
  $$ select public.gerar_tarefas_interno(
       (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date
     ) $$
);
