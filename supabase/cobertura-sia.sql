-- Cobertura municipal das prefeituras com o SIA da Fiorilli
-- (integracoes/cnd/rotina-municipal-sia.md). Rodar como admin no SQL Editor
-- depois da migration 20261110000100_cnd_fila_por_municipio.sql e do deploy,
-- e depois de instalar o robô (integracoes/cnd/instalar-robo-sia.bat).
-- Os clientes dessas cidades passam de "sem cobertura" para a fila do dia 23
-- (ou dos pedidos pela tela).

insert into public.cnd_cobertura (tipo, uf, municipio, observacao) values
  ('municipal', 'SP', 'JACI', 'SIA Fiorilli, rotina-municipal-sia.md'),
  ('municipal', 'SP', 'BADY BASSITT', 'SIA Fiorilli, rotina-municipal-sia.md'),
  ('municipal', 'SP', 'NOVA ALIANCA', 'SIA Fiorilli, rotina-municipal-sia.md'),
  ('municipal', 'SP', 'SALES', 'SIA Fiorilli, rotina-municipal-sia.md'),
  ('municipal', 'SP', 'IRAPUA', 'SIA Fiorilli, rotina-municipal-sia.md'),
  ('municipal', 'SP', 'MERIDIANO', 'SIA Fiorilli, rotina-municipal-sia.md'),
  ('municipal', 'SP', 'GUARARAPES', 'SIA Fiorilli, rotina-municipal-sia.md'),
  ('municipal', 'SP', 'POTIRENDABA', 'SIA Fiorilli, rotina-municipal-sia.md')
on conflict do nothing;
