-- CND: worker no servidor do escritório no lugar das tarefas do Claude.
--
-- O worker roda a cada 10 minutos. Antes de abrir o navegador ele só pergunta
-- quantas consultas podem ser reservadas agora (contar_cnd_pendentes), sem
-- reservar nada: com a fila vazia ou sem sessão do gov.br, nenhuma consulta
-- fica presa em 'processando' nem gasta tentativa.

create function public.contar_cnd_pendentes()
returns table (tipo public.cnd_tipo, origem text, quantidade integer)
language sql stable security definer set search_path = ''
as $$
  select q.tipo, q.origem, count(*)::int
  from public.cnd_consultas q
  where (q.status = 'na_fila' and q.disponivel_em <= now())
     or (q.status = 'processando' and q.iniciada_em < now() - interval '15 minutes')
  group by q.tipo, q.origem
$$;

revoke execute on function public.contar_cnd_pendentes() from public, anon, authenticated;

-- Tipos ligados em produção pelo SQL Editor (README), agora também nas migrations.
update public.cnd_tipos set automatico = true, observacao = 'Tarefa agendada do Claude no Claude in Chrome (rotina-fgts.md)'
  where tipo = 'fgts';
update public.cnd_tipos set automatico = true, observacao = 'Worker (consultores/estadual/sp.mjs), SIDEB com a sessão do gov.br'
  where tipo = 'estadual';
update public.cnd_tipos set automatico = true, observacao = 'Worker (consultores/municipal/riopreto.mjs), ISS Digital de Rio Preto'
  where tipo = 'municipal';
