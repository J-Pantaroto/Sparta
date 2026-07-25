# Sparta — Instruções para o Codex

Este arquivo contém as instruções de execução para o Codex estruturar, documentar, containerizar e versionar o projeto **Sparta**.

O Sparta é um aplicativo desktop elegante e minimalista para League of Legends, focado em:

1. análise do perfil do jogador;
2. recomendações de campeões durante a champion select;
3. análise prévia da partida com base no draft;
4. análise pós-partida;
5. refinamento contínuo da análise dos melhores campeões do usuário.

**Escopo explicitamente excluído:** não implementar assistência durante a partida em andamento, overlay tático em tempo real, tracking de cooldowns inimigos, automação de decisões, automação de pick/ban, leitura de informação que o jogador não teria acesso normalmente, ou qualquer comportamento que possa ser interpretado como vantagem competitiva indevida.

---

## 1. Objetivo principal

Criar a estrutura inicial completa do projeto **Sparta**, pronta para desenvolvimento contínuo, com:

- monorepo organizado;
- aplicação desktop;
- backend/API;
- banco de dados;
- serviço de análise;
- Docker e Docker Compose;
- documentação completa;
- integração com GitHub usando o arquivo `git.txt`;
- estrutura de testes;
- arquitetura preparada para integração com Riot API, Data Dragon, Match-V5 e champion select local via League Client API/LCU;
- design system minimalista preto com detalhes vermelhos.

O resultado deve ser um projeto real, executável em ambiente de desenvolvimento, mesmo que algumas integrações externas fiquem inicialmente como adaptadores, stubs seguros ou interfaces documentadas.

---

## 2. Stack recomendada

Use esta stack como padrão:

```txt
Linguagem principal: TypeScript
Desktop: Electron + React + Vite + TypeScript
Backend: Node.js + Fastify + TypeScript
Banco principal: PostgreSQL
ORM: Prisma
Cache/fila: Redis + BullMQ
Serviço analítico opcional: Python + FastAPI + pandas + scikit-learn
Cache local desktop: SQLite ou armazenamento local seguro
Gerenciador de pacotes: pnpm
Monorepo: pnpm workspaces
Testes TS: Vitest
Testes Python: pytest
Lint/format: ESLint + Prettier
Containerização: Docker + Docker Compose
CI: GitHub Actions
```

Caso algum detalhe seja incompatível com o ambiente, escolha a alternativa mais simples, mas documente a decisão em `docs/adr/`.

---

## 3. Estrutura esperada do repositório

Crie a seguinte estrutura inicial:

```txt
sparta/
  apps/
    desktop/
      src/
        main/
        preload/
        renderer/
          components/
          pages/
          features/
          styles/
          assets/
      electron.vite.config.ts
      package.json
    api/
      src/
        modules/
          auth/
          riot/
          players/
          matches/
          champions/
          recommendations/
          drafts/
          postgame/
          health/
        config/
        db/
        jobs/
        routes/
        server.ts
      prisma/
        schema.prisma
        seed.ts
      package.json
  services/
    analyzer/
      app/
        main.py
        scoring/
        models/
        schemas/
        tests/
      pyproject.toml
      Dockerfile
  packages/
    core/
      src/
        domain/
        scoring/
        draft/
        champion-tags/
        types/
        utils/
      package.json
    riot/
      src/
        clients/
        dto/
        rate-limit/
        lcu/
        datadragon/
      package.json
    ui/
      src/
        components/
        theme/
        tokens.ts
      package.json
  docs/
    README.md
    architecture.md
    setup.md
    docker.md
    github.md
    riot-compliance.md
    scoring-model.md
    draft-recommendation.md
    postgame-analysis.md
    replay-analysis.md
    api.md
    database.md
    design-system.md
    adr/
      0001-project-architecture.md
  data/
    seeds/
      champion-tags.json
      matchup-seed.json
      composition-rules.json
  scripts/
    setup.sh
    setup.ps1
    read-git-remote.ts
    push-to-github.sh
  .github/
    workflows/
      ci.yml
  docker-compose.yml
  Dockerfile.api
  Dockerfile.desktop-dev
  .dockerignore
  .gitignore
  .env.example
  package.json
  pnpm-workspace.yaml
  README.md
```

Se o repositório já existir com uma estrutura parcial, preserve o que houver e adapte sem apagar trabalho existente.

---

## 4. Docker e ambiente local

Crie um `docker-compose.yml` com, no mínimo:

```txt
postgres
redis
api
analyzer
```

O desktop Electron pode rodar fora do Docker em modo desenvolvimento, mas deve existir documentação clara sobre isso.

Requisitos:

- `docker compose up -d` deve subir banco, cache, API e serviço analítico.
- A API deve expor `/health`.
- O analyzer deve expor `/health`.
- O Postgres deve ter volume persistente.
- O Redis deve ter volume ou configuração documentada.
- Criar `.env.example` com todas as variáveis necessárias.
- Nunca commitar `.env` real.

Exemplo de variáveis:

```env
NODE_ENV=development
API_PORT=3333
DATABASE_URL=postgresql://sparta:sparta@postgres:5432/sparta
REDIS_URL=redis://redis:6379
RIOT_API_KEY=change_me
RIOT_PLATFORM_REGION=br1
RIOT_REGIONAL_ROUTING=americas
DATA_DRAGON_LOCALE=pt_BR
ANALYZER_URL=http://analyzer:8000
```

---

## 5. Integração com GitHub via `git.txt`

O usuário criará um arquivo chamado `git.txt` na raiz do projeto contendo o link do repositório GitHub.

Implemente scripts para:

1. ler o arquivo `git.txt`;
2. extrair a primeira URL válida;
3. verificar se a pasta já é um repositório Git;
4. caso não seja, rodar `git init`;
5. configurar branch principal como `main`;
6. adicionar ou atualizar `origin` com a URL do `git.txt`;
7. rodar `git status`;
8. adicionar arquivos;
9. criar commit inicial se houver alterações;
10. executar push para `origin main`.

Regras:

- Não commitar `.env`, chaves, tokens, arquivos temporários, logs ou builds.
- Se o remote já existir com outra URL, atualizar para a URL do `git.txt`, mas registrar isso no terminal.
- Se o push falhar por autenticação, exibir mensagem clara pedindo login via GitHub CLI, token ou SSH.
- Não forçar push (`--force`) sem instrução explícita do usuário.
- Criar documentação em `docs/github.md` explicando o processo.

Script esperado:

```bash
bash scripts/push-to-github.sh
```

O script deve ser seguro, com mensagens claras e tratamento de erro.

---

## 6. Compliance e limites de produto

Crie `docs/riot-compliance.md` com os seguintes princípios:

- O Sparta deve ser registrado no Riot Developer Portal antes de uso público.
- A Riot API key deve ficar apenas no backend, nunca no app desktop distribuído.
- O app deve usar dados oficiais e respeitar rate limits.
- O app pode sugerir picks, mas não deve tomar decisões automaticamente pelo usuário.
- O app não deve executar pick, ban, troca de campeão, troca de runa ou qualquer ação no cliente sem confirmação explícita e sem aprovação compatível.
- O app não deve fornecer assistência durante a partida.
- O app não deve rastrear cooldowns inimigos, summoner spells inimigos ou qualquer dado que não esteja legitimamente disponível ao jogador via API aprovada.
- A integração com LCU deve ser tratada como local, read-only no MVP, com endpoints documentados.
- Caso algum endpoint da League Client API seja usado, documentar nome do endpoint, finalidade, payload esperado e justificativa.

Inclua links de referência oficiais no documento, especialmente:

```txt
https://developer.riotgames.com/
https://developer.riotgames.com/docs/lol
https://developer.riotgames.com/apis
https://developer.riotgames.com/policies/general
```

---

## 7. Domínio principal do Sparta

Modele o domínio em `packages/core` com tipos fortes.

Entidades principais:

```ts
PlayerProfile
RiotAccount
Champion
ChampionTag
PlayerChampionStats
RecentForm
MatchSummary
MatchTimelineSummary
DraftState
TeamComposition
PickRecommendation
RecommendationReason
PostGameAnalysis
PlayerWeakness
PlayerStrength
ReplayImportJob
```

Exemplo de `PickRecommendation`:

```ts
export interface PickRecommendation {
  championId: number;
  championName: string;
  role: Role;
  totalScore: number;
  confidence: 'low' | 'medium' | 'high';
  category: 'best_blind' | 'best_matchup' | 'best_teamfit' | 'safe_pick' | 'comfort_pick';
  reasons: RecommendationReason[];
  warnings: RecommendationReason[];
  metrics: {
    personalPerformance: number;
    recentForm: number;
    matchup: number;
    blindSafety: number;
    allySynergy: number;
    enemyDraftAnswer: number;
    compositionFit: number;
    meta: number;
  };
}
```

---

## 8. Análise do jogador

O Sparta deve analisar múltiplas janelas de partidas:

```txt
Últimas 10 partidas  -> forma atual
Últimas 20 partidas  -> tendência recente
Últimas 50 partidas  -> perfil confiável
Histórico maior      -> contexto, sem favorecer volume de jogos
```

A análise deve identificar:

- campeões com melhor desempenho;
- campeões com pior desempenho;
- campeões seguros para blind pick;
- campeões bons para counterpick;
- campeões que o jogador joga muito, mas performa mal;
- campeões que o jogador joga pouco, mas performa bem;
- queda ou melhora recente;
- padrões de morte;
- farm aos 10/15 minutos;
- dano por minuto;
- gold por minuto;
- visão;
- participação em abates;
- objetivo e pressão por mapa quando disponível via timeline.

### Regra importante sobre quantidade de jogos

O Sparta não deve simplesmente recomendar o campeão com mais jogos.

A regra principal:

```txt
Para entrar no ranking de melhores campeões, o campeão precisa ter pelo menos 5 partidas.
A partir de 5 partidas, a quantidade de jogos não deve aumentar diretamente o score.
O score deve medir desempenho, não volume.
```

A quantidade de jogos pode afetar apenas a **confiança estatística**, não a pontuação principal.

Exemplo:

```txt
Campeão A: 6 jogos, KDA 4.2, bom farm, boas mortes, bom dano -> score alto, confiança média
Campeão B: 60 jogos, KDA 2.1, muitas mortes, baixo impacto -> score baixo, confiança alta
```

Neste caso, o Campeão A pode ser recomendado acima do Campeão B, com aviso de amostra menor.

---

## 9. Champion Performance Score

Crie o algoritmo inicial em `packages/core/src/scoring/champion-performance.ts`.

O score deve variar de 0 a 100.

Base sugerida para laners:

```txt
20% KDA normalizado
15% winrate
15% CS/min
15% dano/min
10% gold/min
10% baixa média de mortes
10% forma recente
5% visão/objetivos
```

Base sugerida para jungle:

```txt
15% KDA normalizado
15% winrate
15% participação em abates
15% controle de objetivos
10% gold/min
10% dano/min
10% mortes evitadas
10% forma recente
```

Base sugerida para suporte:

```txt
20% participação em abates
20% visão
15% mortes evitadas
15% controle de objetivos
10% KDA normalizado
10% winrate
10% forma recente
```

Implemente normalização por role sempre que possível. Não compare suporte com mid usando o mesmo peso bruto.

### KDA

Use:

```txt
KDA = (kills + assists) / max(1, deaths)
```

Não permita divisão por zero.

### Forma recente

A forma recente deve pesar mais as últimas partidas:

```txt
matchWeight = exp(-index / decayFactor)
```

Onde `index = 0` é a partida mais recente.

Comece com `decayFactor = 8` e documente.

---

## 10. Sistema de recomendação de pick

Crie o algoritmo em `packages/core/src/draft/recommendation-engine.ts`.

O sistema deve receber:

```ts
DraftState
PlayerProfile
PlayerChampionStats[]
ChampionTag[]
MatchupData[]
CompositionRules
PatchMetaData | null
```

E retornar de 3 a 5 sugestões ordenadas.

Score geral:

```txt
Pick Score =
  desempenho pessoal
+ forma recente
+ matchup
+ blind safety
+ sinergia com aliados
+ resposta ao draft inimigo
+ encaixe na composição
+ meta do patch
```

### Caso 1: jogador é first pick

Priorizar:

```txt
45% desempenho pessoal
20% blind safety
15% versatilidade
10% forma recente
5% meta
5% conforto/confiança
```

Recomendar campeões:

- seguros;
- versáteis;
- bons no histórico do jogador;
- difíceis de counterar;
- úteis em múltiplas composições.

### Caso 2: inimigo da lane já apareceu

Priorizar:

```txt
35% desempenho pessoal
25% matchup
15% forma recente
10% sinergia com aliados
10% resposta ao draft inimigo
5% meta
```

Recomendar campeões:

- bons ou equilibrados contra a matchup;
- bons para o jogador;
- que não prejudiquem a composição aliada.

### Caso 3: jogador é quarto ou quinto pick

Priorizar:

```txt
30% desempenho pessoal
20% resposta ao draft inimigo
20% sinergia com aliados
15% matchup direta
10% forma recente
5% meta
```

Analisar o draft completo:

- dano AP/AD;
- frontline;
- engage;
- peel;
- wave clear;
- pickoff;
- scaling;
- early pressure;
- split push;
- teamfight;
- alcance;
- controle de objetivos;
- excesso de campeões frágeis;
- falta de CC;
- falta de dano consistente.

---

## 11. Explicabilidade das recomendações

Toda sugestão deve ter motivo claro.

Exemplo esperado:

```txt
1. Orianna — melhor encaixe para o draft
Você tem 8 jogos com Orianna, KDA médio 3.7 e bom CS/min.
Seu time tem Ornn e Sejuani, então a ultimate da Orianna combina com o engage.
O time inimigo tem pouca ameaça de dive direto, tornando a escolha segura.

Aviso: sua amostra é média, então a confiança é medium.
```

Não basta exibir score numérico. Sempre explique:

- por que o campeão foi recomendado;
- por que ele encaixa na situação;
- qual é o risco;
- qual é o plano pré-game sugerido.

---

## 12. Análise prévia da partida

Após o draft estar completo ou quase completo, gerar uma análise pré-game:

```txt
Seu time tem:
- pontos fortes;
- pontos fracos;
- condição de vitória;
- picos de poder;
- riscos principais.

Time inimigo tem:
- pontos fortes;
- pontos fracos;
- condição de vitória provável;
- ameaças principais.

Plano sugerido:
- estilo de jogo recomendado;
- prioridade de objetivos;
- cuidado com spikes inimigos;
- como o pick escolhido deve funcionar na composição.
```

Essa análise deve ser feita antes da partida começar. Não implementar camada de orientação em tempo real durante a partida.

---

## 13. Análise pós-partida

Após a partida, o Sparta deve comparar:

```txt
recomendação pré-game
vs
resultado real da partida
```

Gerar relatório com:

- se o pick recomendado fazia sentido;
- se a execução foi coerente com o plano;
- mortes antes de 10/15 minutos;
- CS aos 10/15 minutos;
- gold difference quando disponível;
- dano total e dano por minuto;
- visão;
- participação em objetivos;
- participação em abates;
- principais erros prováveis;
- pontos fortes;
- 3 dicas práticas para a próxima partida.

Exemplo:

```txt
A escolha de Orianna fazia sentido porque seu time tinha engage forte.
Porém, você morreu duas vezes antes do primeiro item e perdeu prioridade de rota.
Na próxima partida, priorize wave control e evite trocar sem visão do jungle inimigo.
```

---

## 14. Replays

Não implementar parser completo de `.rofl` no MVP.

Criar apenas:

```txt
services/analyzer/app/replay/
apps/api/src/modules/replays/
docs/replay-analysis.md
```

Documentar que análise de replay será recurso avançado/experimental.

Fase inicial de replay:

- permitir registrar um arquivo local como job de importação;
- validar extensão;
- salvar metadados;
- retornar status `not_implemented` ou `experimental`;
- não prometer análise visual completa.

Fase futura opcional:

- importar replay local;
- extrair timeline se viável;
- processar vídeo/frames apenas se houver base técnica e compliance claros;
- usar OpenCV apenas em fase posterior.

---

## 15. Dados de campeões, matchups e composição

Criar seeds editáveis em JSON:

```txt
data/seeds/champion-tags.json
data/seeds/matchup-seed.json
data/seeds/composition-rules.json
```

`champion-tags.json` deve conter atributos como:

```json
{
  "championName": "Orianna",
  "roles": ["MID"],
  "damageProfile": "AP",
  "tags": ["control_mage", "teamfight", "scaling", "waveclear"],
  "blindSafety": 0.82,
  "difficulty": 0.7,
  "engage": 0.4,
  "peel": 0.6,
  "frontline": 0.1,
  "pickoff": 0.5,
  "waveclear": 0.9,
  "scaling": 0.85,
  "earlyPressure": 0.45
}
```

Esses dados podem começar manualmente e serem refinados depois.

Não bloquear o projeto esperando dataset perfeito.

---

## 16. Integrações Riot

Criar adaptadores em `packages/riot` para:

```txt
Account-V1: Riot ID -> PUUID
Summoner/League quando necessário para ranked/profile
Match-V5: histórico de partidas e detalhes da partida
Match timeline: eventos e dados por minuto quando disponível
Data Dragon: campeões, spells, itens, runas, assets e versões
LCU local: champion select, read-only no MVP
```

Regras:

- todas as chamadas externas devem passar por cliente central com rate limit;
- implementar retry com backoff para erros transitórios;
- cachear Data Dragon por versão;
- cachear partidas já analisadas;
- nunca expor `RIOT_API_KEY` para o desktop;
- criar mocks para desenvolvimento sem chave da Riot;
- documentar endpoints usados em `docs/api.md` e `docs/riot-compliance.md`.

---

## 17. Banco de dados

Criar schema Prisma inicial com tabelas equivalentes a:

```txt
users
riot_accounts
player_profiles
matches
match_participants
match_timelines
champions
champion_tags
player_champion_stats
draft_sessions
pick_recommendations
postgame_reports
replay_import_jobs
api_cache_entries
```

Requisitos:

- índice por `puuid`;
- índice por `matchId`;
- índice por `championId`;
- não duplicar partidas já processadas;
- guardar patch/version quando possível;
- guardar região/platform;
- guardar snapshot da recomendação feita na champion select para comparação pós-game.

---

## 18. API mínima

Criar endpoints iniciais:

```txt
GET  /health
GET  /players/:riotName/:tagLine/profile
POST /players/sync
GET  /players/:puuid/recent-matches?limit=10
GET  /players/:puuid/champion-performance
POST /drafts/recommendations
POST /drafts/pre-game-analysis
POST /postgame/analyze
GET  /postgame/:matchId
POST /replays/import
GET  /replays/:jobId
```

Validar payloads com Zod.

Gerar OpenAPI/Swagger em `/docs` ou `/openapi`.

---

## 19. Desktop app

O app desktop deve ter estas telas:

```txt
1. Onboarding
   - inserir Riot ID: Nome#TAG
   - selecionar região/plataforma

2. Dashboard
   - forma recente
   - melhores campeões
   - pontos fortes
   - pontos fracos

3. Champion Select
   - modo manual primeiro
   - futura integração LCU
   - recomendações de pick
   - explicação de cada pick

4. Análise Pré-Game
   - comparação das composições
   - condição de vitória
   - riscos
   - plano sugerido

5. Pós-Game
   - relatório da partida
   - comparação com recomendação
   - dicas práticas

6. Configurações
   - região
   - chave/estado de conexão do backend
   - privacidade
   - modo desenvolvedor
```

No MVP, implemente champion select manual antes da automação por LCU.

---

## 20. Design system do Sparta

Design elegante, minimalista, escuro, com detalhes vermelhos.

Direção visual:

```txt
Base: preto profundo
Superfícies: cinza quase preto
Texto: branco suave/cinza claro
Detalhes: vermelho espartano discreto
Bordas: sutis
Componentes: limpos, com bastante espaçamento
Animações: mínimas e elegantes
```

Tokens sugeridos:

```ts
export const theme = {
  colors: {
    background: '#050505',
    surface: '#0B0B0D',
    surfaceElevated: '#121216',
    border: '#24242A',
    textPrimary: '#F5F5F6',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    red: '#DC2626',
    redSoft: '#7F1D1D',
    redGlow: 'rgba(220, 38, 38, 0.32)',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444'
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '18px',
    xl: '24px'
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px'
  }
};
```

UI desejada:

- cards escuros;
- bordas finas;
- vermelho apenas para destaque;
- nada poluído;
- evitar excesso de gráficos no MVP;
- usar explicações claras;
- priorizar leitura rápida durante champion select.

---

## 21. Documentação obrigatória

Criar documentação em:

```txt
README.md
```

Com:

- descrição do projeto;
- funcionalidades;
- stack;
- como rodar;
- como configurar `.env`;
- como subir Docker;
- como rodar desktop;
- como rodar testes;
- como contribuir;
- status do projeto.

Criar também:

```txt
docs/architecture.md
docs/setup.md
docs/docker.md
docs/github.md
docs/riot-compliance.md
docs/scoring-model.md
docs/draft-recommendation.md
docs/postgame-analysis.md
docs/replay-analysis.md
docs/api.md
docs/database.md
docs/design-system.md
```

Cada documento deve ter conteúdo real, não apenas título vazio.

---

## 22. Testes

Criar testes para:

```txt
Champion Performance Score
Pick Recommendation Engine
Draft composition analysis
KDA calculation
Recency weighting
Git URL extraction from git.txt
API healthcheck
Zod payload validation
Analyzer healthcheck
```

Critérios:

- `pnpm test` deve rodar testes TypeScript;
- `pytest` deve rodar testes Python;
- CI deve executar lint, typecheck e testes.

---

## 23. GitHub Actions

Criar `.github/workflows/ci.yml` com:

- install pnpm;
- install dependencies;
- typecheck;
- lint;
- tests;
- build dos pacotes TypeScript;
- opcional: testes Python do analyzer.

Não exigir secrets para rodar CI básico.

---

## 24. Segurança e privacidade

Implementar e documentar:

- `.env.example` sem segredos reais;
- `.gitignore` completo;
- não salvar API key no app desktop;
- logs sem dados sensíveis;
- cache com TTL;
- opção futura de deletar dados do usuário;
- separação entre dados locais e backend;
- mocks para desenvolvimento.

---

## 25. Critérios de aceite

Ao finalizar, o Codex deve garantir:

```txt
[ ] Projeto chama Sparta em todos os locais relevantes.
[ ] Monorepo criado com pnpm workspaces.
[ ] Docker Compose criado e funcional.
[ ] API sobe com /health.
[ ] Analyzer sobe com /health.
[ ] Desktop Electron abre uma UI inicial escura/minimalista.
[ ] README.md completo.
[ ] docs/ preenchido com documentação real.
[ ] .env.example criado.
[ ] .gitignore seguro criado.
[ ] Prisma schema inicial criado.
[ ] Algoritmo inicial de champion performance implementado.
[ ] Algoritmo inicial de draft recommendation implementado.
[ ] Testes iniciais criados.
[ ] GitHub Actions criado.
[ ] Script lê git.txt e configura remote.
[ ] Script de push para GitHub criado.
[ ] Nenhuma chave ou segredo commitado.
[ ] Replays documentados como recurso futuro/experimental.
[ ] Escopo exclui assistência durante a partida.
```

---

## 26. Ordem de execução recomendada para o Codex

Execute nesta ordem:

```txt
1. Inspecionar a pasta atual.
2. Verificar se existe package.json, .git e git.txt.
3. Criar estrutura do monorepo sem apagar arquivos existentes.
4. Criar configs base: pnpm, tsconfig, eslint, prettier.
5. Criar Docker Compose e Dockerfiles.
6. Criar API Fastify com /health.
7. Criar analyzer FastAPI com /health.
8. Criar Prisma schema e seed base.
9. Criar packages/core com tipos e algoritmos iniciais.
10. Criar packages/riot com clientes, mocks e interfaces.
11. Criar desktop Electron com UI inicial.
12. Criar documentação completa.
13. Criar testes.
14. Criar GitHub Actions.
15. Criar scripts de setup e push.
16. Rodar format, lint, typecheck e tests.
17. Ler git.txt e configurar origin.
18. Fazer commit inicial.
19. Fazer push para GitHub se autenticação estiver disponível.
20. Exibir resumo final do que foi criado e comandos para rodar.
```

---

## 27. Saída final esperada do Codex

Ao terminar, o Codex deve exibir um resumo com:

```txt
- estrutura criada;
- comandos para rodar localmente;
- comandos Docker;
- como configurar Riot API key;
- como usar git.txt;
- status do push para GitHub;
- próximos passos recomendados;
- limitações atuais;
- arquivos principais alterados/criados.
```

---

## 28. Observações finais

O Sparta deve ser construído com foco em qualidade, clareza e evolução.

Prioridade do MVP:

```txt
1. análise confiável do jogador;
2. ranking de melhores campeões com mínimo de 5 jogos;
3. recomendação explicável de champion select;
4. análise pré-game;
5. análise pós-game;
6. documentação e infraestrutura sólidas.
```

Não tentar resolver replays, IA avançada ou modelo perfeito no primeiro commit.

Primeiro entregar uma base robusta, testável, documentada e extensível.
