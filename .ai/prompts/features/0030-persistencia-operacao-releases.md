---
status: IMPLEMENTADA
solicitado_em: 2026-08-03 15:00
implementado_em: 2026-08-03 15:40
---

# Etapa 27b — Persistência e operação segura de releases

## Pedido original

> # ETAPA 27b — Persistência e operação segura de releases
>
> Aplique as regras permanentes registradas em `.ai/`.
>
> Execute somente a Etapa 27b.
>
> ## Decisão arquitetural
>
> A API deve: 1. resolver a configuração efetiva; 2. validar sua integridade; 3. aplicar cache ou
> fallback; 4. injetá-la explicitamente em `recommendFromPersonalPool`. O core não pode acessar
> banco, cache, ambiente ou provider. A configuração deve ser resolvida uma vez por avaliação e
> compartilhada por motor, snapshot, `ReplayInputBundle` e observabilidade.
>
> [pedido completo com persistência (`RecommendationEngineRelease`/`ActivePointer`/`ReleaseEvent`),
> baseline operacional, provider com cache/TTL/fallback, integração no fluxo real, validação de
> release, ativação e rollback transacionais, sete rotas, interface mínima, observabilidade,
> validação real sem ativar a candidata real, casos críticos e pendências fora de escopo —
> ver `docs/release-operations.md` para o contrato completo tal como implementado]
>
> Pare com a candidata real em READY_FOR_ACTIVATION.

## Notas de implementação

Migration `20260803150000_recommendation_engine_releases`: três tabelas novas
(`RecommendationEngineRelease`, `RecommendationEngineActivePointer`,
`RecommendationEngineReleaseEvent`) mais cinco colunas **nullable** de eco da configuração em
`RecommendationSnapshot`. Nenhum snapshot antigo recebe dado retroativo (medido: 15 snapshots,
0 com `configHash`).

Módulo novo `apps/api/src/modules/release/`:

1. **`release-repository.ts`** — cria a release (constrói `EffectiveRecommendationConfiguration` +
   `RecommendationReleaseArtifact` da Etapa 27a, que a 25b não persiste), valida, ativa e reverte.
   Ativação e rollback rodam em transação **serializável** com reivindicação atômica por
   `updateMany` condicional no status — mesmo padrão de `PENDING → RUNNING` da 25b.
2. **`active-configuration-provider.ts`** — `resolve`/`invalidate`, cache por conta com TTL de 30 s,
   validação de hash antes do uso, fallback pra última configuração válida conhecida (banco fora
   do ar) e depois pra baseline. **Nunca devolve configuração inválida nem pesos vazios.**
3. **`routes.ts`** — as sete rotas pedidas. Ativação e rollback aceitam só `releaseId` (na URL) e
   `reason` opcional: o schema zod não tem campo de peso, então peso enviado no corpo é ignorado
   por construção (coberto por teste).

**Decisão sobre a baseline**: o provider **não** resolve a baseline — devolve só
`source: "BUILT_IN_BASELINE"` e quem tem o `DraftState` (`buildEvaluationContext`) chama
`buildBaselineConfiguration`. A baseline depende do cenário do draft (blind/lane revelada/meio do
draft usam tabelas diferentes), e resolvê-la no provider exigiria passar o draft inteiro pra um
componente cujo único trabalho é ler a release ativa. `GET /recommendation-engine/active-release`
sem release ativa devolve as **três tabelas reais**, uma por cenário, em vez de fabricar "a"
baseline única que não existe.

**`status = "ACTIVE"` ≠ "é a ativa agora"**: o grafo da 27a só permite `ACTIVE → ROLLED_BACK`, então
uma release superada por outra continua com esse status até ser revertida. Quem é a ativa agora é
o **ponteiro**; `ReleaseRow` expõe os dois fatos separados (`status` e `currentlyActive`), e
rollback só aceita a release efetivamente apontada.

**`configHash` entra em `algorithmVersions`** (como `recommendationConfiguration`), que já é
`Record<string,string>` livre — sem tocar nenhum tipo do core. Consequência deliberada: trocar de
release força snapshot novo mesmo com draft idêntico, porque o hash do input canônico muda.

**Bug real encontrado só na validação contra o Postgres real**: `decideCandidate` (25b) grava a
decisão na **coluna** `status`, mas o `configJson` congelado guarda o status da **criação** (que a
25b só permite ser `DRAFT`/`READY`). A primeira versão lia o JSON e reprovava toda candidata
aprovada com `INVALID_CANDIDATE_STATE`. Nenhum teste sintético pegaria — o fixture monta o
candidato já com o status certo. Corrigido sobrepondo a coluna (autoritativa) antes de chamar
`validateReleaseArtifact`.

**Interface**: dois blocos novos no Laboratório do motor, sem redesenhar a tela — "Configuração
operacional atual" (só leitura) e "Releases" (preparar/validar/ativar/reverter, com confirmação em
dois passos). **Zero campos de peso** em qualquer tela de release (verificado no DOM real).

**Testes**: 22 novos em `apps/api` (9 do provider, 13 das rotas) — 263 no total do pacote. Cobrem
baseline sem release ativa, cache HIT/MISS, invalidação, os dois caminhos de fallback, hash
inválido rejeitado, isolamento por conta, peso no corpo ignorado, e os 409/404/401. `packages/core`
continua em **596** testes, inalterado — prova de que o core não foi tocado.

**Validação real** (Docker reconstruído, Postgres real, Zekerus#117): baseline confirmada em uso;
**3 snapshots pré-27b replayados pelo motor novo com `EXACT_REPLAY` e zero divergências** (prova
mais forte que comparar scores à mão — o resultado operacional anterior foi preservado
exatamente); release criada e validada até `READY_FOR_ACTIVATION` com equivalência
laboratório×motor **`MATCH` em 2 casos reais, 0 divergências**; `NO_EXACT_REPLAY_CASES` bloqueou
corretamente um experimento sem bundle; transições inválidas devolveram 409/404/401; ativação e
rollback exercitados numa **conta isolada** (baseline → v1 → v2 → rollback restaura v1 → rollback
volta à baseline), removida por completo depois; **4 ativações concorrentes → 1 sucesso e 3
conflitos**, 1 ponteiro, 1 evento; hash adulterado caiu pra baseline sem chegar ao motor; Electron
com 0 erros de console e 0 campos de peso.

**A candidata real permanece `APPROVED_FOR_FUTURE_RELEASE` e a release dela em
`READY_FOR_ACTIVATION`, nunca ativada.**

**Fora de escopo, não tocado**: calibração de thresholds de derivação, meta global, aprendizado
automático, e as duas ocorrências pendentes do `POST` sem corpo em
`generateDraftComparison`/`revealDraftReviewResult`.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos nos quatro pacotes TypeScript
(core 596, riot 96, desktop 73, api 263).

Ver `docs/release-operations.md`.
