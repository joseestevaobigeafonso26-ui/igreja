-- Execute no Supabase: SQL Editor > New query > Run

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nome text,
  role text not null default 'membro' check (role in ('membro','professor','pastor','admin'))
);

create function public.is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('professor','pastor','admin'));
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nome) values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table courses (
  id bigint generated always as identity primary key,
  area text not null check (area in ('discipulado','teologia')),
  titulo text not null,
  descricao text,
  formato text,
  ordem int not null default 0
);

create table lessons (
  id bigint generated always as identity primary key,
  course_id bigint not null references courses on delete cascade,
  titulo text not null,
  conteudo text,
  video_url text,
  ordem int not null default 0
);

create table agenda (
  id bigint generated always as identity primary key,
  dia_semana int not null check (dia_semana between 0 and 6), -- 0 = Domingo
  hora time not null,
  titulo text not null,
  descricao text,
  local text,
  transmissao boolean not null default false
);

create table avisos (
  id bigint generated always as identity primary key,
  titulo text not null,
  corpo text,
  created_at timestamptz not null default now()
);

-- Estado "ao vivo" de cada sala (o vídeo viaja por WebRTC, não passa pelo banco)
create table live_sessions (
  room text primary key check (room in ('culto','discipulado','teologia','agenda')),
  is_live boolean not null default false,
  titulo text,
  started_at timestamptz
);
insert into live_sessions (room, titulo) values
  ('culto','Culto Solene de Adoração'), ('discipulado','Aula de Discipulado'),
  ('teologia','Aula de Teologia'), ('agenda','Informações da Semana');

-- RLS: leitura pública, escrita só para equipa (professor/pastor/admin)
alter table profiles enable row level security;
create policy "ver proprio perfil" on profiles for select using (id = auth.uid());

do $$ declare t text; begin
  foreach t in array array['courses','lessons','agenda','avisos','live_sessions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "leitura publica" on %I for select using (true)', t);
    execute format('create policy "escrita equipa" on %I for all using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

alter publication supabase_realtime add table live_sessions;

-- Dados iniciais (a partir do protótipo)
insert into courses (area, titulo, descricao, formato, ordem) values
 ('discipulado','Nível 1: Primeiros Passos no Quixicongo','4 lições • Batismo','Concluído',1),
 ('discipulado','Nível 2: Carácter de Cristo e Serviço','6 lições • Em progresso','Em progresso',2),
 ('discipulado','Nível 3: Formador de Novos Discípulos','8 lições • Discipulador','Bloqueado',3),
 ('teologia','Módulo A: Hermenêutica Bíblica','Interpretação textual dos Evangelhos','Vídeo Aula',1),
 ('teologia','Módulo B: História dos Batistas','Origens, princípios e doutrina comunitária','E-Book PDF',2),
 ('teologia','Módulo C: Teologia Sistemática I','Doutrina de Deus, Cristo e do Espírito Santo','Inscrições',3);

insert into agenda (dia_semana, hora, titulo, descricao, local, transmissao) values
 (0,'09:00','Escola Bíblica Dominical (EBD) & Discipulado Geral','Classes para Crianças, Jovens e Adultos na Nave Central.','Presencial & Online',true),
 (0,'17:30','Culto Solene de Adoração, Pregação e Batismos','Culto principal de celebração comunitária com transmissão ao vivo.','Transmissão Directa',true),
 (2,'18:00','Reunião do Ministério de Intercessão & Oração','Momento dedicado a clamar pelas famílias e pelo crescimento do Vale.','Santuário',false),
 (3,'18:30','Estudo Teológico & Culto de Doutrina','Estudo sistemático livro a livro conduzido pelo Corpo Pastoral.','Presencial',true);

insert into avisos (titulo, corpo) values
 ('Bem-vindo ao sistema integrado','Acompanhe os cultos e as aulas ao vivo e consulte a agenda da semana.');

-- Para tornar alguém pastor/admin (depois de ele entrar uma vez):
-- update profiles set role = 'pastor' where id = (select id from auth.users where email = 'pastor@exemplo.com');
