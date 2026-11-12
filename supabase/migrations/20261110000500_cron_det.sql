-- Robô do DET: rodada mensal. Todo dia 23 às 07:00 (Brasília), depois que os
-- avisos de consignado chegam, coloca na fila os clientes ativos. O robô do
-- computador do escritório (integracoes/det) consome a fila.

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'det-rodada-mensal',
  '0 10 23 * *',  -- 10:00 UTC = 07:00 BRT
  $$ select public.enfileirar_det_interno(null, 'agendada') $$
);
