-- Execute DEPOIS do schema_v8.sql: banner de informações (rodapé estilo telejornal), opcional
alter table live_sessions add column if not exists banner text check (banner is null or char_length(banner) <= 600);
alter table live_sessions add column if not exists banner_ativo boolean not null default true;
