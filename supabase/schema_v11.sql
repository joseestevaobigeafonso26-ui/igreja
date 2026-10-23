-- Execute DEPOIS do schema_v10.sql: aula ao vivo SEM servidor de vídeo (o computador do professor faz de ponte).
-- Só a sinalização (texto) passa pelo Supabase Realtime; o vídeo vai direto entre os navegadores (WebRTC).
--
-- Canais privados:
--   aula:<sala>:host       professor → turma   (só o professor escreve; professor e alunos da sala leem)
--   aula:<sala>:u:<uid>    aluno → professor   (só o PRÓPRIO aluno escreve; só o professor lê)
-- Como o uid vai no nome do canal e a política exige uid = auth.uid(), o professor sabe sempre
-- quem enviou cada mensagem: ninguém consegue fingir ser outro aluno nem falar como professor.

create or replace function public.aula_sala(topic text) returns bigint
language sql immutable as $$
  select case when split_part(topic, ':', 1) = 'aula' and split_part(topic, ':', 2) ~ '^[0-9]{1,15}$'
              then split_part(topic, ':', 2)::bigint end;
$$;

-- Quem dirige a sala: pastor/admin ativos, ou o professor dessa sala (conta real e ativada, nunca anónima)
create or replace function public.aula_is_host(sala bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from salas s
    join profiles p on p.id = auth.uid()
    where s.id = sala and s.ativa and p.ativo
      and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
      and (p.role in ('pastor','admin') or s.professor_id = auth.uid())
  );
$$;

-- Quem pertence à sala: quem a dirige ou aluno inscrito (ativado)
create or replace function public.aula_is_member(sala bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.aula_is_host(sala) or exists (
    select 1
    from sala_membros m
    join salas s on s.id = m.sala_id
    join profiles p on p.id = m.user_id
    where m.sala_id = sala and m.user_id = auth.uid() and s.ativa and p.ativo
      and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );
$$;

create policy "aula host: turma recebe" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'aula:%:host'
    and public.aula_is_member(public.aula_sala((select realtime.topic())))
  );

create policy "aula host: so o professor envia" on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'aula:%:host'
    and public.aula_is_host(public.aula_sala((select realtime.topic())))
  );

create policy "aula aluno: professor recebe" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'aula:%:u:%'
    and public.aula_is_host(public.aula_sala((select realtime.topic())))
  );

create policy "aula aluno: so o proprio envia" on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'aula:%:u:%'
    and public.aula_is_member(public.aula_sala((select realtime.topic())))
    and split_part((select realtime.topic()), ':', 4) = auth.uid()::text
  );
