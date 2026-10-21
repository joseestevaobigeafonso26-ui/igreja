-- Execute DEPOIS do schema_v6.sql.
-- Chave pública da transmissão: a equipa grava uma chave nova a cada transmissão; os espectadores
-- (sem conta) usam-na para confirmar que a oferta de vídeo foi mesmo enviada pela equipa.
alter table live_sessions add column if not exists pubkey jsonb;
