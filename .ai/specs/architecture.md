# Arquitetura

Sparta usa monorepo pnpm para separar produto desktop, API, domínio compartilhado e serviços auxiliares.

`packages/core` é a camada mais importante: ela não conhece Electron, Fastify, Prisma ou Riot API. Ali ficam tipos como `PlayerProfile`, `Champion`, `DraftState`, `PickRecommendation` e `PostGameAnalysis`, além dos algoritmos iniciais.

`apps/api` protege integrações externas e segredos. A Riot API key fica somente no backend. O desktop chama a API e nunca recebe chave sensível.

`apps/desktop` entrega a experiência premium e minimalista. O MVP tem mocks locais para permitir testar o fluxo antes de integrar LCU e Match-V5.

`services/analyzer` é opcional. Ele existe para preparar análises mais pesadas em Python no futuro sem acoplar o MVP a pandas ou modelos estatísticos.

Decisão importante: o MVP usa heurísticas explicáveis antes de modelos opacos. Isso facilita validação, documentação e ajuste manual dos pesos.
