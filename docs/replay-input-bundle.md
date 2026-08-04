# ReplayInputBundle — captura prospectiva dos inputs de derivação

Versão do schema: `replay-input-bundle/1.0.0`
(`packages/core/src/calibration/replay-input-bundle.ts`, `replay-verifier.ts`)

Esta página cobre o domínio puro (Etapa 26a) **e** a superfície operacional (Etapa 26b):
`apps/api/src/modules/drafts/evaluation-context.ts` (contexto único de avaliação),
`draft-session-repository.ts` (captura atômica) e `replay-bundle-repository.ts` +
`replay-bundle-routes.ts` (leitura e verificação).

## Por que o bundle existe

A Etapa 25 provou que o snapshot permite **reponderar** métricas já congeladas, mas não
reproduzir **como elas foram produzidas**: `PlayerChampionStats`, `ChampionTag`,
`ChampionCapabilityProfile` e os agregados de matchup são recalculados a cada sync e
sobrescritos. Testar um threshold de derivação com o dado de hoje leria um histórico maior do que
o jogador tinha no draft — vazamento temporal.

O bundle preserva, junto de cada snapshot **novo**, o que o motor consultou naquele instante.
Snapshots anteriores continuam sem bundle: **não há backfill**, e o estado atual nunca é usado
para aproximar o passado.

## O que a auditoria mudou no contrato esboçado

**1. Não basta o candidato.** `analyzeTeamComposition` e `analyzeDraftStrategy` leem tags e
capacidades de **aliados e inimigos** também. Sem eles, `ALLY_SYNERGY`, `TEAM_COMPOSITION` e
`ENEMY_COMPOSITION_ANSWER` não são reproduzíveis. Por isso existe `referencedChampions`, que
cobre todo campeão consultado com o papel explícito, e não apenas um perfil por candidato.

**2. `evaluatedAt` é input, não metadado.** `assessExecutionRisk` o usa para medir recência. Ele
**entra** no `contentHash`; `capturedAt`, que é metadado, **não entra**. Dois campos com
tratamento oposto — fundi-los quebraria uma das duas garantias.

**3. Nenhum catálogo é endereçável por conteúdo.** `ChampionTag` e `ChampionCapabilityProfile`
são linhas mutáveis semeadas de arquivos regeneráveis: não são imutáveis nem validáveis por hash.
Pela regra de artefato do próprio escopo, isso obriga a **embutir** os campos normalizados.
`compositionRules` é embutida junto com sua versão — a versão sozinha só bastaria se
identificasse exatamente as regras, e embutir remove a dúvida.

## Contrato

```ts
type ReplayInputBundle = {
  schemaVersion: string;
  snapshotId: string;
  evaluatedAt: string;   // entra no hash
  capturedAt: string;    // não entra no hash
  contentHash: string;
  algorithmVersions: Record<string, string>;
  draft: ReplayDraftContext;
  player: ReplayPlayerContext;
  candidates: ReplayCandidateContext[];
  referencedChampions: ReplayChampionContext[];
  activeParameters: ReplayActiveParameters;
  dependencyManifest: ReplayDependencyManifest[];
  provenance: DataProvenance;
  /** v2 (Etapa 27c). Ausente em v1. */
  effectiveRecommendationConfiguration?: EffectiveRecommendationConfiguration;
};
```

## v2: a configuração efetiva embutida (Etapa 27c)

A v1 guardava só `algorithmVersions.recommendationConfiguration` — o **hash** da configuração. Um
hash identifica, mas não reconstrói. Medido na ativação real da `release-etapa27b-v2`: o replay de
um snapshot produzido sob release deu `REPLAY_INTEGRITY_FAILED` com 10 divergências, porque a
verificação reconstruía com a baseline. A v2 embute a configuração inteira — origem
(`BUILT_IN_BASELINE`/`RELEASE` + `releaseId`), versão, `configHash`, pesos, métricas desligadas,
regras pós-agregação e compatibilidade.

A captura usa a **mesma instância** já resolvida em `buildEvaluationContext`, que também alimentou
motor, snapshot e observabilidade. Uma segunda cópia lida do banco poderia divergir da que de fato
produziu o resultado.

`ReplayChampionContext` declara `roles: ("CANDIDATE" | "ALLY" | "ENEMY" | "DIRECT_OPPONENT")[]`.
Um campeão aparece **uma vez** com todos os papéis que exerceu — duplicar por papel criaria duas
cópias que poderiam divergir.

`ReplayPlayerContext` **não carrega `puuid`**: a identidade do jogador não participa de nenhum
cálculo, e guardá-la seria dado pessoal sem uso.

## Campos embutidos por não terem artefato histórico confiável

| Embutido | Motivo |
| -------- | ------ |
| `ChampionTag` (inclui `officialDifficulty` e proveniência) | Linha mutável semeada de arquivo regenerável |
| `ChampionCapabilityProfile` | Idem |
| `PlayerChampionStats` | Recalculado a cada sync |
| `MatchupData` agregado | Cresce a cada sync; o agregado é o que o motor consumiu |
| `CompositionRules` | Config de código; a versão acompanha, mas o conteúdo é a garantia |

## Canonicalização

**Ordenados** (semanticamente conjuntos, verificado na Etapa 25a): pool, aliados, inimigos, bans,
candidatos e `referencedChampions` — por `championId`.

**Preservados na ordem** (semanticamente ordenados): `recentMatches` dentro de
`PlayerChampionStats`, porque a forma recente pondera por índice.

**Escalares intocados**: `pickOrder` (muda a tabela de pesos) e `directOpponentChampionId`.

**Fora do hash**: `capturedAt`, o próprio `contentHash` e a ordem acidental de chaves de objeto
(`stableStringify` ordena chaves em qualquer profundidade sem tocar em arrays).

O hash em si é injetado (`computeHash`), porque `packages/core` também roda no renderer e não
pode depender de `node:crypto`. Sem ele, a verificação de hash é **pulada e declarada**, nunca
dada como aprovada.

## Validação

| Código | Situação |
| ------ | -------- |
| `UNSUPPORTED_SCHEMA` | Schema desconhecido — interrompe a validação |
| `MISSING_CHAMPION_PROFILE` | Campeão do draft sem perfil embutido |
| `CANDIDATE_NOT_REFERENCED` | Candidato avaliado sem entrada em `referencedChampions` |
| `INCONSISTENT_ROLE` | Papel ausente ou incoerente |
| `INVALID_EVALUATED_AT` | Instante inválido |
| `MISSING_ALGORITHM_VERSION` | Versão obrigatória ausente |
| `NON_FINITE_PARAMETER` | Parâmetro não finito |
| `DUPLICATE_CHAMPION` | Campeão repetido em vez de acumular papéis |
| `DEPENDENCY_WITHOUT_INPUTS` | Métrica declarada disponível sem as seções exigidas |
| `CONTENT_HASH_MISMATCH` | Conteúdo não corresponde ao hash declarado |

A validação **relata**; nunca completa dado ausente com estado atual.

## Registro de implementações e verificador

```ts
type ReplayImplementation = (
  bundle: ReplayInputBundle,
  configuration: EffectiveRecommendationConfiguration  // obrigatória desde a 27c
) => ReplayReconstructedCandidate[];

const replayEngines = { "recommendation-engine/1.0.0": replayRecommendationEngineV1 };
```

Versão ausente do registro **não** cai no motor atual: o verificador devolve
`UNSUPPORTED_ALGORITHM_VERSION` e a versão declarada no snapshot é preservada.

**A configuração é parâmetro obrigatório.** Antes da 27c ela era opcional em
`replayRecommendationEngineV1` e o tipo do registro a apagava — o efeito prático era um fallback
silencioso para a baseline. Tornar obrigatório fecha esse caminho no próprio tipo.

De onde ela vem (`resolveBundleConfiguration`), sempre **só do bundle**:

| Caso | Origem da configuração |
| ---- | ---------------------- |
| Bundle v2 | A configuração embutida, de baseline ou de release. A baseline embutida é usada **direta**, não recalculada das constantes atuais — senão um ajuste futuro delas mudaria em silêncio o replay de um snapshot antigo |
| v1 sem `configHash` registrado | Anterior à Etapa 27b, quando release operacional não existia: a baseline do cenário é, por construção, o que produziu aquele resultado |
| v1 **com** `configHash` registrado | Desambiguado pelo próprio bundle: recalcula-se a baseline do cenário e compara-se o hash. Bate → era baseline. Não bate → era release, e os parâmetros não foram preservados |

O último caso funciona porque a baseline **varia por cenário de draft** (blind, lane revelada,
meio do draft): cada cenário tem um `configHash` distinto. **Não** se busca o artefato pelo hash —
isso reintroduziria dependência de fonte externa no caminho de verificação, exatamente o que a
Etapa 26 evitou.

`verifyReplayBundle` recebe **apenas** bundle, snapshot esperado, registro e a função de hash. Não
existe parâmetro por onde um repositório, provider ou cache pudesse entrar.

Estados: `EXACT_REPLAY`, `REPLAY_INTEGRITY_FAILED`, `UNSUPPORTED_BUNDLE_SCHEMA`,
`UNSUPPORTED_ALGORITHM_VERSION`, `INVALID_BUNDLE`, `MISSING_DEPENDENCY`,
`MISSING_EFFECTIVE_CONFIGURATION`.

Tolerâncias documentadas: `REPLAY_VERIFICATION_TOLERANCE = 0.05` ponto de score e
`REPLAY_COVERAGE_TOLERANCE = 1e-6` para a cobertura (escala 0-1). Divergência é **relatada com
esperado, reconstruído e delta**, nunca corrigida.

## Compatibilidade histórica: os seis estados

`describeSnapshotReplayCapability` classifica sem inventar. Cada estado tem uma frase própria; um
snapshot inválido nunca aparece como "indisponível", e "versão não suportada" nunca aparece como
reponderação — misturar essas leituras esconderia um sinal de problema real atrás de um estado
neutro.

| Capacidade | Quando | Frase na interface |
| ---------- | ------ | ------------------- |
| `FULL_DERIVATION_REPLAY_AVAILABLE` | Bundle presente e verificado como `EXACT_REPLAY` | "Replay completo disponível" |
| `REWEIGHT_ONLY` | Sem bundle, ou dependência histórica ausente, mas com reponderação da Etapa 25 | "Replay limitado à reponderação" |
| `FULL_DERIVATION_REPLAY_UNAVAILABLE` | Sem bundle e sem reponderação (inclui "ainda não verificado") | "Inputs históricos não preservados nesta versão" |
| `FULL_DERIVATION_REPLAY_INVALID` | Verificado e reprovado: `INVALID_BUNDLE` (violação estrutural/hash) ou `REPLAY_INTEGRITY_FAILED` (reconstruído diverge do persistido) | "Bundle inválido" |
| `FULL_DERIVATION_REPLAY_UNSUPPORTED_VERSION` | `UNSUPPORTED_ALGORITHM_VERSION` ou `UNSUPPORTED_BUNDLE_SCHEMA` | "Versão histórica não suportada" |
| `FULL_DERIVATION_REPLAY_MISSING_CONFIGURATION` | Bundle v1 cuja avaliação usou release: o identificador da configuração foi preservado, os parâmetros não | "Configuração efetiva não preservada nesta versão" |

`MISSING_EFFECTIVE_CONFIGURATION` é distinto de `INVALID` (nada corrompeu) e de `UNAVAILABLE` (os
inputs de derivação estão todos lá): o que falta é especificamente a configuração. O replay
**não é executado** — rodar a baseline produziria divergências conhecidas e enganosas, que foi
justamente o sintoma que reprovou a ativação da `release-etapa27b-v2`.

### Sem backfill, e a canonicalização é versionada por causa disso

Acrescentar `effectiveRecommendationConfiguration` ao conteúdo hasheado de forma incondicional
mudaria o `contentHash` de **todo bundle v1 já persistido**, que passaria a falhar a verificação
de integridade — um backfill silencioso pela porta dos fundos. `canonicalBundleContent` tem dois
ramos: v1 devolve exatamente a mesma string de antes da 27c; só v2 acrescenta a configuração.
Medido na base real: os 16 bundles v1 continuam com `contentHash` válido e sem configuração
embutida.

`SnapshotReplayCapabilityReport.reweightAvailable` é exposto **à parte** do `capability`: mesmo
quando o estado principal é `FULL_DERIVATION_REPLAY_INVALID` ou `_UNSUPPORTED_VERSION`, o chamador
ainda sabe se o fallback de reponderação continua funcionando.

Snapshot antigo **não é corrompido** — ele apenas não tinha os inputs preservados. Não há
backfill: `describeCapability` (na API) só lê o que já está persistido; a rota `GET
.../replay-capability` nunca dispara uma verificação nova.

## Rotas (Etapa 26b)

Todas autenticadas e isoladas por conta (`draftSession.riotAccountId`); nenhuma expõe o
`contentJson` do bundle inteiro.

| Rota | O que devolve |
| ---- | -------------- |
| `GET /draft-sessions/:sessionId/replay-capability` | Capacidade do snapshot mais recente da sessão |
| `GET /recommendation-snapshots/:snapshotId/replay-bundle-summary` | Capacidade + schema, hash, tamanho, datas e última verificação persistida |
| `POST /recommendation-snapshots/:snapshotId/verify-replay` | Roda `verifyReplayBundle` de fato, persiste o resultado em `ReplayInputBundleRecord.lastVerification` e devolve status/divergências |

`verify-replay` só lê `RecommendationSnapshot`, `PersistedRecommendation` e
`ReplayInputBundleRecord` — os três registros imutáveis da Etapa 26a. Nenhuma tabela mutável
(`PlayerChampionStats`, `ChampionTag`, catálogo) entra na verificação.

## Interface

O detalhe de sessão em "Histórico de drafts" e o caso aberto no "Laboratório do motor" mostram o
mesmo componente (`ReplayCapabilitySummary.tsx`): a frase da capacidade, schema/motor/tamanho/
captura quando há bundle, e um botão "Verificar replay" que chama a rota `POST` ao vivo.

## Observabilidade

Captura (`persistDraftAnalysis`, `apps/api/src/modules/drafts/routes.ts`): evento
`replay_bundle_captured` ou `replay_bundle_capture_failed` com schema, tamanho em bytes, duração
da canonicalização e duração da persistência — nunca o conteúdo. Verificação
(`replay-bundle-routes.ts`): evento `replay_bundle_verified` com schema, status, contagem de
divergências e duração — nunca as divergências em si nem o bundle.

## Bug real corrigido na validação: POST sem corpo

O cliente do desktop (`services/api-client.ts`) sempre manda `Content-Type: application/json`,
mesmo em chamadas `POST` sem `body`. O Fastify recusa isso com `FST_ERR_CTP_EMPTY_JSON_BODY`
(400) **antes** de a rota rodar — achado testando "Verificar replay" pela UI real, não por curl
(curl não manda esse header por padrão, então o teste manual inicial não pegou o bug).
`verifySnapshotReplay` no cliente passou a mandar `body: "{}"`. As outras duas funções do arquivo
com o mesmo padrão (`generateDraftComparison`, `revealDraftReviewResult`) não foram tocadas —
ficaram fora do escopo desta etapa, sinalizadas para correção separada.

Um segundo achado, também só visível pela UI real: o botão "Verificar replay" fica dentro do
`<button>` do `InteractiveCard` pai (mesmo padrão já usado pelo botão de revisão humana da Etapa
24) — sem `event.stopPropagation()`, o clique também alternava o card e escondia o resultado que
acabara de chegar. Corrigido em `ReplayCapabilitySummary.tsx`.
