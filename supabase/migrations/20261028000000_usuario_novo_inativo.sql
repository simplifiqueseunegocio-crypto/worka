-- Equipe: contas só são criadas pelo admin (Configurações → Equipe).
--
-- Até aqui todo usuário novo do Auth virava colaborador ativo. Se o cadastro
-- público do Supabase estiver ligado, alguém poderia criar uma conta pela API
-- e ler a carteira. Agora a conta nova nasce desativada (sem acesso pela RLS);
-- a tela Equipe ativa quem o admin cadastrou. O primeiro usuário continua
-- nascendo admin ativo, para o primeiro acesso.

create or replace function public.tg_novo_usuario()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  primeiro boolean := not exists (select 1 from public.profiles);
begin
  insert into public.profiles (id, nome, email, papel, ativo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    new.email,
    (case when primeiro then 'admin' else 'colaborador' end)::public.papel,
    primeiro
  );
  return new;
end;
$$;
