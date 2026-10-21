-- Execute DEPOIS do schema_v7.sql: comentários e perguntas ao vivo

create table live_comments (
  id bigint generated always as identity primary key,
  room text not null check (room in ('culto','discipulado','teologia','agenda')),
  nome text not null check (char_length(nome) between 1 and 40),
  texto text not null check (char_length(texto) between 1 and 300),
  tipo text not null default 'comentario' check (tipo in ('comentario','pergunta')),
  autor_tipo text not null default 'visitante' check (autor_tipo in ('visitante','membro','responsavel')),
  client_key text,
  user_id uuid,
  ip_hash text,
  fixado boolean not null default false,
  respondido boolean not null default false,
  created_at timestamptz not null default now()
);
create index on live_comments (room, id desc);
create index on live_comments (client_key, created_at);
create index on live_comments (ip_hash, created_at);

alter table live_comments enable row level security;
create policy "ler comentarios" on live_comments for select using (true);
-- Qualquer pessoa (inclui visitantes sem conta) comenta, mas só enquanto a sala estiver ao vivo
create policy "comentar ao vivo" on live_comments for insert to anon, authenticated
  with check (exists (select 1 from live_sessions s where s.room = live_comments.room and s.is_live));
create policy "equipa modera" on live_comments for update using (public.is_staff()) with check (public.is_staff());
create policy "equipa apaga" on live_comments for delete using (public.is_staff());

-- O servidor decide quem é quem (o cliente não pode fingir ser "Responsável") e limita o spam
create or replace function public.live_comments_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare hdrs json; ip text; nome_perfil text;
begin
  new.texto := btrim(new.texto);
  new.nome := btrim(new.nome);
  new.user_id := auth.uid();
  new.fixado := false;
  new.respondido := false;

  if public.is_staff() then new.autor_tipo := 'responsavel';
  elsif public.is_member() then new.autor_tipo := 'membro';
  else new.autor_tipo := 'visitante';
  end if;

  if new.autor_tipo <> 'visitante' then
    select nome into nome_perfil from profiles where id = auth.uid();
    if nome_perfil is not null and nome_perfil <> '' then new.nome := nome_perfil; end if;
  end if;
  if new.nome = '' then new.nome := 'Visitante'; end if;
  if new.texto = '' then raise exception 'Mensagem vazia.'; end if;

  begin hdrs := nullif(current_setting('request.headers', true), '')::json; exception when others then hdrs := null; end;
  ip := trim(coalesce(split_part(hdrs ->> 'x-forwarded-for', ',', 1), ''));
  if ip <> '' then new.ip_hash := md5(ip); end if;

  -- 1 mensagem a cada 2 segundos por pessoa
  if new.client_key is not null and exists (
    select 1 from live_comments where client_key = new.client_key and created_at > now() - interval '2 seconds'
  ) then raise exception 'Devagar: aguarde 2 segundos entre mensagens.'; end if;

  -- no máximo 60 mensagens por minuto por endereço (uma igreja inteira na mesma rede cabe)
  if new.ip_hash is not null and (
    select count(*) from live_comments where ip_hash = new.ip_hash and created_at > now() - interval '1 minute'
  ) >= 60 then raise exception 'Muitas mensagens deste endereço. Tente daqui a pouco.'; end if;

  return new;
end $$;
create trigger live_comments_before before insert on live_comments
  for each row execute function public.live_comments_before();

alter publication supabase_realtime add table live_comments;
