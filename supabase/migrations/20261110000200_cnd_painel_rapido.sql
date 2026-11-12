-- CND: painel mais rápido.
--
-- Desde 20261109000100_certidoes.sql, a view chamava cnd_acompanha e
-- cnd_coberto em cada linha de cnd_consultas e 5 vezes por cliente. Funções
-- com "set search_path" não são incorporadas à consulta, e cada chamada passa
-- pelas regras de acesso: para o usuário logado, a lista levava ~1,4 s, e a tela
-- Certidões (7 consultas ao mesmo tempo) estourava o statement timeout.
--
-- Mesmo resultado (conferido em produção: 481 linhas iguais), calculado uma vez
-- por cliente e tipo, com junções: a lista caiu de 1,35 s para 0,29 s.

create or replace view public.cnd_painel with (security_invoker = true) as
with cobertura as (
  -- Mesma regra de cnd_coberto, sem chamar a função por cliente.
  select k.tipo, k.uf, public.nome_comparavel(k.municipio) as municipio from public.cnd_cobertura k
),
acompanha as (
  -- Tipo do catálogo: exceção do cliente ou o padrão do tipo. Sem tipo no catálogo, acompanha.
  select c.id as cliente_id, t.cnd_tipo as tipo, coalesce(e.acompanha, t.padrao and t.ativo) as acompanha
  from public.clientes c
  join public.certidao_tipos t on t.cnd_tipo is not null
  left join public.cliente_certidao_tipos e on e.tipo_id = t.id and e.cliente_id = c.id
),
flags as (
  select
    c.id as cliente_id,
    coalesce(bool_and(a.acompanha) filter (where a.tipo = 'federal'), true) as ac_federal,
    coalesce(bool_and(a.acompanha) filter (where a.tipo = 'fgts'), true) as ac_fgts,
    coalesce(bool_and(a.acompanha) filter (where a.tipo = 'trabalhista'), true) as ac_trabalhista,
    coalesce(bool_and(a.acompanha) filter (where a.tipo = 'estadual'), true) as ac_estadual,
    coalesce(bool_and(a.acompanha) filter (where a.tipo = 'municipal'), true) as ac_municipal,
    exists (select 1 from cobertura k where k.tipo = 'estadual' and k.uf = c.uf
            and (k.municipio is null or k.municipio = public.nome_comparavel(c.municipio))) as cob_estadual,
    exists (select 1 from cobertura k where k.tipo = 'municipal' and k.uf = c.uf
            and (k.municipio is null or k.municipio = public.nome_comparavel(c.municipio))) as cob_municipal
  from public.clientes c
  left join acompanha a on a.cliente_id = c.id
  group by c.id
),
ultima as (
  select distinct on (q.cliente_id, q.tipo) q.cliente_id, q.tipo, q.status, q.processada_em, q.mensagem
  from public.cnd_consultas q
  join flags f on f.cliente_id = q.cliente_id
  where q.status in ('regular', 'pendente', 'erro')
    and case q.tipo
          when 'federal' then f.ac_federal
          when 'fgts' then f.ac_fgts
          when 'trabalhista' then f.ac_trabalhista
          when 'estadual' then f.ac_estadual and f.cob_estadual
          when 'municipal' then f.ac_municipal and f.cob_municipal
        end
  order by q.cliente_id, q.tipo, q.processada_em desc
),
por_cliente as (
  select
    cliente_id,
    max(status::text) filter (where tipo = 'federal') as federal,
    max(status::text) filter (where tipo = 'fgts') as fgts,
    max(status::text) filter (where tipo = 'trabalhista') as trabalhista,
    max(status::text) filter (where tipo = 'estadual') as estadual,
    max(status::text) filter (where tipo = 'municipal') as municipal,
    count(*) filter (where status = 'pendente') as pendencias,
    count(*) filter (where status = 'erro') as erros,
    count(*) filter (where status = 'regular') as regulares,
    max(processada_em) as consultado_em,
    jsonb_object_agg(tipo, mensagem) filter (where mensagem is not null) as mensagens
  from ultima
  group by cliente_id
)
select
  c.id as cliente_id,
  c.codigo_dominio,
  c.tipo_inscricao,
  c.documento,
  c.razao_social,
  c.fantasia,
  c.uf,
  c.codigo_municipio,
  c.status as cliente_status,
  c.busca_cnd,
  case when f.ac_federal then p.federal else 'dispensada' end as federal,
  case when f.ac_fgts then p.fgts else 'dispensada' end as fgts,
  case when f.ac_trabalhista then p.trabalhista else 'dispensada' end as trabalhista,
  case
    when not f.ac_estadual then 'dispensada'
    when f.cob_estadual then p.estadual
    else 'sem_cobertura'
  end as estadual,
  case
    when not f.ac_municipal then 'dispensada'
    when f.cob_municipal then p.municipal
    else 'sem_cobertura'
  end as municipal,
  coalesce(p.pendencias, 0)::int as pendencias,
  coalesce(p.erros, 0)::int as erros,
  p.consultado_em,
  p.mensagens,
  exists (
    select 1 from public.cnd_consultas q
    where q.cliente_id = c.id and q.status in ('na_fila', 'processando')
  ) as na_fila,
  case
    when coalesce(p.pendencias, 0) > 0 then 'pendente'
    when coalesce(p.erros, 0) > 0 then 'erro'
    when coalesce(p.regulares, 0) > 0 then 'regular'
    else 'sem_consulta'
  end as situacao,
  c.municipio
from public.clientes c
join flags f on f.cliente_id = c.id
left join por_cliente p on p.cliente_id = c.id
where c.busca_cnd or p.cliente_id is not null;
