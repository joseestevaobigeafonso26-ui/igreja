# Igreja Comunitária Batista do Vale do Quixicongo — Sistema integrado

Next.js (App Router) + React + Tailwind + Supabase + WebRTC.

## Arrancar
1. Crie um projeto no Supabase e execute `supabase/schema.sql` depois `schema_v2.sql`, `schema_v3.sql` e `schema_v4.sql` no SQL Editor.
2. Em Authentication → Sign In / Providers, ative **Allow anonymous sign-ins** (os espectadores entram assim, sem criar conta).
2. `cp .env.example .env.local` e preencha URL e chave anon (Settings → API).
3. Primeiro acesso do pastor: Supabase → Authentication → Users → Add user → Create new user (email + senha, marque *Auto Confirm User*). Depois, no SQL Editor: `update profiles set role = 'pastor' where id = (select id from auth.users where email = 'EMAIL_DO_PASTOR');`
4. Em Authentication → Sign In / Providers, **desative "Allow new users to sign up"** (ninguém cria conta sozinho). Os restantes acessos são criados pelo pastor em **/admin → Utilizadores**.
5. Preencha `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` (chave secreta, só servidor).
6. `npm install && npm run dev` e entre em `/entrar` com email e senha.

## Como funciona a transmissão
- Salas: `culto`, `discipulado`, `teologia`, `agenda` (uma por área).
- Equipa (professor/pastor/admin) vê os controlos; os restantes veem o vídeo.
- Vídeo: WebRTC ponto a ponto. Sinalização: canal Realtime do Supabase. O estado "AO VIVO" fica em `live_sessions`.
- Conteúdo (avisos, agenda, cursos, lições, liderança, ministérios, galeria): edite em **/admin** (só equipa). Fotos enviadas por membros ficam pendentes até a equipa marcar "Aprovada?" na aba Galeria.

## Limites a conhecer
- Malha 1→N: bom até algumas dezenas de espectadores. Acima disso use um SFU (LiveKit/mediasoup).
- Em 4G/redes restritas é preciso servidor TURN (variáveis `NEXT_PUBLIC_TURN_*`).
- Partilha de ecrã não existe em navegadores móveis → no telemóvel use a opção **Câmara**.
- Segurança: a sinalização usa canais privados (`schema_v4.sql`). Só a equipa envia ofertas de vídeo; espectadores anónimos só conseguem assistir. Limites: há um teto de 40 espectadores por transmissor, e o Supabase limita inícios de sessão anónima por IP (confirme em Authentication → Rate Limits) — uma igreja inteira na mesma rede Wi-Fi pode precisar de um limite maior.
