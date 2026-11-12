-- CND: nova tentativa só depois de um tempo.
--
-- Erro temporário (site fora do ar, "tente mais tarde") devolvia a consulta
-- para a fila na hora, e a mesma execução a reservava de novo segundos depois,
-- gastando as 3 tentativas de uma vez. Agora ela só volta a ser reservada
-- 1 hora depois (disponivel_em); as tarefas rodam de novo mais tarde no dia 23.

alter table public.cnd_consultas add column disponivel_em timestamptz not null default now();

create or replace function public.reservar_cnd(p_limite integer default 10, p_tipo public.cnd_tipo default null)
returns table (
  id bigint,
  tipo public.cnd_tipo,
  tentativas smallint,
  cliente_id uuid,
  documento text,
  tipo_inscricao smallint,
  razao_social text,
  uf char(2),
  codigo_municipio integer,
  inscricao_estadual text,
  inscricao_municipal text
)
language sql security definer set search_path = ''
as $$
  with lote as (
    select q.id
    from public.cnd_consultas q
    where (p_tipo is null or q.tipo = p_tipo)
      and ((q.status = 'na_fila' and q.disponivel_em <= now())
           or (q.status = 'processando' and q.iniciada_em < now() - interval '15 minutes'))
    order by q.solicitada_em, q.id
    limit p_limite
    for update skip locked
  ),
  reservadas as (
    update public.cnd_consultas q
    set status = 'processando', iniciada_em = now(), tentativas = q.tentativas + 1
    from lote
    where q.id = lote.id
    returning q.id, q.tipo, q.tentativas, q.cliente_id
  )
  select r.id, r.tipo, r.tentativas, c.id, c.documento, c.tipo_inscricao, c.razao_social,
         c.uf, c.codigo_municipio, c.inscricao_estadual, c.inscricao_municipal
  from reservadas r
  join public.clientes c on c.id = r.cliente_id
$$;

create or replace function public.registrar_cnd_resultados(p_resultados jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  qtd_gravadas integer;
  qtd_repetir integer;
begin
  with r as (
    select *
    from jsonb_to_recordset(p_resultados) as x(
      id bigint, status text, mensagem text, detalhes jsonb, repetir boolean
    )
    where x.status in ('regular', 'pendente', 'erro')
  ),
  alteradas as (
    update public.cnd_consultas q
    set status = case
          when r.status = 'erro' and coalesce(r.repetir, false) and q.tentativas < 3 then 'na_fila'
          else r.status
        end::public.cnd_status,
        processada_em = case
          when r.status = 'erro' and coalesce(r.repetir, false) and q.tentativas < 3 then null
          else now()
        end,
        disponivel_em = case
          when r.status = 'erro' and coalesce(r.repetir, false) and q.tentativas < 3 then now() + interval '1 hour'
          else q.disponivel_em
        end,
        mensagem = left(r.mensagem, 2000),
        detalhes = r.detalhes
    from r
    where q.id = r.id and q.status = 'processando'
    returning q.status
  )
  select count(*) filter (where status <> 'na_fila'), count(*) filter (where status = 'na_fila')
  into qtd_gravadas, qtd_repetir
  from alteradas;

  return jsonb_build_object('gravadas', qtd_gravadas, 'repetir', qtd_repetir);
end;
$$;

revoke execute on function public.reservar_cnd(integer, public.cnd_tipo) from public, anon, authenticated;
revoke execute on function public.registrar_cnd_resultados(jsonb) from public, anon, authenticated;
