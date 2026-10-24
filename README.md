# Igreja Comunitária Batista do Vale do Quixicongo — Sistema integrado

Next.js (App Router) + React + Tailwind + Supabase + WebRTC.

## Arrancar
1. Crie um projeto no Supabase e execute `supabase/schema.sql` depois `schema_v2.sql`, `schema_v3.sql`, `schema_v4.sql`, `schema_v5.sql`, `schema_v6.sql`, `schema_v7.sql`, `schema_v8.sql`, `schema_v9.sql`, `schema_v10.sql` e `schema_v11.sql` (aulas com cadeiras) no SQL Editor.
2. Em Authentication → Sign In / Providers, ative **Allow anonymous sign-ins** (os espectadores entram assim, sem criar conta).
2. `cp .env.example .env.local` e preencha URL e chave anon (Settings → API).
3. Primeiro acesso do pastor: Supabase → Authentication → Users → Add user → Create new user (email + senha, marque *Auto Confirm User*). Depois, no SQL Editor: `update profiles set role = 'pastor' where id = (select id from auth.users where email = 'EMAIL_DO_PASTOR');`
4. Em Authentication → Sign In / Providers, deixe **LIGADOS** "Allow anonymous sign-ins" e "Allow new users to sign up" (os espectadores entram como anónimos, e isso conta como novo utilizador). Contas criadas por estranhos ficam "não ativadas" (`schema_v6.sql`) e não têm poder nenhum; os acessos reais são criados pelo pastor em **/admin → Utilizadores**.
5. Preencha `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` (chave secreta, só servidor).
6. `npm install && npm run dev` e entre em `/entrar` com email e senha.

## Como funciona a transmissão
- Salas: `culto`, `discipulado`, `teologia`, `agenda` (uma por área).
- Equipa (professor/pastor/admin) vê os controlos; os restantes veem o vídeo.
- Vídeo: WebRTC ponto a ponto. Sinalização: canal Realtime do Supabase. O estado "AO VIVO" fica em `live_sessions`.
- Conteúdo (avisos, agenda, cursos, lições, liderança, ministérios, galeria): edite em **/admin** (só equipa). Fotos enviadas por membros ficam pendentes até a equipa marcar "Aprovada?" na aba Galeria.

## Limites a conhecer
- Malha 1→N: bom até algumas dezenas de espectadores. Acima disso seria preciso um servidor de vídeo (SFU).
- Em 4G/redes restritas é preciso servidor TURN (variáveis `NEXT_PUBLIC_TURN_*`).
- Partilha de ecrã não existe em navegadores móveis → no telemóvel use a opção **Câmara**.
- Segurança: a sinalização usa canais privados (`schema_v4.sql`). Só a equipa envia ofertas de vídeo; espectadores anónimos só conseguem assistir. Limites: há um teto de 40 espectadores por transmissor, e o Supabase limita inícios de sessão anónima por IP (confirme em Authentication → Rate Limits) — uma igreja inteira na mesma rede Wi-Fi pode precisar de um limite maior.

## Se o espectador no telemóvel não vê o vídeo (TURN)
Redes móveis costumam bloquear a ligação direta; é preciso um servidor TURN que reencaminhe o vídeo.
O projeto vai buscar as credenciais a `/api/turn` (servidor), que suporta:
- **Metered Open Relay** (20 GB/mês grátis): crie conta em metered.ca, copie o nome da app (o início de `NOME.metered.live`) e a API Key.
  No Vercel crie `METERED_APP_NAME` e `METERED_API_KEY` (sem `NEXT_PUBLIC_`) e faça Redeploy.
- **Cloudflare Realtime TURN** (1.000 GB/mês grátis, mas exige cartão/PayPal): `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN`.
Se ambos estiverem definidos, a Metered tem prioridade. O vídeo é limitado a ~800 kbps para poupar dados e o limite do TURN.

## Câmara remota (telemóvel filma, computador transmite)
Em /admin → **Câmara remota**, nos dois aparelhos com conta da equipa: escolha a mesma sala; no telemóvel "Este aparelho é a câmara",
no computador "Este aparelho é o monitor". O computador vê a imagem e clica em "Transmitir ao vivo". As salas `cam-*` só a equipa recebe (`schema_v5.sql`).
Nota: navegadores móveis não partilham o ECRÃ do telemóvel (só a câmara). Para mostrar o ecrã do telemóvel, espelhe-o no computador
(Android: scrcpy; iPhone: AirPlay/QuickTime) e use "Partilhar ecrã" no computador.

## Diagnóstico: "Sem permissão no canal"
No SQL Editor do Supabase, confirme que as regras existem:
`select policyname, cmd, roles from pg_policies where schemaname = 'realtime' and tablename = 'messages';`
Devem aparecer 5 linhas com "live": `live host: todos recebem`, `live host: so equipa envia`, `live viewers: todos enviam`,
`live viewers: so equipa recebe` e `live cam: so equipa recebe`. Se faltar alguma, execute o schema_v4/v5 correspondente.

## Espectadores sem conta (como funciona)
As salas públicas (culto, discipulado, teologia, agenda) usam um canal Realtime público: o visitante **não precisa de conta nem de login anónimo**.
A segurança é por assinatura digital: a cada transmissão a equipa cria uma chave (a pública fica em `live_sessions.pubkey`) e assina cada oferta de vídeo;
os espectadores só aceitam ofertas com assinatura válida, por isso ninguém consegue injetar vídeo falso.
Limites: o canal é público, então outros visitantes técnicos podem ver os dados de ligação (inclui IP) trocados no canal; um abusador pode ocupar vagas
(teto de 40 espectadores) mas não consegue trocar o vídeo. As salas `cam-*` (câmara remota) continuam privadas, só para a equipa.

## Reações, comentários e interação
Enquanto uma sala está ao vivo aparece, por baixo do vídeo, o painel de interação (sem precisar de conta):
- **Reações** (👍 ❤️ 🙏 🙌 😮) que sobem no ecrã e contadores; vão por canal em tempo real e não ficam guardadas.
- **Comentários** guardados em `live_comments` (só enquanto a sala está ao vivo; limite de 1 mensagem/2 s por pessoa e 60/min por endereço).
- **Culto e agenda** (modo simples): reações e comentários.
- **Discipulado e teologia** (modo interativo): além disso, "✋ pergunta ao responsável", lista de participantes e, para a equipa, fixar mensagem, marcar pergunta como respondida e apagar.
O servidor decide o selo de cada mensagem (Responsável / Membro / visitante); ninguém consegue fingir ser o responsável.

## O responsável vê reações e comentários a passar
- **Sobre o vídeo:** na pré-visualização do responsável, as reações sobem e os últimos comentários aparecem por cima da imagem (somem após 15 s).
- **Painel noutra janela/ecrã:** botão "Abrir painel de comentários" (ou `/painel/culto`, `/painel/discipulado`…, só equipa) com a lista grande, reações, fixar/responder/apagar. Ideal num segundo monitor, tablet ou telemóvel.
- Atenção: se o responsável partilhar o **ecrã inteiro**, a página com a camada de comentários pode aparecer na transmissão. Prefira partilhar uma **janela ou aba** (ex.: os slides) e ver os comentários noutra janela, ou use o painel noutro aparelho.

## Eco / retorno de som
Quem assiste começa **sem som** (botão para ativar). O transmissor usa cancelamento de eco, redução de ruído e ganho automático, e tem botão para silenciar o som enviado.
Limite físico: vários telemóveis a tocar o mesmo áudio com atrasos diferentes, perto uns dos outros ou do microfone, produzem eco que o software não remove — quem está na igreja deve ficar sem som ou usar fones.

## Banner de informações (rodapé estilo telejornal)
Opcional. Em **/admin → Banner ao vivo** (ou no painel de transmissão) escreva uma informação por linha; desliza no rodapé do vídeo enquanto a sala está ao vivo e atualiza em tempo real.
É uma camada do site (não vai nos pixels do vídeo, por isso não aparece em gravações da transmissão).

## Aulas privadas com cadeiras (discipulado e teologia)
Sem servidor de vídeo e sem contas em serviços de fora: só Supabase + Vercel (e o TURN que já usa nas transmissões).

**Como funciona.** O computador do professor faz de ponte.
- Cada aluno liga-se ao professor e recebe dele a imagem e o som da aula.
- O aluno que recebe a palavra (**cadeira**) envia a sua câmara e microfone ao professor, e o professor reencaminha-os a toda a turma. Quem fala nunca recebe de volta a sua própria imagem (sem eco).
- Pelo Supabase passa **só texto** (sinalização, chat, reações). O vídeo vai direto entre navegadores.
- Só entram **alunos inscritos** numa sala (**/admin → Salas de aula**) com email e senha. Visitantes anónimos não entram.
- O professor define de 0 a 4 cadeiras e se aprova cada pedido (✋) ou é livre. Pode silenciar quem fala, retirar a palavra, remover um aluno e partilhar o ecrã. Quem tem a palavra decide, por si, ligar câmara e/ou microfone.
- Se a rede de um aluno cair, ele volta a ligar sozinho; se estava numa cadeira, mantém-na durante 1 minuto.

**Limites (importante).**
- Tudo passa pelo **upload do professor**. Cada aluno ligado custa uma cópia da imagem dele, mais uma por cada cadeira em uso. O motor divide o orçamento de envio (escolhido no ecrã: 2, 5 ou 10 Mbps) pelos alunos ligados, por isso **quanto mais alunos, menor a qualidade**.
- Teto: **15 alunos ligados** e **4 cadeiras** (`MAX_ALUNOS` e `MAX_SEATS` em `src/lib/aula/protocol.ts`). Para turmas de discipulado (até ~10) serve bem com 5 Mbps de envio; acima disso seria preciso um servidor de vídeo.
- O professor deve usar **computador com cabo ou Wi-Fi forte**, **fones**, e manter o separador **aberto e visível** durante a aula (o navegador abranda separadores escondidos). Se o professor fechar o separador, a aula termina para todos.
- Em redes móveis/restritas é preciso TURN (ver abaixo); o vídeo de cada cadeira passa pelo TURN duas vezes (aluno→professor e professor→turma).
- Segurança: canais privados (`schema_v11.sql`). Só o professor da sala escreve no canal da turma; cada aluno só escreve no seu canal (o nome do canal leva o seu uid e a regra obriga uid = utilizador), por isso ninguém finge ser outro aluno, e o professor vê o nome do cadastro, não o que o aluno escrever.
- Chat, perguntas e reações da turma não ficam guardados.
- O culto e a agenda continuam abertos ao público, no sistema anterior.

**Testar o motor** (professor + 3 alunos com vídeo real num Chromium de teste): ver `tools/aula-test/`.

## Página Início e texto bíblico (schema_v12.sql)
- `/` é agora a página **Início** (agenda dos próximos encontros calculada em hora de Angola, eventos com data, avisos, palavra da semana, ministérios, galeria e contactos). O culto ao vivo passou para `/culto`.
- Conteúdo em **/admin**: *Info da igreja* (contactos, quem somos, palavra da semana…), *Eventos (datas)*, *Agenda*, *Avisos*.
- **Texto bíblico no ecrã**: em /admin → *Texto bíblico*, no painel do transmissor ou em `/painel/culto` (segundo aparelho). Aparece por cima do vídeo a quem assiste, sem partilhar janelas. É uma camada do site (não vai nos pixels do vídeo).
