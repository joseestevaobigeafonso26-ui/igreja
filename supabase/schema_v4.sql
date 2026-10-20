-- Execute DEPOIS do schema_v3.sql: segurança da transmissão (canais privados)
-- ANTES: Authentication → Sign In / Providers → ativar "Allow anonymous sign-ins".

-- Membro real = logado e NÃO anónimo (espectadores entram como anónimos)
create or replace function public.is_member() returns boolean
language sql stable as $$
  select auth.uid() is not null and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- Anónimos não ganham perfil
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_anonymous then return new; end if;
  insert into profiles (id, nome) values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;

-- Galeria: só membros reais enviam fotos
drop policy "enviar foto" on galeria;
create policy "enviar foto" on galeria for insert to authenticated
  with check (public.is_staff() or (public.is_member() and aprovado = false and autor = auth.uid()));
drop policy "galeria upload" on storage.objects;
create policy "galeria upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'galeria' and public.is_member());

-- Canal da equipa → espectadores (ofertas WebRTC): todos recebem, SÓ a equipa envia
create policy "live host: todos recebem" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'live:%:host');
create policy "live host: so equipa envia" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'live:%:host' and public.is_staff());

-- Canal espectadores → equipa (entrar, resposta, ICE): todos enviam, SÓ a equipa recebe
create policy "live viewers: todos enviam" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'live:%:viewers');
create policy "live viewers: so equipa recebe" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'live:%:viewers' and public.is_staff());
