# Sparta

Sparta é um aplicativo desktop para jogadores de League of Legends focado em análise de perfil, recomendação explicável de campeões no champion select, análise pré-game e análise pós-game.

O produto não implementa overlay, tracking durante a partida, automação de pick/ban ou qualquer assistência em tempo real. Toda análise do MVP acontece antes ou depois da partida.

## Stack

- Desktop: Electron, React, Vite e TypeScript.
- API: Node.js, Fastify, Zod e TypeScript.
- Domínio: pacote `@sparta/core` com tipos, scoring e motor de draft.
- Banco principal: PostgreSQL com Prisma.
- Cache/fila: Redis.
- Analyzer opcional: Python, FastAPI e pytest.
- Monorepo: pnpm workspaces.
- CI: GitHub Actions.

## Estrutura

```txt
apps/desktop      App Electron + React
apps/api          Backend Fastify e Prisma
packages/core     Domínio, tipos e algoritmos
packages/riot     Adaptadores Riot, Data Dragon e LCU read-only
packages/ui       Tokens e componentes compartilhados
services/analyzer Serviço Python opcional
docs              Documentação técnica
data/seeds        Seeds editáveis de campeões, matchups e composição
scripts           Setup e push GitHub
```

## Setup local

```bash
corepack enable
corepack prepare pnpm@10.34.4 --activate
pnpm install
cp .env.example .env
```

No PowerShell:

```powershell
.\scripts\setup.ps1
```

Configure `RIOT_API_KEY` apenas no `.env`. Nunca coloque a chave no desktop ou em código versionado.

## Desenvolvimento

```bash
pnpm dev:api
pnpm dev:desktop
```

API:

```txt
http://localhost:3333/health
http://localhost:3333/docs
```

Analyzer:

```txt
http://localhost:8000/health
```

## Docker

```bash
docker compose up -d
docker compose logs -f api
```

O Electron roda fora do Docker no fluxo de desenvolvimento.

## Banco

```bash
pnpm --filter @sparta/api prisma:generate
pnpm --filter @sparta/api prisma:migrate
pnpm --filter @sparta/api prisma:seed
```

## Testes e build

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pytest services/analyzer
```

## GitHub

O arquivo `git.txt` contém a URL do repositório. Para configurar o remote:

```bash
pnpm github:setup
```

Para criar commit e tentar push:

```bash
bash scripts/push-to-github.sh
```

Se o push falhar, autentique com GitHub CLI, token HTTPS ou SSH e rode o comando novamente. O script não executa force push.

## Status do MVP

- Monorepo criado.
- API com endpoints iniciais e `/health`.
- Analyzer com `/health`.
- Desktop com dashboard, perfil, champion select manual, pré-game e pós-game.
- Scoring inicial de melhores campeões com mínimo de 5 partidas.
- Recomendações de draft explicáveis.
- Prisma schema inicial.
- Docker Compose com Postgres, Redis, API e analyzer.
- Documentação técnica em `docs/`.

## Próximos passos

1. Conectar Riot API real no backend.
2. Persistir sync de partidas no PostgreSQL.
3. Enriquecer seeds de campeões e matchups.
4. Evoluir análise pré-game e pós-game com timeline Match-V5.
5. Validar integração LCU read-only com documentação de endpoints usados.
