# Etapa 31I — redesign do Histórico do Motor e Laboratório de Calibração

Etapa exclusivamente de experiência e visualização. Nenhuma fórmula, peso, threshold, experimento
existente, lógica de calibração, release ativa, critério de ativação, replay, hash ou persistência
científica foi alterada. Tudo aqui é apresentação de dado que já existia, ou leitura aditiva de
colunas já persistidas e nunca serializadas.

## Auditoria inicial (§1)

Mapeamento do estado real antes de tocar em qualquer arquivo:

| Tela / componente                                  | Contrato consumido                                                                 | Classificação                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------- |
| `DraftHistoryScreen.tsx` ("Histórico de drafts")     | `GET /drafts/sessions`, `GET /drafts/sessions/:id`, `GET /drafts/sessions/active`     | **Redesenhar** — alvo real do §3-§7    |
| `CalibrationLabScreen.tsx` ("Laboratório do motor") | 12 rotas `/calibration/*` + `/recommendation-engine/active-release`                  | **Redesenhar** — alvo real do §8-§18   |
| `MotorHistoryScreen.tsx` ("Histórico do motor")      | `GET /players/:puuid/recommendation-observability` (+ `/versions`, `/roles/:role`) | **Manter** — já usa o design system atual |
| `ReplayCapabilitySummary.tsx`                        | `GET .../replay-capability`, `.../replay-bundle-summary`, `POST .../verify-replay` | **Refatorar** — ganhou a tabela de divergência |

O nome de menu "Histórico do motor" é ambíguo: existem duas telas com nomes parecidos.
`MotorHistoryScreen.tsx` é a observabilidade agregada da Etapa 23 (uma linha por dimensão,
segmentada, sem hash nem snapshot individual). `DraftHistoryScreen.tsx` é quem de fato lista
snapshots individuais com hash/config/release/replay — o alvo real dos §3-§7 da especificação,
apesar do rótulo de navegação mais próximo ser "Histórico de drafts". Nenhum dos dois nomes de
tela foi alterado nesta etapa (redesenhar visualmente não é reorganizar navegação).

`MotorHistoryScreen.tsx` já usa integralmente `ui/` (Card/PageHero/SegmentedControl/SignalChip/
InlineStats/EmptyState/ErrorState/Loading), CSS com os tokens atuais (`--space-*`/`--text-*`/
`--border-subtle`/`--bg-sunken`), zero barra de progresso repetitiva (as "faixas" já são
cards de texto/número, não `<progress>`) e um breakpoint responsivo em 980px. Não precisou de
nenhuma mudança de código nesta etapa — a auditoria confirmou que já atende ao padrão visual
pedido, sem reorganizar o domínio só para justificar uma mudança cosmética.

## Separação conceitual (§2)

- **Histórico do Motor** (`DraftHistoryScreen.tsx`): "o que o motor usou e produziu" — um
  snapshot histórico por vez, com contexto congelado, resultado produzido e configuração/hashes.
- **Laboratório** (`CalibrationLabScreen.tsx`, bloco "Laboratório do motor"): "o que aconteceria
  reavaliando historicamente uma configuração congelada" — nunca a operação real.
- **Release** (`CalibrationLabScreen.tsx`, bloco "Releases"): "qual configuração está
  operacionalmente ativa agora" — nunca confundido com um resultado de experimento.

## Histórico do Motor (`DraftHistoryScreen.tsx`, §3-§7)

Filtros por posição (`SegmentedControl`, client-side sobre a lista já carregada) e período
(hoje/7 dias/30 dias/tudo). Filtro é 100% no cliente — `GET /drafts/sessions` só suporta `limit`
no servidor, e adicionar parâmetros novos de filtro seria desproporcional para uma etapa
declaradamente visual. Documentado no próprio código.

Detalhe da sessão dividido em três blocos rotulados, sem misturar os conceitos:

1. **Contexto congelado** — posição, aliados, inimigos, bans, pool/evidência pessoal como
   estavam no instante do draft. `ChampionChip` resolve nome/ícone por `championId` via o
   catálogo já carregado (`ChampionAvatar`).
2. **Resultado produzido** — ranking numerado com `ScoreBadge` por candidato, grupo
   (PRIMARY/ALTERNATIVE/NOT_IN_SNAPSHOT), cobertura, razões, riscos — todos do snapshot
   persistido. **Nunca** comparado com o score atual (recalcular contra dado de hoje
   compararia dois momentos diferentes como se fossem o mesmo).
3. **Configuração** — versão, `configHash`/`artifactHash` (via `HashChip`, resumidos por
   padrão), release associada (com badge "ATIVA" só quando `currentlyActive === true`).

Seção de Replay reaproveitando `ReplayCapabilitySummary` (Etapa 26b), agora com uma tabela real
(`<table>`) de divergências campo a campo quando o status é `REPLAY_INTEGRITY_FAILED`, agrupadas
pelo vocabulário real do verificador (`presenca`, `totalScore`, `dataCoverage`, `rank`, `group`,
`metric.<chave>`) — nunca resumida como "vermelho/verde".

## Laboratório e Releases (`CalibrationLabScreen.tsx`, §8-§18)

Banner fixo no topo: "Ambiente histórico / não operacional", com três frases explícitas (nada
altera produção automaticamente; métricas são congeladas no instante do snapshot; ativar exige o
fluxo de release, separado e confirmado).

**Comparação base × candidata** (§10): `computeWeightDeltas` mostra só os pesos que de fato
divergem entre a release ativa (quando existe) e a configuração candidata em edição —
`{metric, from, to}`, renderizado como `from → to`. Peso igual nos dois lados nunca aparece na
lista. A base só existe quando há release ativa; a baseline embutida varia por cenário do draft
(blind/lane revelada/meio do draft), então comparar contra "a" baseline fingiria uma configuração
única que não existe.

**Métricas do experimento**: os três `<pre>{JSON.stringify(...)}</pre>` anteriores foram
substituídos por cards/tabelas estruturados usando os tipos reais do domínio
(`CalibrationExperimentReport`, `CalibrationHumanReviewSummary`, `CalibrationExclusionSummary`,
`CalibrationReweightedCandidate`) — nenhum campo novo, só apresentação. Cobertura mostra
total/reavaliados/excluídos/não-reproduzíveis com o motivo de cada exclusão traduzido
(`EXCLUSION_REASON_LABELS`), nunca enquadrado como falha do modelo.

**Integridade temporal**: bloco factual explicando que cada caso é reavaliado só com o que o
`ReplayInputBundle` daquele snapshot preservou — histórico posterior ao instante do draft nunca
entra, por construção do bundle (Etapa 26a). Não há um "score de integridade temporal" inventado.

**Releases**: `RELEASE_STATUS_LABELS` traduz o estado cru; badge "ATIVA" (`tone="positive"`)
aparece só quando `release.currentlyActive === true` — nunca duas releases marcadas ao mesmo
tempo, porque só uma pode ter esse campo verdadeiro (garantia estrutural do ponteiro único,
Etapa 27b). `HashChip` nos dois hashes (config/artefato) de cada release, resumidos por padrão.
Quando a release veio do experimento aberto na tela (`release.experimentId === experimento.id`),
um indicador discreto ("↳ do experimento aberto acima/abaixo") mostra a relação sem sugerir que
todo experimento vira release. As confirmações em dois passos de ativação/rollback já existentes
(Etapa 27b) foram preservadas sem alteração de comportamento — só reorganizadas visualmente.

## Componente novo: `ui/HashChip.tsx`

Disclosure progressivo para hashes/IDs técnicos: resumido por padrão (6 primeiros + … + 4
últimos caracteres), botão para expandir/recolher e ação separada de copiar
(`navigator.clipboard`). Usado em `DraftHistoryScreen` e `CalibrationLabScreen` para todo
`configHash`/`artifactHash`/`configHash` de candidata. `navigator` precisou ser adicionado aos
globals do `eslint.config.js` raiz (primeiro uso de `navigator.clipboard` no repositório).

## Backend (aditivo, §nenhuma lógica alterada)

`RecommendationSnapshot.configurationSource`/`configurationReleaseId`/`configurationVersion`/
`configHash` já existiam no schema (colunas nullable desde a Etapa 27b) e nunca eram serializados
na resposta de `GET /drafts/sessions/:id`. `draft-session-repository.ts` ganhou
`resolveSnapshotRelease` (resolve a release referenciada + se é a atualmente apontada) e passou a
expor os quatro campos + um resumo da release (`id`, `releaseVersion`, `artifactHash`, `status`,
`currentlyActive`) por snapshot. Mudança 100% de leitura/serialização — nenhuma coluna nova,
nenhuma query que não existisse, nenhum valor computado que não estivesse já no banco.

## Testes

- `draft-session-repository.test.ts` (5 casos: sem snapshot, baseline embutida sem lookup de
  release, release resolvida ativa, release resolvida não-ativa/revertida, release referenciada
  mas apagada).
- `HashChip.test.tsx` (3 casos: resumo por padrão + expandir, copiar o valor completo, hash curto
  não truncado).
- `ReplayCapabilitySummary.test.tsx` estendido com a tabela de divergência estrutural.
- `DraftHistoryScreen.test.tsx` (3 casos: lista vazia honesta, filtro client-side sem nova
  chamada à API, detalhe com os três blocos + hash resumido por padrão, nunca o valor completo).
- `CalibrationLabScreen.test.tsx` (novo, 4 casos: banner "ambiente histórico"; badge ATIVA + hash
  resumido nunca o completo; comparação base×candidata só com os pesos divergentes; tradução de
  status sem duplicar o badge ATIVA).

1212 testes TypeScript no monorepo (core 635, riot 97, api 353, desktop 127) + 15 na raiz +
1 do analyzer Python = 1228 no total.

## Validação real

Docker reconstruído com a imagem da API contendo as mudanças desta etapa; `prisma migrate deploy`
confirmou **zero migrations pendentes** (etapa 100% aditiva, sem alteração de schema). Contra a
conta real Zekerus#117 (token HMAC assinado, mesmo `AUTH_TOKEN_SECRET` do container):

- `GET /recommendation-engine/active-release` confirmou `release-etapa27c-v1` `ACTIVE`, com
  `artifactHash` `8878a657…` e `configHash` `fa9dbde1…` **idênticos** aos registrados antes desta
  etapa.
- Recomendação controlada de sempre (JUNGLE, pick 3, Ahri aliada, Lee Sin inimigo, bans 55/91) →
  **5 candidatos idênticos** à linha de base: Viego 58.7/0.9, Udyr 58.5/0.5, Vi 55.3/0.5,
  Nocturne 53.3/0.5, Graves 50.1/0.5.
- Snapshot novo persistido com `configurationSource: RELEASE`, `configHash` batendo com a release
  ativa, `releaseVersion: release-etapa27c-v1`, `currentlyActive: true` — confirma o novo campo
  aditivo funcionando ponta a ponta contra dado real.
- `POST /recommendation-snapshots/:id/verify-replay` no snapshot novo → **`EXACT_REPLAY`, 0
  divergências**.

**Validação visual em Electron real via CDP não foi executada nesta sessão.** Desde a Etapa 31D,
o boot do renderer chama `window.sparta.session.get()` de forma incondicional no primeiro efeito
de `App.tsx` — sem o bridge de preload do processo Electron real, essa chamada lança e o shell
autenticado nunca monta, então uma aba de navegador comum (mesmo apontando para o dev server) não
consegue mais reproduzir as telas pós-login, ao contrário de sessões anteriores a essa etapa. A
validação desta etapa se apoiou em: (1) toda a lógica de leitura/serialização confirmada contra o
Postgres e a API reais via curl, incluindo os campos novos; (2) suíte de testes de componente com
`@testing-library/react`/jsdom cobrindo texto exato renderizado (banner, badge ATIVA, hash
resumido vs. completo, filtros, blocos do detalhe); (3) `typecheck`/`build` do bundle do renderer
sem erros, confirmando que o código compila e o Vite gera um bundle válido. Fica registrado como
limitação explícita, não como validação equivalente a uma sessão CDP real — mesmo padrão de
honestidade das etapas anteriores quando um recurso dependia do League Client aberto.

## Fora desta etapa

Modo carreira, coach ao vivo, dado global, RSO real, serviço de email real, site institucional,
domínio, VPS. Nenhuma fórmula, peso, threshold, critério de ativação, replay, hash científico ou
persistência de calibração foi alterado.
