-- Execute DEPOIS do schema_v4.sql: câmara remota (salas "cam-<sala>" só para a equipa)

-- A regra geral "todos recebem" deixa de valer para as salas cam-*
drop policy "live host: todos recebem" on realtime.messages;
create policy "live host: todos recebem" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'live:%:host'
    and (select realtime.topic()) not like 'live:cam-%'
  );

-- Salas cam-*: só a equipa recebe (enviar já exige equipa pela regra "so equipa envia")
create policy "live cam: so equipa recebe" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'live:cam-%'
    and public.is_staff()
  );
