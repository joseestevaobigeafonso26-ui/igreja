-- Execute DEPOIS do schema_v2.sql: galeria com aprovação

create table galeria (
  id bigint generated always as identity primary key,
  titulo text not null,
  descricao text,
  categoria text,
  imagem_url text not null,
  aprovado boolean not null default false,
  autor uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table galeria enable row level security;

-- Público vê só o aprovado; a equipa vê tudo
create policy "ver aprovadas" on galeria for select using (aprovado or public.is_staff());
-- Membro logado envia sempre como pendente; a equipa pode inserir já aprovado
create policy "enviar foto" on galeria for insert to authenticated
  with check (public.is_staff() or (aprovado = false and autor = auth.uid()));
create policy "equipa edita" on galeria for update using (public.is_staff()) with check (public.is_staff());
create policy "equipa apaga" on galeria for delete using (public.is_staff());

-- Armazenamento das imagens (leitura pública; upload só para quem está logado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('galeria', 'galeria', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "galeria upload" on storage.objects for insert to authenticated with check (bucket_id = 'galeria');
create policy "galeria equipa apaga" on storage.objects for delete using (bucket_id = 'galeria' and public.is_staff());

insert into galeria (titulo, descricao, categoria, imagem_url, aprovado) values
 ('Festa das Águas no Vale','12 Novos irmãos professaram a fé pública em Cristo.','Batismos 2026','https://images.unsplash.com/photo-1519834785169-98be25ec3f84?auto=format&fit=crop&q=80&w=600',true),
 ('Congresso de Jovens Discipuladores','Fim de semana intenso de louvor e palavra viva.','Juventude','https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&q=80&w=600',true),
 ('Entrega de Cestas e Apoio Comunitário','Servindo o bairro do Quixicongo com o amor de Deus.','Diaconia & Ação Social','https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&q=80&w=600',true);
