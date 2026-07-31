# ReplayInputBundle — captura prospectiva dos inputs de derivação

Versão do schema: `replay-input-bundle/1.0.0`
(`packages/core/src/calibration/replay-input-bundle.ts`, `replay-verifier.ts`)

Esta página descreve a **Etapa 26a**: o domínio puro. Captura operacional, persistência, API e
tela são da Etapa 26b. Nada aqui toca a rota ao vivo, o banco ou o motor.

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
};
```

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
const replayEngines = { "recommendation-engine/1.0.0": replayRecommendationEngineV1 };
```

Versão ausente do registro **não** cai no motor atual: o verificador devolve
`UNSUPPORTED_ALGORITHM_VERSION` e a versão declarada no snapshot é preservada.

`verifyReplayBundle` recebe **apenas** bundle, snapshot esperado e registro. Não existe parâmetro
por onde um repositório pudesse entrar. Reconstrói métricas, disponibilidade, cobertura, score,
grupo e ranking chamando `recommendFromPersonalPool` — a mesma função do caminho operacional —
alimentada só pelo bundle, com `evaluatedAt` congelado.

Estados: `EXACT_REPLAY`, `REPLAY_INTEGRITY_FAILED`, `UNSUPPORTED_BUNDLE_SCHEMA`,
`UNSUPPORTED_ALGORITHM_VERSION`, `INVALID_BUNDLE`, `MISSING_DEPENDENCY`.

Tolerâncias documentadas: `REPLAY_VERIFICATION_TOLERANCE = 0.05` ponto de score e
`REPLAY_COVERAGE_TOLERANCE = 1e-6` para a cobertura (escala 0-1). Divergência é **relatada com
esperado, reconstruído e delta**, nunca corrigida.

## Compatibilidade histórica

`describeSnapshotReplayCapability` classifica sem inventar:

| Capacidade | Quando |
| ---------- | ------ |
| `FULL_DERIVATION_REPLAY_AVAILABLE` | Bundle presente e verificado como `EXACT_REPLAY` |
| `REWEIGHT_ONLY` | Sem bundle (ou com bundle não verificável) mas com reponderação da Etapa 25 |
| `FULL_DERIVATION_REPLAY_UNAVAILABLE` | Sem bundle e sem reponderação |

Textos: "Replay completo disponível", "Replay limitado à reponderação", "Os inputs de derivação
não eram preservados nesta versão", "Versão histórica do motor não suportada".

Snapshot antigo **não é corrompido** — ele apenas não tinha os inputs preservados.

## Fora desta subetapa

Captura operacional, contexto de avaliação único na rota, migration, persistência atômica, API,
tela e habilitação de thresholds ou flags de derivação no laboratório. Tudo isso é a Etapa 26b.
