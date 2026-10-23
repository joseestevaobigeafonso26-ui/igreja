# Teste do motor da aula

Abre 1 professor + 3 alunos num Chromium com câmara/microfone falsos e liga-os por WebRTC de verdade
(só a sinalização é simulada, em memória). Confirma: aluno vê o professor, cadeira reencaminhada à turma,
sem eco, limite de cadeiras, silenciar/retirar, chat sem fingir nomes, recuperação de quedas, aba duplicada,
turma cheia, oferta perdida e fim da aula.

    npm i --no-save playwright esbuild
    npx playwright install chromium        # ou: export CHROMIUM=/caminho/do/chrome
    npx esbuild tools/aula-test/harness.ts --bundle --outfile=tools/aula-test/harness.js --format=iife --target=es2020
    node tools/aula-test/run.js
