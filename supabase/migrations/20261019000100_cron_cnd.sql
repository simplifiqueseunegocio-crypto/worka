-- CND: rodada mensal. Todo dia 23 às 06:00 (Brasília) coloca na fila a
-- carteira com busca_cnd ligada. O worker do servidor do escritório
-- (integracoes/cnd) consome a fila.

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'cnd-rodada-mensal',
  '0 9 23 * *',  -- 09:00 UTC = 06:00 BRT
  $$ select public.enfileirar_cnd_interno(null, 'agendada', null) $$
);
