-- Execute DEPOIS do schema_v5.sql.
-- Objetivo: manter "Allow new users to sign up" LIGADO (necessário para os espectadores
-- entrarem como anónimos) sem que contas criadas por estranhos tenham qualquer poder.

alter table profiles add column if not exists ativo boolean not null default false;
update profiles set ativo = true;   -- contas que já existem (pastor, etc.) ficam ativas

-- Contas novas (fora do painel do pastor) nascem inativas; anónimos não têm perfil
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_anonymous then return new; end if;
  insert into profiles (id, nome, ativo) values (new.id, split_part(new.email, '@', 1), false);
  return new;
end $$;

-- Membro real = logado, não anónimo e ATIVADO pelo pastor
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     and exists (select 1 from profiles where id = auth.uid() and ativo);
$$;

-- Equipa também exige conta ativa
create or replace function public.is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and ativo and role in ('professor','pastor','admin'));
$$;
