# Perfil analítico do jogador — Etapa 31E

## Escopo

O perfil é uma leitura agregada e descritiva do histórico pessoal já persistido. Ele não usa
meta, matchup, build ou runa global, não compara o jogador com uma população externa e não
altera ranking, recomendações, pesos, snapshots ou replay. O contrato funcional é
`PlayerProfileOverview`, versionado por `player-profile-overview/1.0.0`.

## Auditoria das fontes reais

| Campo                        | Fonte persistida                                                             | Atualização e cobertura                                | Estado atual / proveniência                                            |
| ---------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Riot ID                      | `RiotAccount.gameName/tagLine`, originado de Account-V1                      | `RiotAccount.updatedAt`, 1/1 quando há vínculo         | disponível, `OFFICIAL`                                                 |
| Ícone de invocador           | nenhum campo no schema                                                       | sem sincronização, 0/0                                 | indisponível; nenhum ícone é inferido                                  |
| Plataforma e região          | `RiotAccount.platformRegion/regionalRouting`                                 | `RiotAccount.updatedAt`, 1/1                           | disponível, `OFFICIAL`; região não é nacionalidade                     |
| Nível                        | nenhum campo no schema                                                       | sem sincronização, 0/0                                 | indisponível                                                           |
| Elo, tier, divisão e LP      | League-V4 ainda não integrada                                                | sem sincronização, 0/0                                 | indisponível; todos os valores permanecem `null`                       |
| Posição principal/secundária | `MatchObservation.normalizedRole`, com fallback para `MatchParticipant.role` | participação entre partidas utilizáveis                | calculado sobre observações; posição sem evidência não é inventada     |
| Partidas recentes            | `Match`, `MatchParticipant`, timeline e relatórios vinculados                | até `PlayerProfile.matchAnalysisLimit`; data do perfil | observado via Match-V5; pode estar vazio ou desatualizado              |
| Campeões utilizados          | agrupamento de participante por campeão e posição                            | mesma janela pessoal                                   | calculado; amostra `< 5` é `SMALL`                                     |
| Desempenho por campeão       | KDA, resultado, farm, dano, ouro, visão e sinais disponíveis                 | mesma janela, por campeão/posição                      | calculado; zero observado é preservado                                 |
| Desempenho por posição       | agrupamento de partidas utilizáveis por posição                              | `games/share/lastObservedAt`                           | calculado; sem equivaler posições diferentes                           |
| Forma recente                | `calculateRecentForm` sobre partidas pessoais                                | mesma janela                                           | derivado, com versão; não é probabilidade de vitória                   |
| Objetivos                    | `MatchParticipant.objectiveParticipation`, takedowns e total do time         | cobertura independente por campo nullable              | observado/calculado; `0` é distinto de `null`                          |
| Visão                        | `visionScorePerMinute` persistido                                            | todas as participações utilizáveis                     | observado/calculado                                                    |
| Consistência                 | desvio-padrão do índice por partida                                          | exige ao menos duas partidas                           | calculado; fica indisponível com amostra menor                         |
| Dano                         | `damagePerMinute`                                                            | participações utilizáveis                              | observado; apresentado no detalhe de partida e usado no índice pessoal |
| Farm                         | `csPerMinute`                                                                | participações utilizáveis                              | observado/calculado                                                    |
| Sobrevivência                | mortes observadas                                                            | participações utilizáveis                              | calculado; zero mortes continua zero                                   |
| Tendência temporal           | métricas pessoais + `Match.startedAt`                                        | somente partidas datadas no período 7/14/30            | calculado; intervalos superiores a 48 h não são conectados             |
| Itens, runas e feitiços      | `MatchObservation` normalizada                                               | cobertura independente por partida                     | observado; ausência não vira configuração padrão                       |

O `updatedAt` principal usa `PlayerProfile.updatedAt`, quando existe, ou `RiotAccount.updatedAt`.
Após sete dias, dados observados passam a `STALE`; eles não são descartados nem apresentados
como atuais. Cada grupo publica `sampleSize`, `availableSampleSize`, `coverage`, `updatedAt`,
`status` e motivo quando necessário.

## Endpoint e isolamento

`GET /me/player-profile` é `OWN_RESOURCE`. O backend deriva `userId` do bearer Sparta, localiza
somente a `RiotAccount` desse usuário e não aceita `playerId`, PUUID ou Riot ID no path/query/body.
O gate central continua exigindo email confirmado, onboarding `READY`, estado Riot permitido e
ownership. Sem vínculo do proprietário, o handler retorna 404; um identificador de outra conta
nunca entra na consulta.

O desktop faz uma chamada agregada, em vez de montar o perfil com uma sequência de endpoints.

## Índices do Sparta

Todos os índices são limitados ao intervalo 0–100, informam amostra, cobertura, fórmula e versão.
As constantes de posição de `roleBaselines` são parâmetros internos de normalização do Sparta,
não estatísticas populacionais, elo médio ou comparação global.

| Índice             | Fórmula `1.0.0`                                                                        |
| ------------------ | -------------------------------------------------------------------------------------- |
| Consistência       | `clamp(100 − 4 × desvio-padrão(índice por partida))`; exige 2 partidas                 |
| Objetivos          | média dos valores disponíveis de `objectiveParticipation × 100`                        |
| Visão              | média de `(visionScore/min ÷ constante interna da posição) × 75`                       |
| Impacto em equipe  | média dos valores disponíveis de `killParticipation × 100`                             |
| Desempenho recente | `calculateRecentForm` sobre a janela ordenada, com decaimento exponencial por recência |
| Sobrevivência      | `normalizeInverse(média de mortes, DEATHS_BAD_VALUE = 7)`                              |
| Farm               | média de `(CS/min ÷ constante interna da posição) × 75`                                |
| Execução           | média de `(KDA ÷ constante interna da posição) × 75`                                   |

Se o campo necessário não existe, o valor é `null` e o status é `UNAVAILABLE`. Se existe em
parte da amostra, o status é `PARTIAL`. `coverage` não é confiança, qualidade de partida,
chance de vitória ou nota da Riot.

## Visualização e acessibilidade

`ProfileAnalytics.tsx` fornece `ProfileHero`, `MetricCard`, `TrendChart`,
`ChampionPerformanceCard`, `RecentMatchRow`, `InsightCard` e `CoverageBadge`; ele reutiliza
`SectionHeader`, `EmptyState`, `ErrorState` e `Skeleton` existentes. Tokens de gráfico vivem em
`ui/tokens.css`.

O gráfico é SVG nativo, sem biblioteca ou peso adicional no bundle e sem licença externa nova.
Ele usa escala fixa 0–100, título, descrição, `<title>` focalizável em cada ponto e lista textual
equivalente. Pontos sem jogos não são fabricados e lacunas maiores que 48 horas formam séries
separadas. `prefers-reduced-motion` remove efeitos não essenciais.

A lista de partidas usa `<button>` real para foco, Enter e Espaço. Riot IDs longos usam truncamento
visual com conteúdo completo em `title`. Nos breakpoints de 1280 e 1080 px, grades são reduzidas,
seções empilham e campos secundários cedem espaço; a largura mínima suportada do aplicativo
permanece 1000 px. Não existe bandeira porque região do servidor não prova nacionalidade.

## Estados explícitos

- sincronização ou API pendente: skeleton sem flash de conteúdo;
- API/consulta falhou: erro, sem placeholders falsos;
- sem partidas: estados vazios independentes para gráfico, campeões, partidas e insights;
- rank, ícone ou nível ausentes: `UNAVAILABLE`, nunca hífen numérico ou estimativa;
- amostra pequena: badge próprio e médias factuais preservadas;
- dado parcial ou desatualizado: aviso e cobertura por seção;
- zero real: renderizado como `0`/`0%`, diferente de “Indisponível”.

## Não regressão

Esta etapa não muda schema Prisma, persistência histórica, autenticação/onboarding, release ativa,
pesos, ranking, recomendação, `ReplayInputBundle` ou algoritmo de replay. O perfil só lê dados já
persistidos e executa agregação pura própria.

## Validação da etapa

Executada em 2026-08-06 sobre o banco local já existente, sem alterar dados de jogador:

- `version:check`, Prisma generate, typecheck, lint e build aprovados;
- 1.155 testes TypeScript aprovados: scripts 15, core 629, Riot 96, API 336 e desktop 79;
- teste do analyzer aprovado;
- imagem da API reconstruída, container saudável e `/health` respondendo 200;
- consulta real do agregado retornou oito métricas, dez partidas, onze agrupamentos de campeão e
  ausência explícita de rank; nenhum valor inválido (`NaN`/`Infinity`) foi produzido;
- rota controlada respondeu 200 derivando a identidade da sessão, sem aceitar Riot ID ou conta
  arbitrária;
- recomendação controlada retornou cinco escolhas principais e uma alternativa, sem persistir
  sessão histórica;
- `release-etapa27c-v1` preservou `artifactHash`
  `8878a65782130a78f7fa47146d4e651158244ce05391a3e767d2e72fd8d9ce90` e `configHash`
  `fa9dbde183efb4ae4d45bf006730ad7486ab1a80253642d33805f1ca4e34aa38`;
- replay real permaneceu `EXACT_REPLAY`, com zero divergências.
