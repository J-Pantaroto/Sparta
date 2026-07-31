# Changelog

Histórico de features do Sparta, mais recente primeiro. Cada entrada representa uma feature
implementada (mergeada em `main`), com a **data/hora real da execução** (não a data do pedido).

## Convenção

Ao concluir uma feature: adicionar uma entrada nova **no topo** deste arquivo, no formato:

```markdown
## AAAA-MM-DD HH:MM — Título curto da feature

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/NNNN-slug.md` (quando existir um)

Descrição de 1-3 linhas: o que mudou e por quê.
```

Ver `.ai/prompts/features/README.md` pro rastreamento do pedido em si (status, front matter).
Entradas anteriores a 2026-07-25 não têm arquivo de prompt correspondente — a convenção de
`.ai/prompts/features/` só passou a existir a partir daquela data; foram reconstruídas a partir
de `git log --merges` e do histórico narrativo em `.ai/CLAUDE.md`.

---

## 2026-07-31 17:05 — Contexto unico de avaliacao e captura atomica do bundle (Etapa 26b, parcial)

**Status:** PARCIAL · Prompt: `.ai/prompts/features/0028-replay-bundle-captura-operacional.md`

`evaluation-context.ts` lê as seis fontes mutáveis **uma única vez** e congela o contexto; a mesma
instância alimenta motor, snapshot e bundle, com `evaluatedAt` idêntico nos três. Migration
`20260731160000_replay_input_bundle` (aplicada ao Postgres real) cria a relação um-para-um, e
snapshot e bundle passam a ser gravados na mesma transação — falha derruba as duas escritas e a
recomendação ao vivo volta inteira, com `historyPreserved: false` e motivo sanitizado. Nenhum peso,
threshold ou ordenação mudou. 10 testes novos (915 no total). **Faltam** as três rotas de consulta,
os cinco estados no laboratório, a interface, a observabilidade e a validação real.

## 2026-07-31 15:10 — ReplayInputBundle prospectivo: domínio puro (Etapa 26a)

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0027-replay-input-bundle-prospectivo.md`

`replay-input-bundle/1.0.0` em `packages/core/src/calibration/`: contrato versionado,
canonicalização, validação com dez códigos estruturados, manifesto de dependências por métrica,
registro explícito de implementações de replay e verificador offline. A auditoria do grafo real
mudou três coisas do contrato esboçado: o bundle guarda o perfil de **todos** os campeões
consultados (aliados e inimigos inclusos), `evaluatedAt` entra no hash por alimentar a recência do
risco (`capturedAt` não entra), e tags/capacidades são **embutidas** por não terem artefato
imutável. 38 testes novos (905 no total). Sem migration, rota, API ou tela — isso é a 26b.
Ver `docs/replay-input-bundle.md`.

## 2026-07-31 09:55 — Laboratório de calibração: persistência, API e interface (Etapa 25b)

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0026-laboratorio-calibracao-persistencia-api-tela.md`

Migration `20260731100000_calibration_lab` (três tabelas novas e isoladas), repositório com
execução transacional, doze rotas autenticadas e a tela "Laboratório do motor". Configuração
alterada cria revisão nova preservando a anterior; experimento é identificado por `inputHash`
único por conta e, concluído, é imutável; falha não deixa resultado parcial. Aprovação é
documental (`activation: NOT_ACTIVATED`) e não existe endpoint de ativação. 18 testes novos de
rota (867 no total). Ver `docs/engine-calibration-lab.md`.

## 2026-07-31 07:45 — Laboratório de calibração alinhado ao contrato detalhado da Etapa 25a

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0025-laboratorio-offline-calibracao-motor.md`

Domínio puro reescrito para o contrato `CalibrationCandidate` (pesos por
`RecommendationMetricKey`, `disabledMetrics`, `postAggregationThresholds`, `status`) e para os
quatro status de replay (`EXACT_REPLAY`, `REPLAY_INTEGRITY_FAILED`, `REPLAY_UNSUPPORTED_VERSION`,
`REPLAY_MISSING_HISTORICAL_INPUT`). A lista proibida do escopo virou registro verificável: os onze
parâmetros de derivação são rejeitados por teste. Novos: cobertura candidata separada da histórica,
motivos estruturados de diferença por candidato, deslocamento mediano, estabilidade do conjunto
recomendado, transições principal↔alternativa, contagens de revisão humana pré-resultado e dez
dimensões de segmentação. Revalidado contra o Postgres real: 11 de 11 candidatos reconstruídos com
diferença zero, string canônica e relatório idênticos para o mesmo input funcional. 69 testes
(849 no total). Ver `docs/engine-calibration-lab.md`.

## 2026-07-31 00:52 — Laboratório offline de calibração do motor (Etapa 25a: domínio puro)

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0025-laboratorio-offline-calibracao-motor.md`

`packages/core/src/calibration/` (`calibration-lab/1.0.0`) compara configurações candidatas contra
a linha de base histórica usando somente o que o snapshot da Etapa 16 congela. Cada parâmetro
declara sua capacidade de replay (`EXACT_REWEIGHT`, `EXACT_POST_AGGREGATION`,
`REQUIRES_HISTORICAL_DERIVATION_INPUT`, `UNSUPPORTED`) e os não reproduzíveis são rejeitados na
validação da configuração, com a dependência histórica nomeada. O baseline é reconstruído antes de
qualquer comparação, com a penalização de risco recalculada de forma independente a partir da
métrica congelada — medido contra o Postgres real: 11 de 11 candidatos de 2 snapshots
reconstruídos com diferença zero. Nada do motor operacional mudou; promoção máxima expressável é
`APPROVED_FOR_FUTURE_RELEASE`. 51 testes novos (831 no total). Ver `docs/engine-calibration-lab.md`.

## 2026-07-30 16:40 — Revisão humana auditável do motor
**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0024-revisao-humana-auditavel-do-motor.md`

Fluxo de revisão manual em duas fases para drafts já registrados. A fase cega avalia seis
dimensões qualitativas sem receber **nenhum** dado da partida — garantido pelo backend, não por
CSS: o contexto devolvido não tem campo de resultado, e revelar é ação explícita e única. A
avaliação prévia fica imutável depois da revelação; corrigir cria revisão nova preservando a
anterior. Escala qualitativa com definição por nível, 13 tags de problema como itens de
investigação, e agregado descritivo sempre com denominador — sem nota geral, percentual de acerto
ou versão vencedora. Vitória e derrota não rotulam nada. Nenhum peso, fórmula, threshold ou
ranking foi alterado, e nenhum snapshot foi recalculado. 47 testes novos (780 no total).
Ver `docs/draft-review.md`.


## 2026-07-28 18:39 — Avaliação longitudinal e observabilidade do motor

**Status:** IMPLEMENTADA · Prompt:
`.ai/prompts/features/0023-avaliacao-longitudinal-observabilidade-motor.md`

O Sparta agora agrega sob demanda uma observação por draft vinculado usando
somente o snapshot vigente no lock-in, a escolha, a partida e a revisão
pós-game persistidos. Principais, alternativas e escolhas fora do snapshot
permanecem separadas; numeradores, denominadores, faixas versionadas,
indisponibilidades e versões dos motores são explícitos. Contextos sem
amostra ou sobreposição suficiente não são comparados, e vitória/derrota
continua sendo fato observado, sem taxa de acerto, causalidade, contrafactual
ou ajuste. Três rotas autenticadas e a tela “Histórico do motor” foram
adicionadas sem nova tabela. Foram validados 731 testes dos quatro projetos,
mais 2 testes do script raiz, typecheck, lint, formatação, build e navegação
local sem erros de console. Implementação funcional: `6ef8f9e`.

## 2026-07-28 18:01 — Pós-game comparativo entre draft e partida

**Status:** IMPLEMENTADA · Prompt:
`.ai/prompts/features/0022-pos-game-comparativo-draft-partida.md`

O pós-game agora preserva o snapshot original e separa rigorosamente o que
era conhecido no draft dos fatos observados na partida. Ranking, grupo,
score, cobertura, riscos, posição, matchup, loadout e patch são comparados
somente quando há evidência compatível, sempre com limitações de não
causalidade; escolha fora do snapshot não recebe score retroativo e
vitória/derrota não julga o motor. Relatórios são revisionados de forma
imutável e idempotente por hash/versão, consultáveis por sessão ou partida e
protegidos por conta. A interface ganhou “Draft versus partida” sem
redesenho. Foram validados 718 testes, typecheck, lint, builds, schema Prisma
e navegação local sem erros de console. Implementação funcional: `2f60736`.

## 2026-07-28 17:39 — Vínculo auditável entre drafts e Match-V5

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0021-vinculo-draft-match-v5.md`

Sessões reais de draft agora são reconciliadas deterministicamente com
partidas Match-V5. O `gameId` observado pelo LCU tem precedência permanente;
sem ele, somente o conjunto completo de evidências fortes e um candidato
único pode vincular. Pendência, ambiguidade, insuficiência e dodge permanecem
estados explícitos. O vínculo é transacional, idempotente, versionado e
auditável por revisões; o backfill protegido não cria sessões e falhas não
invalidam o sync. O desktop não envia `matchId` para concluir uma sessão, e o
histórico abre o pós-game vinculado sem avaliar acerto ou causalidade da
recomendação. Foram validados 700 testes, typecheck dos quatro projetos,
lint e geração Prisma. Implementação funcional: `4851c09`.

## 2026-07-28 17:02 — Impacto teórico rastreável das mudanças do patch

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0020-impacto-teorico-patch.md`

Mudanças oficiais agora geram interpretações teóricas determinísticas por
dimensão, com direção, magnitude somente para escalares comparáveis,
evidências, capacidades relacionadas, cobertura e indisponibilidades
explícitas. Compensações permanecem mistas, bugfix não ganha direção
automática e ausência de capacidade não cria inferência. API, resumo do
patch, pool pessoal e Champion Select apresentam o contexto fora do motor de
recomendação. Na revisão real 26.14, 3 de 10 campeões alterados tiveram sinais
seguros e 18 unidades permaneceram indisponíveis. Foram validados 690 testes
TypeScript, 1 Python, typecheck, lint, builds, determinismo e a API Docker.
Score, ranking, pesos, risco, matchup, snapshots e `META_STRENGTH` continuam
inalterados. Implementação funcional: `9cb0d3c`.

## 2026-07-28 16:35 — Patch Intelligence oficial e auditável

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0019-patch-intelligence-riot.md`

Notas oficiais da Riot agora podem ser validadas e importadas por comandos
controlados, com allowlist, parser conservador versionado, hash canônico,
cache explícito, associação segura ao catálogo e histórico imutável de
revisões. API e Champion Select apresentam somente a evidência oficial,
separada do motor de recomendação. O patch 26.14 foi importado com 21
mudanças, 10 campeões resolvidos e três itens preservados sem catálogo; a
segunda execução foi `UNCHANGED`. Foram validados 675 testes TypeScript e 1
Python, typecheck, lint, builds e a API real em Docker. `META_STRENGTH`,
ranking, score, pesos, pool, risco, matchup e elegibilidade global continuam
inalterados. Implementação funcional: `013878a`.

## 2026-07-28 15:45 — Contrato e decisão da fonte global de meta

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0018-fonte-global-meta.md`

Riot, GRID, PandaScore, Abios e scraping foram comparados em fontes oficiais.
A decisão ficou `SELF_AGGREGATION_CANDIDATE`: agregação própria pela Riot é a
única candidata adequada à população ranqueada, mas depende de Production
Key e aprovações jurídica, estatística, financeira e operacional. O core
agora possui contratos neutros e um provider padrão sem I/O que mantém meta,
matchup, loadouts e elegibilidade globais `UNAVAILABLE`, sem alterar nenhum
motor. Foram validados 652 testes TypeScript e 1 Python, além de typecheck,
lint e build. Implementação funcional: `ba042c9`.

## 2026-07-28 15:04 — Inteligência pessoal de builds, runas e feitiços

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0017-inteligencia-pessoal-loadouts.md`

Os dados normalizados de partidas agora geram evidência pessoal, factual e
versionada por jogador, campeão e posição observada para inventários finais,
runas e feitiços. A API autenticada restringe a consulta à própria conta e a
interface apresenta o histórico apenas no detalhe da recomendação e no
pré-game, sem alterar score, ranking, cobertura, risco, estratégia ou
snapshots. Foram validados 645 testes TypeScript e 1 Python, além de typecheck,
lint, build e uma consulta real com amostra 8 e bloqueio `403` para outro
jogador. Implementação funcional: `d8758b8`.

## 2026-07-28 13:10 — Persistência de drafts e recomendações

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0016-persistencia-drafts-recomendacoes.md`

Sessões reais de champion select e snapshots imutáveis das recomendações passam a ser
persistidos, preparando a comparação futura com a partida. `DraftSession`/`PickRecommendation`
(código morto desde o início, 0 linhas no banco) foram substituídos por `DraftSession` com ciclo
de vida + `RecommendationSnapshot` + `PersistedRecommendation`. Snapshot novo só nasce quando o
hash do input canônico muda — o hash ignora ordem de arrays, instante da análise e campos de
interface, o que impede duplicata por tick do LCU. O anterior é marcado como substituído e nunca
reescrito. Falha de persistência devolve `FAILED` sanitizado sem derrubar o Champion Select.
Vínculo com Match-V5 só com identificador confiável; sem ele a sessão permanece honestamente sem
vínculo. Escolha fora do ranking é registrada como fato, sem julgamento. Ranking, pesos e fórmulas
inalterados. 62 testes novos (626 no total). Ver `docs/draft-persistence.md`.

## 2026-07-28 01:37 — Análise estratégica do draft 5×5

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0015-analise-estrategica-draft-5x5.md`

Um motor puro e versionado agora analisa candidato, aliados e inimigos
conhecidos, lacunas da composição, ameaças e respostas por capacidade, com
evidência, proveniência, disponibilidade e cobertura. Ranking, detalhes e
pré-game reutilizam exatamente os mesmos sinais para `TEAM_COMPOSITION` e
`ENEMY_COMPOSITION_ANSWER`, sem alterar pesos ou os demais conceitos. Draft
incompleto permanece parcial e nunca recebe neutro artificial. A interface
expõe resumo e auditoria estratégica mantendo experiência e risco separados.
565 testes TypeScript, 1 Python, typecheck, lint, builds e validação real em
Docker aprovados. Ver `docs/draft-strategic-analysis.md`.

## 2026-07-28 01:10 — Capacidades rastreáveis dos campeões

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0014-modelo-rastreavel-capacidades-campeoes.md`

O Sparta ganhou um catálogo técnico separado de `ChampionTag`, extraído
deterministicamente dos recursos completos oficiais da Data Dragon 16.14.1.
Os 173 perfis preservam passiva/habilidade, trecho original, regra, versão,
locale, disponibilidade e cobertura para 23 capacidades; ausência textual
permanece indisponível. O catálogo deliberadamente cobre em média 19,15%:
hard CC não cria confiabilidade, dash não cria engage e escudo/cura não cria
peel. Gerador e modo check são reprocessáveis, e uma nova consulta técnica
expõe evidências sem tocar em ranking ou pré-game. 16 testes novos; 555 testes
TypeScript, 1 Python, typecheck, lint, build, check do catálogo e validação na
imagem real da API aprovados. Ver `docs/champion-capabilities.md`.

## 2026-07-28 00:42 — Dificuldade do campeão e risco pessoal de execução

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0013-dificuldade-risco-pessoal-execucao.md`

O ranking agora preserva a dificuldade oficial 0-10 da Data Dragon, sua
normalização versionada e a proveniência, separadas da dificuldade estratégica
curável. Familiaridade usa apenas amostra e recência na posição; risco de
execução combina essas evidências sem win rate ou desempenho e aplica
penalização explicável de no máximo oito pontos. Candidato manual sem histórico
continua elegível, e respostas antigas ou catálogos sem dificuldade permanecem
`UNAVAILABLE`, sem neutro artificial. Migration aplicada; 173/173 campeões
confirmados no Postgres e no manifesto. 539 testes TypeScript, 1 teste Python,
typecheck, lint, build e validação do catálogo aprovados. Detalhes em
`docs/champion-execution-risk.md`.

## 2026-07-27 23:38 — Pool pessoal por posição e recomendações 5+3

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0012-pool-pessoal-cinco-recomendacoes.md`

O Champion Select agora consolida somente experiência Match-V5 normalizada e
inclusões explícitas do usuário em um pool auditável por posição. O motor
retorna até cinco principais e três alternativas reais, com origem, amostra,
cobertura e indisponibilidades independentes; pool curto não é completado e
candidato sem histórico não recebe zero ou 50 artificial. API e desktop
gerenciam entradas manuais sem apagar observações e mantêm compatibilidade com
o contrato anterior. 22 testes novos (527 no total), typecheck, lint e build
aprovados. No Postgres real, 11 entradas observadas foram materializadas de
forma idempotente; Jungle produziu 5 principais + 1 alternativa única.
Detalhes em `docs/player-champion-pool.md`.

## 2026-07-27 21:47 — Evidência pessoal separada de elegibilidade global

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0011-evidencia-pessoal-elegibilidade-global-posicao.md`

Experiência do jogador por campeão/posição agora agrega exclusivamente as observações Match-V5
normalizadas, com amostra, V/D, última partida, patches, filas, filtros e proveniência.
Elegibilidade global permanece explicitamente indisponível (`eligible: null`), sem inferência
por Smite, classes, frequência ou curadoria. `ChampionTag.roles` ficou vazio nos 173 campeões,
com pool e scores invariantes; API, pós-jogo e compatibilidade legada usam conceitos distintos.
12 testes novos; validação real encontrou 8 partidas Vel'Koz/SUPPORT em duas filas e zero
Vel'Koz/MID, sem fallback. Ver `docs/champion-role-evidence.md`.

## 2026-07-27 21:15 — Observações reais de build, runas, feitiços e posição

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0010-observacoes-build-runas-feiticos-posicoes.md`

Itens finais, runas, fragmentos, feitiços, posição e contexto Match-V5 passaram a ter contrato
e persistência relacional versionada, preservando ordem, IDs, ausência e divergências. A API
autenticada e o pós-game consomem os fatos sem transformá-los em recomendação ou elegibilidade
global. Backfill local: 22 partidas/220 participantes na primeira execução e zero atualizações
na segunda, sem chamadas externas nem duplicatas. 16 testes novos; ver
`docs/match-observations.md`.

## 2026-07-27 20:04 — Resiliência HTTP, erros externos e estados de cache

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0009-resiliencia-http-cache.md`

Todas as integrações ativas passaram a ter timeout e cancelamento explícitos, taxonomia central
de erros sanitizados e retry limitado a operações idempotentes temporárias. Riot distingue
credencial, rate limit, not found e payload inválido; Data Dragon não devolve mais versão fixa
ou lista vazia em falha e ganhou cache `MISS/FRESH/STALE/EXPIRED` por recurso, preservando a
origem oficial na proveniência. O renderer sinaliza catálogo stale, assets mantêm fallback
isolado e o LCU distingue seus estados locais e limpa o draft quando perde a observação.
27 testes novos (472 no total). Ver `docs/http-resilience.md`.

## 2026-07-27 18:40 — Proveniência das ChampionTag

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0008-proveniencia-champion-tags.md`

As 9 dimensões de gameplay usadas pelo motor de draft e pelo pré-game são derivadas das classes
da Data Dragon, mas não havia como saber de que versão da fonte, de que versão do algoritmo, nem
o que era leitura de classe e o que era curadoria. O arquivo versionado virou um manifesto
`{ metadata, champions }` com versão real da fonte, locale, recurso, versão do algoritmo e data
de geração; a curadoria passou a ser registrada **por dimensão** (`review.overrides`, com motivo
e data quando conhecidos), e o estado de revisão (`UNREVIEWED`/`PARTIALLY_REVIEWED`/`REVIEWED`) é
derivado dessas chaves, nunca declarado à parte. Novo contrato `ChampionTagProvenance` reusa
`DataProvenance` e **não tem campo numérico de confiança** — revisão não é calibração. O gerador
grava a versão real, valida dimensões, detecta campeão novo/sumido e ganhou `champion-tags:check`
(verifica sem reescrever); rodar duas vezes produz o arquivo byte a byte idêntico. Migration com
7 colunas nullable: registro anterior fica sem proveniência (origem não informada), nunca
classificado como derivado ou revisado. O fallback fixo `version: "seed"` foi removido, e o seed
virou idempotente de verdade. **Nenhum valor de dimensão mudou** (medido: 0 alterações em 173
campeões, 0 divergências entre arquivo e banco); scores do motor idênticos.
54 testes novos (450 no total). Ver `docs/champion-tags.md`.

## 2026-07-27 14:20 — Pré-game real e derivado do draft atual

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0007-pregame-real-baseado-no-draft.md`

`POST /drafts/pre-game-analysis` era a última rota estática do produto: devolvia quatro listas de
frases fixas e nem lia o body; o desktop mostrava um card "Orientação geral" com três dicas fixas.
Novo motor puro `generatePreGameAnalysis` (`packages/core/src/draft/pre-game-analysis.ts`) devolve
um contrato estruturado (seções, sinais com origem/disponibilidade/confiança/evidência, cobertura
com pesos documentados), derivado só do draft real, das `ChampionTag` derivadas e do matchup
pessoal do jogador. `422` estruturado sem posição ou sem campeão confirmado; draft incompleto gera
análise parcial com linguagem de parcialidade, nunca "o time não tem". `GLOBAL_MATCHUP`,
`META_STRENGTH` e interações entre campeões continuam explicitamente indisponíveis. O card estático
do desktop foi removido, e uma resposta de API anterior é recusada em vez de exibida como análise.
Deliberadamente **não** reusa `analyzeTeamComposition`, que devolve `0` em toda dimensão sem tags.
70 testes novos (396 no total). Sem migração, sem persistência, sem fonte externa nova.
Ver `docs/pre-game-analysis.md`.

## 2026-07-26 17:30 — Posição desconhecida não vira mais MID

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0006-posicao-desconhecida-sem-fallback-mid.md`

`DraftState.playerRole` virou opcional e ausência deixou de ser convertida em `MID` em nove
pontos do fluxo (estado inicial do desktop, aliados/inimigos do LCU, inimigo manual, mapper do
Match-V5, seletor da interface, schema da API). O motor devolve vazio sem posição, a rota
responde `422 PLAYER_ROLE_UNAVAILABLE` sem consultar estatísticas, e o cliente barra antes de
enviar. Nova `playerRoleSource` (`LCU`/`USER`) e `USER_PROVIDED` na proveniência distinguem
detecção de escolha manual. Trocar de posição descarta os cards anteriores antes de mostrar os
novos. 29 testes novos (326 no total).

## 2026-07-26 14:40 — Participação em objetivos a partir de dados reais

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0005-participacao-objetivos-real.md`

`objectiveParticipation` passa a ser calculado do Match-V5 já persistido: dragões e barões que
o jogador acompanhou sobre os que o próprio time conquistou. O Arauto ficou **de fora** por
evidência — `riftHeraldTakedowns` e `objectives.riftHerald.kills` não usam a mesma
contabilidade (existe partida em que ninguém matou Arauto e um jogador tem takedown). Time sem
objetivo neutro fica indisponível, não `0%`. Novo backfill local idempotente que reprocessa o
`rawJson` sem nenhuma chamada à Riot. Efeito real: Viego JUNGLE 61,4 → 67,2 com cobertura
0,85 → 1,0. 37 testes novos (301 no total).

## 2026-07-26 11:55 — Ausência versus zero nas estatísticas

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0004-ausencia-versus-zero-estatisticas.md`

Auditoria e correção do fluxo de estatísticas pra que `0` signifique zero medido e ausência
permaneça ausente. O maior falso zero era `objectiveParticipation`, nunca extraído de fonte
nenhuma (0 de 220 participantes no banco real) mas gravado como `0` e valendo 15% do peso do
score em JUNGLE/SUPPORT: Viego 52 → 61,4 e Vel'Koz 46 → 53,7 na conta real. Também corrigidos
`csAt10/15` de partida curta, `teamId` fantasma, filtro `> 0` que descartava participação zero
legítima, e agregação de coleção vazia. Nova `StatCoverage` com amostra total e disponível.
35 testes novos (264 no total); migration sem alterar dado existente.

## 2026-07-25 14:15 — Meta e matchup indisponíveis sem dados reais

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0003-meta-matchup-indisponiveis.md`

Separa matchup pessoal de global, elimina os fallbacks falsos de `50` para matchup/meta e
normaliza o score somente com sinais disponíveis. A Champion Select mostra a cobertura de dados
por candidato; compatibilidade com respostas antigas continua sem inventar evidência.

## 2026-07-25 15:52 — Contrato de origem, disponibilidade e confiança dos dados

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0002-contrato-origem-disponibilidade.md`

Cria o contrato central (`DataProvenance`, `AvailabilityStatus`, `RecommendationMetric` com
`value: number | null`) que permite distinguir um 50 calculado de verdade de um 50 que na
verdade é ausência de dado. `PickRecommendation` ganha `metricDetails`, e a interface passa a
exibir métrica indisponível **sem barra**. Nenhum cálculo mudou nesta etapa. Corrige de quebra
um defeito achado na validação real: o desktop quebrava contra uma API anterior ao contrato.
24 testes novos, incluindo a primeira suíte de componente do renderer (jsdom).

## 2026-07-25 12:05 — Estrutura de prompts/features, changelog e specs em `.ai/`

**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0001-estrutura-prompts-changelog-specs.md`

Cria `.ai/prompts/features/` (rastreamento de pedidos de feature com cabeçalho de status),
este `CHANGELOG.md` (histórico com data/hora real de execução) e `.ai/specs/` (espelho de
`docs/*.md` pra consulta rápida por agentes de IA). Adiciona também a regra 11 em "Regras de
implementação" do `.ai/CLAUDE.md`: testes automatizados por feature/bug-fix sempre que
necessário/possível. Sem teste automatizado próprio — é convenção de processo, sem código
executável.

## 2026-07-25 11:44 — Unificação de `.ai` via links simbólicos

**Status:** IMPLEMENTADA

`.claude`, `.codex` e `.agents` viram links simbólicos apontando pra `.ai`, que passa a ser a
única pasta versionada com config compartilhada entre os agentes de IA (Claude/Codex/Agents).
`CLAUDE.md`, `README.md`, `SPARTA_CODEX_INSTRUCTIONS.md` e `launch.json` movidos pra dentro.

## 2026-07-25 03:36 — Fase 16: draft real via League Client

**Status:** IMPLEMENTADA · PR #31 (`feat/lcu-draft-import-16`)

`deriveDraftSnapshot` deriva aliados, inimigos, banimentos e o campeão do jogador a partir da
sessão real de champion select do LCU, substituindo a marcação manual do time inimigo. Corrige
limitação real: o watcher só transmitia eventos quando o valor mudava, deixando a tela vazia ao
abrir o app já em champion select.

## 2026-07-25 00:58 — Fase 15: `ChampionTag` derivado pra todo o roster

**Status:** IMPLEMENTADA · PR #30 (`feat/champion-tags-derived-15`)

`deriveChampionTag` deriva as 9 dimensões do `ChampionTag` a partir de `tags`/`info` da Data
Dragon, cobrindo 173 campeões (antes só 2 curados manualmente). Corrige bug real no upsert do
seed (nunca atualizava um campeão já gravado) e um bug de sinergia de aliados exposto pela
expansão do roster.

## 2026-07-24 23:07 — Subfase 14F: polimento, acessibilidade e validação final (encerra a Fase 14)

**Status:** IMPLEMENTADA · PR #29 (`feat/ui-polish-a11y-14f`)

Migra as telas de autenticação pro design system novo, remove `styles/global.css` e os aliases
legados de token. Validação final medida no Electron real em 4 resoluções, foco por teclado,
`prefers-reduced-motion` e offline com tema baixado.

## 2026-07-24 22:54 — Subfase 14E: Configurações e galeria de temas

**Status:** IMPLEMENTADA · PR #28 (`feat/ui-settings-theme-14e`)

Novo `ThemeGallery` com prévia grande da splash art e amostras da cor extraída, substituindo o
grid técnico anterior. Configurações ganha abas (`Tabs`) pras duas seções.

## 2026-07-24 22:45 — Subfase 14D: Pós-game e Evolução

**Status:** IMPLEMENTADA · PR #27 (`feat/ui-postgame-growth-14d`)

Pós-game ganha rail de cards selecionáveis e hierarquia real de relatório (veredito, prioridade
de melhoria, razão + valor absoluto). Evolução agrupa por direção (piorando/melhorando/sem
comparação) em vez de repetir "Estável".

## 2026-07-24 22:38 — Subfase 14C: Champion Select e Pré-game

**Status:** IMPLEMENTADA · PR #26 (`feat/ui-draft-workspace-14c`)

Champion Select vira workspace de decisão (barra de sessão, rail de recomendações compactas,
painel de detalhe com as 8 métricas). Corrige bug real de estado obsoleto em cliques rápidos no
grid de inimigos (closure antigo sobrescrevendo seleções).

## 2026-07-24 22:29 — Subfase 14B: Dashboard e Perfil

**Status:** IMPLEMENTADA · PR #25 (`feat/ui-dashboard-profile-14b`)

Dashboard ganha herói com números agregados reais e faixa das últimas 10 partidas. Perfil ganha
filtro por posição, busca, ordenação e painel de detalhe fixo com as 8 médias + 10 componentes
de score. Corrige breakpoint de 2 colunas que nunca disparava no viewport padrão do Electron.

## 2026-07-24 22:20 — Subfase 14A: fundação do design system

**Status:** IMPLEMENTADA · PR #24 (`feat/ui-foundation-14a`)

Novo design system em `apps/desktop/src/renderer/src/ui/` (tokens, base, 16 componentes),
`packages/ui` removido (código morto). Reorganização de pastas do renderer (`services/`,
`hooks/`, `theme/`, `app/`, `features/`). Remove as regras de CSS descendente genéricas que
causavam bugs de cor em cascata.

## 2026-07-24 17:40 — Fase 13: o tema veste o app

**Status:** IMPLEMENTADA · PR #23 (`feat/theme-identity-13`)

Filtra chromas do seletor de skins usando a Community Dragon (o campo `chromas` da Data Dragon
não serve pra isso). Extrai a cor de destaque da splash art (`extractAccentPalette`) e aplica
em runtime nos tokens `--color-accent*`, com splash de fundo nas 5 telas principais. Corrige CSP
que bloqueava silenciosamente todo fallback de Community Dragon desde a Fase 10.

## 2026-07-24 16:07 — Fix: módulo de temas (splash nunca carregava nem aplicava)

**Status:** IMPLEMENTADA · PR #22 (`fix/theme-module-12`)

Dois bugs reais independentes desde a Sub-fase 6a: `championSplashUrl` montava `.png` (a CDN só
serve `.jpg`, 403 em tudo) e `file://` era bloqueado pelo Chromium a partir da origem `http://`
do renderer. Handler IPC passa a devolver data URL; novo fallback via Community Dragon.

## 2026-07-23 19:04 — Fase 11: detecção de posição/lane + gating do Champion Select

**Status:** IMPLEMENTADA · PR #21 (`feat/lane-detection-11`)

`derivePlayerRole` lê `assignedPosition` do LCU (já tipado desde a Fase 6c, nunca consumido).
Corrige bug real: `draft.playerRole` estava hardcoded em `"MID"` pra todo mundo. Champion Select
ganha gating por sessão real (com opção de simular manualmente) e seletor manual de posição.

## 2026-07-23 18:16 — Fase 10: polimento de UX a partir do feedback ao vivo do usuário

**Status:** IMPLEMENTADA · PR #20 (`feat/ux-polish-10`)

Novo `WeaknessTrend.hasComparison` distingue "estável de verdade" de "ainda sem 2º bloco pra
comparar". Novo `ChampionIcon.tsx` com 3 estágios de fallback (Data Dragon → Community Dragon →
placeholder), corrigindo ícones quebrados que dependiam do `championName` cru da Riot.

## 2026-07-23 14:44 — Fix: preload nunca carregava de verdade (`window.sparta` sempre indefinido)

**Status:** IMPLEMENTADA · PR #19 (`fix/preload-cjs-loading`)

Bug real presente desde o início do projeto, achado validando contra o Electron real via CDP: o
preload buildava como `.mjs` (ESM) mas o loader sandboxed não entende `import`. Corrigido
forçando build do preload pra CommonJS real (`.cjs`). Todo recurso dependente de `window.sparta`
nunca tinha funcionado em nenhuma sessão anterior.

## 2026-07-23 13:54 — Subfase 9b: Perfil, Pós-game e Evolução (encerra a Fase 9)

**Status:** IMPLEMENTADA · PR #18 (`feat/visual-scoring-9b`)

`ScoreBadge`/`StatBar`/`SignalChip` aplicados às 3 telas restantes. Novo prop `invert` em
`StatBar` pra métricas onde valor alto é ruim (Evolução). Corrige cor errada do número dentro do
`ScoreBadge` (regra CSS genérica de `span` vencendo por ordem de arquivo).

## 2026-07-23 13:37 — Subfase 9a: `ScoreBadge`/`StatBar`/`SignalChip` + Dashboard + Champion Select

**Status:** IMPLEMENTADA · PR #17 (`feat/visual-scoring-9a`)

Primeira linguagem visual real de score (anel `conic-gradient`, barra horizontal, chips de
sinal), sem lib de gráfico. Remove o card "Princípio do produto" do Dashboard.

## 2026-07-23 09:39 — Fix: card de skin com nome/botão sobrepostos

**Status:** IMPLEMENTADA · PR #16 (`fix/skin-picker-overlap`)

Card do passo 2 do seletor de skin reusava uma classe com `line-height: 0` feita pra outro grid,
colapsando o texto. Nova classe própria `.skin-picker-card`.

## 2026-07-23 08:59 — Subfase 8b: polimento visual do desktop

**Status:** IMPLEMENTADA · PR #15 (`feat/visual-polish-8b`)

Componentes `Loading`/`GridSkeleton` substituem texto solto de carregamento. Pré-game ganha
ícone/splash do campeão confirmado + inimigos conhecidos + resumo de inclinação de dano.

## 2026-07-23 08:43 — Subfase 8a: motor de build de campeão + seletor de time inimigo

**Status:** IMPLEMENTADA · PR #14 (`feat/build-recommendation-8a`)

Novo motor puro `recommendBuild` usa `tags`/`info` da Data Dragon (cobre ~170 campeões) em vez
da tabela curada `ChampionTag` (só 2 na época). Seletor real de até 5 inimigos e painel de build
inline no Champion Select.

## 2026-07-22 21:25 — Fase 7: auditoria e documentação dos algoritmos de scoring

**Status:** IMPLEMENTADA · PR #13 (`feat/scoring-audit-phase7`)

Corrige duas inconsistências reais (`DEATHS_BAD_VALUE` divergente entre 4 call sites, literal
`8` duplicado independente de `MEDIUM_CONFIDENCE_GAMES`). Resto da fase é documentação do
raciocínio de design em `docs/scoring-model.md`/`docs/draft-recommendation.md`.

## 2026-07-22 20:39 — Sub-fase 6c: ordem de pick automática via LCU

**Status:** IMPLEMENTADA · PR #12 (`feat/lcu-pick-order-6c`)

`derivePickOrder` conta picks completos de aliados antes da própria ação, substituindo o input
manual 1-5 quando o League Client está aberto em champion select real.

## 2026-07-22 20:27 — Sub-fase 6b: "quantas partidas analisar" + fix de CORS

**Status:** IMPLEMENTADA · PR #11 (`feat/match-analysis-limit-6b`)

Nova config pessoal `matchAnalysisLimit` (20/50/100/personalizado). Corrige bug real de CORS:
`@fastify/cors` sem `methods` explícito bloqueava todo `PUT` no preflight silenciosamente.

## 2026-07-22 15:51 — Sub-fase 6a: tela de Configurações + tema com campeão/skin real

**Status:** IMPLEMENTADA · PR #10 (`feat/settings-theme-skins-6a`)

Substitui a lista fixa de 12 campeões curados por escolha livre de qualquer campeão/skin via
Data Dragon, com download real pro disco (primeiro uso de IPC request/response do app). Corrige
bug real de campos `id`/`key` invertidos no `champion.json`.

## 2026-07-22 15:06 — Desktop conectado às rotas reais da API

**Status:** IMPLEMENTADA · PR #9 (`feat/desktop-real-data-wiring`)

Dashboard/Perfil/Champion Select trocam `mock-data.ts` (2 campeões hardcoded) por dado real via
novo `api-client.ts` + `use-async-data.ts`. Novas telas Pós-game e Evolução. `mock-data.ts`
removido.

## 2026-07-22 14:29 — Fase 5: Growth Journey

**Status:** IMPLEMENTADA · PR #8 (`feat/growth-journey-phase5`)

`computeWeaknessTrends` compara blocos de `PostgameReport` já persistidos pra detectar tendência
de melhora/piora por ponto fraco — primeira fase do projeto sem nenhuma migração nova, 100%
derivada de dado já salvo pela Fase 4.

## 2026-07-22 01:58 — Fase 4: Post-Game Coach

**Status:** IMPLEMENTADA · PR #7 (`feat/postgame-coach-phase4`)

`generatePostGameAnalysis` religa `POST /postgame/analyze`/`GET /postgame/:matchId` com dado
real (antes 100% mock, aceitava performance inventada pelo próprio cliente). Persiste em
`PostgameReport` via upsert.

## 2026-07-21 23:16 — Fase 3: Draft Intelligence

**Status:** IMPLEMENTADA · PR #6 (`feat/draft-intelligence-phase3`)

Corrige bloqueio real: `persistMatch` só gravava o participante rastreado, descartando os outros
9 — sem isso não dava pra saber o adversário de rota. `POST /drafts/recommendations` religada
com matchups/tags reais. Backfill retroativo dos participantes faltantes.

## 2026-07-21 21:20 — Fase 2: Player Intelligence

**Status:** IMPLEMENTADA · PR #5 (`feat/player-intelligence-phase2`)

`computeRecentForm`/`derivePlayerStrengthsWeaknesses` calculam forma recente e pontos
fortes/fracos reais a partir do histórico agregado, persistidos a cada sync.

## 2026-07-21 18:46 — Refinamento visual do desktop

**Status:** IMPLEMENTADA · PR #4 (`feat/desktop-visual-refresh`)

Fonte unificada (Manrope), paleta migrada pra CSS custom properties, transições e animações de
entrada — antes o app não tinha nenhuma transição.

## 2026-07-21 17:54 — Fase 1: Riot Sync

**Status:** IMPLEMENTADA · PR #3 (`feat/riot-sync-phase1`)

Catálogo real de campeões via Data Dragon, `RiotApiClient` conectado de verdade (antes existia
mas nunca era chamado), mapeadores puros Match-V5, sync incremental real, agregação de
`PlayerChampionStats`. Primeira fase que tira o produto do mock em todo o backend.

## 2026-07-21 17:38 — Fix: imports ESM/NodeNext da API

**Status:** IMPLEMENTADA · PR #1 (`fix/api-esm-nodenext-imports`)

Correção de infraestrutura anterior à Fase 1.

## 2026-07-21 17:37 — Fix: hardening de segurança

**Status:** IMPLEMENTADA · PR #2 (`fix/security-hardening`)

Correção de infraestrutura anterior à Fase 1.
