-- Execute DEPOIS do schema_v9.sql: salas de aula privadas (discipulado e teologia)

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and ativo and role in ('pastor','admin'));
$$;

create table salas (
  id bigint generated always as identity primary key,
  area text not null check (area in ('discipulado','teologia')),
  nome text not null check (char_length(nome) between 1 and 80),
  professor_id uuid references auth.users on delete set null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create table sala_membros (
  sala_id bigint not null references salas on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (sala_id, user_id)
);

alter table salas enable row level security;
alter table sala_membros enable row level security;

-- Cada pessoa vê só as suas salas; pastor/admin vê todas
create policy "ver salas" on salas for select to authenticated
  using (public.is_admin() or professor_id = auth.uid()
         or exists (select 1 from sala_membros m where m.sala_id = salas.id and m.user_id = auth.uid()));
create policy "admin gere salas" on salas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "ver proprias inscricoes" on sala_membros for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "admin gere inscricoes" on sala_membros for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
