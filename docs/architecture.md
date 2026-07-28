# Arquitetura

A observabilidade longitudinal segue a mesma separação: o contrato e a
agregação determinística vivem em `packages/core`, a API seleciona a sessão,
o snapshot vigente no lock-in, a partida e a revisão pós-game dentro da conta
autenticada, e o desktop apenas apresenta contagens. O relatório é calculado
sob demanda sobre os históricos imutáveis; não existe cache ou tabela
longitudinal nesta etapa. Ver `docs/recommendation-observability.md`.

O impacto teórico de patch segue a separação estrutural do Sparta: o
algoritmo puro vive em `packages/core`, a API combina a revisão oficial com o
manifesto de capacidades e o desktop apenas apresenta o resultado. A consulta
ocorre fora do motor de recomendação; ver
`docs/theoretical-patch-impact.md`.

Integrações HTTP compartilham taxonomia, timeout e política de retry em
`packages/riot/src/http/`. Cache e stale fallback são decisões por recurso e carregam metadados
de proveniência. Ver `docs/http-resilience.md`.

Sparta usa monorepo pnpm para separar produto desktop, API, domínio compartilhado e serviços auxiliares.

`packages/core` é a camada mais importante: ela não conhece Electron, Fastify, Prisma ou Riot API. Ali ficam tipos como `PlayerProfile`, `Champion`, `DraftState`, `PickRecommendation` e `PostGameAnalysis`, além dos algoritmos iniciais.

`apps/api` protege integrações externas e segredos. A Riot API key fica somente no backend. O desktop chama a API e nunca recebe chave sensível.

`apps/desktop` entrega a experiência premium e minimalista. O MVP tem mocks locais para permitir testar o fluxo antes de integrar LCU e Match-V5.

`services/analyzer` é opcional. Ele existe para preparar análises mais pesadas em Python no futuro sem acoplar o MVP a pandas ou modelos estatísticos.

Decisão importante: o MVP usa heurísticas explicáveis antes de modelos opacos. Isso facilita validação, documentação e ajuste manual dos pesos.
