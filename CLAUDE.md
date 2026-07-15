# Sparta - Contexto para Continuidade

Este arquivo é um handoff para outro agente de desenvolvimento continuar o projeto Sparta sem precisar redescobrir a base inteira.

## Pendências desta sessão (ler primeiro)

A ultima sessao (rodando no Cowork, sandbox remoto sem rede real e com o repo montado via OneDrive) implementou quatro coisas e **nao conseguiu commitar nada**: o `.git/index.lock` daquele sandbox ficou travado (permissao negada pra remover, provavelmente o proprio OneDrive ou outro processo segurando o arquivo) e o sandbox nao tinha rede liberada pra `pnpm`/`prisma` CLI. Todo o trabalho abaixo esta no working tree, sem commit.

O que foi feito nessa leva (verifique com `git status` e `git diff` antes de mexer em mais nada):

- **Migration inicial do Prisma** (`apps/api/prisma/migrations/20260715120000_init`), escrita a mao a partir do `schema.prisma` — nunca rodada contra um Postgres real. Schema ganhou `User.passwordHash` e `User.displayName`.
- **Auth completo**: backend (`apps/api/src/modules/auth/*`, rotas `/auth/register`, `/auth/login`, `/auth/me`, `POST /players/link-riot-account`) e frontend (`AuthScreen.tsx`, `LinkRiotAccountScreen.tsx`, `features/api-client.ts`), gating em `App.tsx`. Zero dependencias novas (scrypt + HMAC nativos do `node:crypto`).
- **Deteccao automatica de champion select via LCU** (`packages/riot/src/lcu/read-only-client.ts` real, poll no `apps/desktop/src/main/index.ts`, IPC no preload, `App.tsx` troca de aba sozinho).
- **Estetica**: fontes Rajdhani/Cinzel via Google Fonts, imagens/splash de campeao via Data Dragon (`features/datadragon.ts` no renderer, `packages/riot/src/datadragon/client.ts` no backend).

Passo a passo pra retomar (nessa ordem):

```bash
git status
git add -A
git commit -m "feat: login vinculado a conta riot, migrations do banco, deteccao automatica do champion select e visual novo

- adiciona tela de login/cadastro e vinculo de riot id antes de entrar no app
- cria a migration inicial do prisma (faltava, banco nao rodava de verdade)
- lcu agora detecta quando entro em champion select e troca a aba sozinho
- troca fonte pra rajdhani/cinzel e usa arte oficial dos campeoes (data dragon) no perfil, champion select e dashboard"

npx pnpm@10.34.4 install
docker compose up -d
npx pnpm@10.34.4 --filter @sparta/api prisma:generate
npx pnpm@10.34.4 --filter @sparta/api prisma migrate deploy --schema prisma/schema.prisma
npx pnpm@10.34.4 typecheck
npx pnpm@10.34.4 lint
npx pnpm@10.34.4 test
npx pnpm@10.34.4 build
```

Se `.git/index.lock` existir e o commit falhar (nao deveria acontecer rodando localmente, isso foi peculiaridade do sandbox anterior), so apagar o arquivo manualmente e tentar de novo.

Se `prisma migrate deploy` reclamar de drift (a migration foi escrita a mao, nunca validada contra banco real), o schema e a migration devem bater — se nao bater, ajuste o `migration.sql` ou rode `prisma:migrate` (roda `migrate dev`) pra deixar o Prisma reconciliar.

Depois de rodar tudo isso com sucesso, siga para "Próximos passos recomendados" no fim deste arquivo.

## Leitura obrigatória

Antes de alterar código, leia estes arquivos:

1. `SPARTA_CODEX_INSTRUCTIONS.md` - instruções completas originais do projeto.
2. `README.md` - visão operacional do monorepo.
3. `docs/architecture.md` - arquitetura de alto nível.
4. `docs/riot-compliance.md` - limites de produto e compliance Riot.
5. `docs/scoring-model.md` e `docs/draft-recommendation.md` - regras dos motores iniciais.

## Produto

Sparta é um aplicativo desktop para jogadores de League of Legends focado em:

- análise de perfil do jogador;
- recomendação de campeões no champion select;
- análise pré-game baseada no draft;
- análise pós-game comparando expectativa do draft com execução real.

Escopo explicitamente proibido:

- overlay durante a partida;
- tracking de cooldowns ou summoner spells em tempo real;
- alertas in-game;
- automação de pick, ban, troca de campeão ou runas;
- qualquer assistência durante a partida;
- qualquer uso de Riot API key no frontend/desktop.

O MVP deve permanecer pré-game e pós-game.

## Estado atual

Branch principal: `main`.

Remote esperado:

```txt
origin https://github.com/J-Pantaroto/Sparta.git
```

O monorepo já foi scaffoldado e enviado ao GitHub. A base atual contém:

- `apps/desktop`: Electron + React + TypeScript + Vite.
- `apps/api`: Node.js + Fastify + TypeScript + Zod + Prisma.
- `packages/core`: domínio, tipos fortes, scoring e recommendation engine.
- `packages/riot`: adaptadores iniciais para Riot API, Data Dragon e LCU read-only.
- `packages/ui`: tokens e componentes compartilhados.
- `services/analyzer`: FastAPI opcional para análises futuras em Python.
- `docs`: documentação técnica real.
- `data/seeds`: seeds editáveis de campeões, matchups e composição.
- `.github/workflows/ci.yml`: pipeline inicial.
- `docker-compose.yml`: Postgres, Redis, API e analyzer.

## Stack e versões

Use Node 20 neste ambiente. O projeto está fixado em:

```txt
pnpm@10.34.4
```

Motivo: `pnpm@10.8.2` não existe publicado no npm e `pnpm@11.x` exige Node 22.13 ou superior.

Se `pnpm` não estiver global no PATH, use:

```bash
npx pnpm@10.34.4 <comando>
```

## Comandos principais

Instalar dependências:

```bash
npx pnpm@10.34.4 install
```

Rodar API:

```bash
npx pnpm@10.34.4 dev:api
```

Rodar desktop:

```bash
npx pnpm@10.34.4 dev:desktop
```

Rodar tudo que é TypeScript:

```bash
npx pnpm@10.34.4 typecheck
npx pnpm@10.34.4 lint
npx pnpm@10.34.4 test
npx pnpm@10.34.4 build
```

Rodar analyzer Python:

```bash
python -m pip install -e "services/analyzer[test]"
python -m pytest services/analyzer
```

Subir infraestrutura:

```bash
copy .env.example .env
docker compose up -d
```

Endpoints locais:

```txt
API health:      http://localhost:3333/health
API Swagger:     http://localhost:3333/docs
Analyzer health: http://localhost:8000/health
```

## Estrutura importante

```txt
apps/
  api/
    src/app.ts
    src/server.ts
    src/modules/
    prisma/schema.prisma
  desktop/
    src/main/
    src/preload/
    src/renderer/src/App.tsx
packages/
  core/
    src/types/domain.ts
    src/scoring/champion-performance.ts
    src/draft/recommendation-engine.ts
  riot/
    src/clients/riot-api-client.ts
    src/datadragon/client.ts
    src/lcu/read-only-client.ts
  ui/
    src/theme/tokens.ts
services/
  analyzer/
    app/main.py
docs/
data/seeds/
```

## Domínio já modelado

O arquivo `packages/core/src/types/domain.ts` define os principais contratos:

- `PlayerProfile`
- `RiotAccount`
- `Champion`
- `ChampionTag`
- `PlayerChampionStats`
- `RecentForm`
- `MatchSummary`
- `MatchTimelineSummary`
- `DraftState`
- `TeamComposition`
- `PickRecommendation`
- `RecommendationReason`
- `PostGameAnalysis`
- `PlayerWeakness`
- `PlayerStrength`
- `ReplayImportJob`

Priorize evoluir esses tipos antes de duplicar estruturas em API ou desktop.

## Scoring atual

Arquivo:

```txt
packages/core/src/scoring/champion-performance.ts
```

Regras implementadas:

- score de 0 a 100;
- mínimo de 5 partidas para ranking;
- volume de jogos não aumenta score diretamente;
- volume afeta apenas confiança estatística;
- KDA usa `(kills + assists) / max(1, deaths)`;
- forma recente usa `exp(-index / decayFactor)` com `decayFactor = 8`;
- pesos diferentes para laners, jungle e suporte.

Testes:

```txt
packages/core/src/scoring/champion-performance.test.ts
```

## Recommendation engine atual

Arquivo:

```txt
packages/core/src/draft/recommendation-engine.ts
```

Entradas:

- `DraftState`
- `PlayerProfile`
- `PlayerChampionStats[]`
- `ChampionTag[]`
- `MatchupData[]`
- `CompositionRules`
- `PatchMetaData | null`

Saída:

- 3 a 5 `PickRecommendation`, com score, confiança, categoria, reasons e warnings.

Cenários já considerados:

- first pick;
- lane inimiga revelada;
- quarto/quinto pick com draft mais completo.

Testes:

```txt
packages/core/src/draft/recommendation-engine.test.ts
```

## API atual

Arquivo principal:

```txt
apps/api/src/app.ts
```

Endpoints iniciais:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /players/:riotName/:tagLine/profile`
- `POST /players/sync`
- `POST /players/link-riot-account` (autenticado)
- `GET /players/:puuid/recent-matches?limit=10`
- `GET /players/:puuid/champion-performance`
- `POST /drafts/recommendations`
- `POST /drafts/pre-game-analysis`
- `POST /postgame/analyze`
- `GET /postgame/:matchId`
- `POST /replays/import`
- `GET /replays/:jobId`

Auth (`apps/api/src/modules/auth`): senha com `scrypt` (nativo do `node:crypto`) e token de sessao assinado com HMAC-SHA256 (`node:crypto`, sem `jsonwebtoken`/`bcrypt` como dependencia). Segredo em `AUTH_TOKEN_SECRET` (novo, ver `src/config/env.ts`; tem default de dev, troque em producao). Token vai no header `Authorization: Bearer <token>`.

`POST /players/link-riot-account` ainda nao chama a Account-V1 real: gera um `puuid` deterministico (hash do `gameName#tagLine`) so para permitir o fluxo completo de vinculo de conta. Trocar pela chamada real e o proximo passo natural quando `RIOT_API_KEY` for integrada.

Ainda há mocks em:

```txt
apps/api/src/routes/mock-data.ts
```

Quando integrar Riot API real, mantenha a chave somente no backend e preserve mocks para desenvolvimento sem chave.

## Banco atual

Schema:

```txt
apps/api/prisma/schema.prisma
```

Ha uma migration inicial em `apps/api/prisma/migrations/20260715120000_init`, escrita manualmente a partir do schema (o schema tambem ganhou `User.passwordHash` e `User.displayName` para suportar login). Ela ainda nao foi aplicada/validada contra um Postgres real. Depois de `docker compose up -d`, rode:

```bash
npx pnpm@10.34.4 --filter @sparta/api prisma:generate
npx pnpm@10.34.4 --filter @sparta/api prisma migrate deploy --schema prisma/schema.prisma
```

Se preferir deixar o Prisma re-verificar/gerar a migration do zero (ex.: schema mudou desde entao), use `prisma:migrate` (que roda `migrate dev`) em vez de `migrate deploy`.

Tabelas principais já modeladas:

- `User`
- `RiotAccount`
- `PlayerProfile`
- `Champion`
- `ChampionTag`
- `Match`
- `MatchParticipant`
- `MatchTimeline`
- `PlayerChampionStats`
- `DraftSession`
- `PickRecommendation`
- `PostgameReport`
- `ReplayImportJob`
- `ApiCacheEntry`

Próximo passo natural: criar migrations reais e conectar endpoints de sync/consulta ao Prisma.

## Desktop atual

Entrada:

```txt
apps/desktop/src/renderer/src/App.tsx
```

Telas existentes:

- Login / cadastro (`features/AuthScreen.tsx`);
- Vincular conta Riot (`features/LinkRiotAccountScreen.tsx`);
- Dashboard;
- Perfil;
- Champion Select manual;
- Pré-game;
- Pós-game.

O champion select manual usa o motor real de `@sparta/core` com dados mockados.

Fluxo de sessao (`App.tsx`): ao abrir, restaura token de `localStorage` (`sparta:token`) e chama `GET /auth/me`; sem token ou token invalido cai na tela de login; logado mas sem conta Riot vinculada cai na tela de vinculo; ambas as telas tem botao "continuar sem conta / vincular depois" para nao travar o dev local sem a API rodando. Requer `apps/api` no ar (`VITE_API_URL`, default `http://localhost:3333`); sem API a tela de login mostra erro de conexao mas o skip sempre funciona.

Deteccao automatica de champion select: `packages/riot/src/lcu/read-only-client.ts` agora le o lockfile local do League (`LcuReadOnlyClient`) e faz poll de `GET /lol-gameflow/v1/gameflow-phase` a cada 2.5s no processo main (`apps/desktop/src/main/index.ts`), repassando por IPC (`sparta:gameflow-phase`) para o renderer, que troca a aba para "Champion Select" quando a fase vira `ChampSelect`. Somente leitura, sem nenhuma acao de escrita no cliente (ver `docs/riot-compliance.md`).

Estetica: fonte trocada de Inter para `Rajdhani` (UI geral, visual mais "esportivo") + `Cinzel` para o wordmark "Sparta" e titulos (`h1`, classe `.font-display`), carregadas via Google Fonts no `index.html`. Icones/artes de campeao vem do Data Dragon (`features/datadragon.ts` no renderer; `packages/riot/src/datadragon/client.ts` no backend) — ver `championSquareUrl`/`championSplashUrl`. Continua minimalista/premium, sem landing page nem foco em marketing.

Estilo:

- preto profundo;
- superfícies quase pretas;
- vermelho discreto;
- minimalista/premium;
- sem landing page;
- foco em leitura rápida.

## Analyzer Python atual

Arquivo:

```txt
services/analyzer/app/main.py
```

Endpoints:

- `GET /health`
- `POST /replay/import`

Replay parsing completo não faz parte do MVP. Mantenha como experimental até haver base técnica e revisão de compliance.

## Seeds atuais

Arquivos:

```txt
data/seeds/champion-tags.json
data/seeds/matchup-seed.json
data/seeds/composition-rules.json
```

Os dados são manuais e pequenos de propósito. Não bloqueie evolução do produto esperando dataset perfeito.

## Git e scripts

Remote é lido de:

```txt
git.txt
```

Scripts:

```txt
scripts/read-git-remote.ts
scripts/push-to-github.sh
scripts/setup.ps1
scripts/setup.sh
```

Comandos:

```bash
npx pnpm@10.34.4 github:setup
bash scripts/push-to-github.sh
```

Não usar force push sem pedido explícito.

## Regras de implementação

1. Preserve a separação entre desktop, API, core, riot, ui e analyzer.
2. Não coloque lógica de scoring dentro do React se ela pertence ao `packages/core`.
3. Não coloque Riot API key no desktop.
4. Use Zod para payloads HTTP.
5. Use tipos fortes do `@sparta/core`.
6. Mantenha recomendações explicáveis, com reasons e warnings.
7. Não implemente recursos in-game.
8. Não automatize ações no client.
9. Para integrações Riot/LCU, documente endpoints e finalidade.
10. Rode typecheck, lint e testes antes de concluir alterações relevantes.

## Próximos passos recomendados

1. Validar a migration inicial (`20260715120000_init`) contra um Postgres real via `docker compose up -d` + `prisma migrate deploy` (escrita a mao, ainda nao testada rodando).
2. Implementar repositórios/services da API para substituir mocks gradualmente (login/vinculo de conta ja usam Prisma de verdade; drafts/postgame/replays ainda sao mock).
3. Integrar Account-V1 para Riot ID -> PUUID no backend, substituindo o puuid deterministico mock de `POST /players/link-riot-account`.
4. Integrar Match-V5 para histórico e detalhes de partidas.
5. Persistir `PlayerChampionStats` calculado por janelas de 10, 20 e 50 partidas.
6. Melhorar `ChampionTag` e seeds com mais campeões (e usar o `key` real do Data Dragon em vez do nome de exibição para montar URLs de imagem).
7. ~~Conectar desktop à API~~ feito para auth (`VITE_API_URL`); estender para os demais endpoints (perfil, drafts, pós-game) que ainda usam `features/mock-data.ts` local.
8. Expandir análise pós-game com timeline: mortes cedo, CS aos 10/15, gold diff, visão e objetivos.
9. Implementar jobs com Redis/BullMQ para sync de partidas.
10. LCU read-only: ja implementado o poll de `gameflow-phase` para trocar de aba (ver `docs/riot-compliance.md`); proximo passo e ler `/lol-champ-select/v1/session` (metodo ja existe em `LcuReadOnlyClient.getChampionSelectSession`) para pre-carregar o draft real em vez do modo manual.
11. Trocar o token HMAC caseiro por algo mais robusto (rotacao de segredo, refresh token) se o produto for alem do MVP local.

## Verificação conhecida

Última bateria executada com sucesso no scaffold:

```bash
npx pnpm@10.34.4 typecheck
npx pnpm@10.34.4 lint
npx pnpm@10.34.4 test
npx pnpm@10.34.4 build
python -m pytest services/analyzer
```

O teste Python pode exigir antes:

```bash
python -m pip install -e "services/analyzer[test]"
```

## Cuidado com arquivos gerados

Não commitar:

- `.env`;
- `node_modules`;
- `dist`;
- `build`;
- `out`;
- `coverage`;
- `.pytest_cache`;
- `*.egg-info`;
- logs;
- bancos SQLite locais.

O `.gitignore` já cobre esses casos.
