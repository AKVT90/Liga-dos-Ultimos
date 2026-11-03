# Liga dos Últimos

Webapp (PWA) para anotar estatísticas dos jogos de futebol. Os dados ficam guardados **apenas no dispositivo** (localStorage, em JSON).

## Pôr no GitHub Pages
1. Cria um repositório (ex.: `liga-dos-ultimos`) e carrega todo o conteúdo desta pasta (index.html, style.css, app.js, sw.js, manifest.json e a pasta icons/).
2. Em *Settings → Pages*, escolhe a branch `main` e a pasta `/ (root)`.
3. Abre o endereço `https://<utilizador>.github.io/liga-dos-ultimos/` e, no telemóvel, usa "Adicionar ao ecrã principal".

## Como usar
- **Jogadores**: cria os jogadores; o perfil mostra jogos, pontos, média, win rate, amarelos de carreira e todas as estatísticas.
- **Novo Jogo**: escolhe 5 ou 7 por equipa (botões do meio), atribui os jogadores e começa.
- **Folha de jogo**: lista única com + / − por métrica. Cartão amarelo no canto superior direito (2 amarelos = expulsão de 1 minuto, com contagem decrescente no topo). "Terminar Jogo" pede dupla confirmação.
- **Resumo**: tabela ordenada por pontos; só a coluna MVP é editável.
- **Definições**: regra de pontos (valores negativos permitidos; Defesas e Golos sofridos usam "a cada N, X pontos"), exportar/importar cópia de segurança e apagar dados.

## Regras assumidas
- Resultado = golos + penáltis marcados de cada equipa; um **autogolo conta para a equipa adversária**.
- Vitória dá os pontos de "Vitória", derrota os de "Derrota"; empate não dá nenhum.
- Cada jogo guarda a regra de pontos que estava em vigor quando terminou.
- Foi acrescentada a coluna "Penálti falhado" à folha de jogo, para que essa regra de pontos seja aplicável.

© 2026 José Pedro Fonseca. Todos os direitos reservados. · Powered by AKVT90
