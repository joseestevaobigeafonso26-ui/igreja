-- Execute DEPOIS do schema_v11.sql: texto bíblico no ecrã + página Início

-- ── Texto bíblico no ecrã (versículo) ──
alter table live_sessions add column if not exists verso jsonb;        -- {"ref":"João 3:16","texto":"…"} ou null = escondido
alter table live_sessions add column if not exists biblia_url text;    -- link da Bíblia em PDF

create table if not exists versiculos (
  id bigint generated always as identity primary key,
  referencia text not null check (char_length(referencia) between 1 and 80),
  texto text not null check (char_length(texto) between 1 and 1500),
  ordem int not null default 0,
  created_at timestamptz not null default now()
);
alter table versiculos enable row level security;
create policy "versiculos equipa" on versiculos for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Bíblia em PDF (leitura pública do ficheiro; só a equipa envia/apaga; até 50 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('biblia', 'biblia', true, 52428800, array['application/pdf'])
on conflict (id) do nothing;
create policy "biblia upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'biblia' and public.is_staff());
create policy "biblia apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'biblia' and public.is_staff());

-- ── Página Início ──
create table if not exists igreja_info (
  id int primary key default 1 check (id = 1),       -- uma única linha
  lema text, sobre text, visao text,
  endereco text, mapa_url text,
  telefone text, whatsapp text, email text,
  facebook text, instagram text, youtube text,
  palavra_ref text, palavra_texto text,              -- "Palavra da semana"
  ofertas_info text
);
alter table igreja_info enable row level security;
create policy "ler info" on igreja_info for select using (true);
create policy "equipa info" on igreja_info for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
insert into igreja_info (id, lema, sobre, visao) values (
  1, 'Uma Igreja Voltada ao Discipulado',
  'Somos uma comunidade batista no Vale do Quixicongo, reunida para adorar a Deus, conhecer a Palavra e formar discípulos.',
  'Ver cada membro crescer em Cristo e servir a sua família, a igreja e a comunidade.'
) on conflict (id) do nothing;

-- Eventos com data (conferências, batismos, casamentos…), além da agenda semanal
create table if not exists eventos (
  id bigint generated always as identity primary key,
  data date not null,
  hora time,
  titulo text not null,
  descricao text,
  local text,
  destaque boolean not null default false,
  transmissao boolean not null default false
);
alter table eventos enable row level security;
create policy "ler eventos" on eventos for select using (true);
create policy "equipa eventos" on eventos for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
