-- Robô do DET: a rodada mensal passa do dia 23 para o dia 26, às 07:00
-- (Brasília). cron.schedule com o mesmo nome substitui o agendamento criado
-- em 20261110000500_cron_det.sql (ou cria, se aquela ainda não foi aplicada).

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'det-rodada-mensal',
  '0 10 26 * *',  -- 10:00 UTC = 07:00 BRT
  $$ select public.enfileirar_det_interno(null, 'agendada') $$
);
