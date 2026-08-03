---
status: IMPLEMENTADA
solicitado_em: 2026-08-03 14:00
implementado_em: 2026-08-03 14:40
---

# Etapa 27a — Domínio de releases operacionais

## Pedido original

> # ETAPA 27a — Domínio de releases operacionais
>
> Aplique as regras permanentes registradas em `.ai/`.
>
> Execute somente a Etapa 27a.
>
> ## Decisão arquitetural
>
> O `packages/core` deve continuar puro e sem acesso a banco, cache ou variáveis operacionais.
> Na futura Etapa 27b, a API será responsável por: 1. resolver a configuração ativa; 2. validar
> ou aplicar fallback; 3. injetá-la no motor. O core deve apenas receber uma configuração efetiva
> já resolvida. Não implemente provider, cache, banco, rotas, tela ou ativação nesta subetapa.
>
> ## Objetivo
>
> Criar o domínio puro necessário para transformar uma configuração aprovada no laboratório em
> um artefato operacional: imutável, versionado, validável, reproduzível, compatível com o
> motor, preparado para ativação e rollback futuros. Nenhuma release deve ser ativada nesta
> etapa.
>
> [pedido completo com os contratos `EffectiveRecommendationConfiguration`,
> `RecommendationReleaseArtifact`, canonicalização/hash, validação pré-ativação (9 estados),
> equivalência laboratório × motor, máquina de estados (7 estados) e lista de testes essenciais —
> ver `docs/release-domain.md` para o contrato completo tal como implementado]

## Notas de implementação

Domínio novo em `packages/core/src/release/`, cinco arquivos + testes:

1. **`effective-configuration.ts`** — `EffectiveRecommendationConfiguration`,
   `SupportedPostAggregationRules`, `WeightableMetricKey` (união literal própria — derivar do
   tipo largo `RecommendationMetricKey` de `calibration/engine-candidate.ts` resultaria no
   próprio tipo largo, já que aqueles exports são intencionalmente amplos). `configHash` via
   canonicalização + hash injetado (sem `node:crypto`, mesmo padrão de todas as etapas
   anteriores). `buildEffectiveConfigurationFromCandidate` deriva de uma `CalibrationCandidate`
   já aprovada, reaproveitando `resolvePostAggregationThresholds` da Etapa 25a.
2. **`draft/recommendation-engine.ts` (modificado, aditivo)** — `recommendFromPersonalPool` ganhou
   `input.configuration?: EffectiveRecommendationConfiguration` opcional. Sem ela, path idêntico
   a sempre. Com ela, os pesos vêm de `engineWeightsFromConfiguration` e os thresholds
   pós-agregação (`primaryCount`/`alternativeCount`/pisos/curva de risco) passam a ser lidos da
   configuração em vez de hardcoded. Nova `buildBaselineConfiguration(draft, options)` exportada,
   que usa `selectWeights(draft)` internamente — a baseline continua **dependente do cenário do
   draft** de propósito (blind/lane revelada/meio do draft continuam com tabelas diferentes; só
   uma release já calibrada usa pesos uniformes, mesma premissa que o laboratório de calibração
   já assume desde a Etapa 25 ao reponderar).
3. **Achado real durante a implementação — não associatividade de ponto flutuante**: a primeira
   versão quebrou o requisito "baseline explícita reproduz exatamente o resultado atual"
   silenciosamente na última casa decimal (`dataCoverage: 0.7999999999999999` vs `0.8`).
   `normalizeAvailableWeights` soma pesos com `Object.keys(weights).reduce(...)`, e a ordem de
   inserção de chaves de `selectWeights` difere entre os três cenários e da minha ordem canônica
   de reconstrução — somar as mesmas parcelas em ordem diferente muda o resultado em ponto
   flutuante. Corrigido preservando a ordem de inserção original em vez de tocar
   `normalizeAvailableWeights` (código já testado, fora de escopo alterar): `buildBaselineConfiguration`
   grava `metricWeights` na ordem de `Object.keys(weights)` (a tabela do cenário), e
   `engineWeightsFromConfiguration` reconstrói na ordem de `Object.keys(configuration.metricWeights)`
   (chave ausente entra por último, valendo zero). Round-trip agora é bit a bit idêntico —
   comprovado por teste com `toEqual` na resposta inteira.
4. **`release-artifact.ts`** — `RecommendationReleaseArtifact`, `ReleaseExperimentEvidence`
   (reaproveita `CalibrationExperimentReport` da Etapa 25b inteiro, não reconstrói),
   `ReleaseCompatibilityManifest`. `artifactHash` exclui `createdAt`; inclui configuração,
   revisão exata da candidata, experimento (id/hash/filtros canonicalizados/amostra) e
   compatibilidade.
5. **`laboratory-equivalence.ts`** — roda o motor operacional de verdade
   (`replayRecommendationEngineV1`, ganhou parâmetro opcional `configuration` — mudança aditiva
   em `calibration/replay-verifier.ts`) alimentado pelo `ReplayInputBundle` real (Etapa 26) de
   cada caso, e compara com o ranking que o laboratório persistiu pra aquela candidata. Prova que
   a reponderação por métrica congelada (Etapa 25, aproximada) concorda com o motor de verdade
   executado com dado histórico real — não só consigo mesma. Ignora candidatos
   `NOT_RECOMMENDED` do laboratório (o motor nunca os devolve). `draftStateFrom` exportado de
   `replay-verifier.ts` pra reuso (mudança aditiva).
6. **`release-validation.ts`** — `validateReleaseArtifact`, os nove estados pedidos, checados em
   ordem (a checagem mais cara — equivalência com o motor — só roda depois de todas as
   estruturais passarem). Reaproveita `validateCalibrationCandidate` (Etapa 25a) pra
   `UNSUPPORTED_PARAMETER` em vez de duplicar a classificação de capacidade de replay.
7. **`release-state-machine.ts`** — `DRAFT → VALIDATING → {VALIDATION_FAILED,
   READY_FOR_ACTIVATION} → ACTIVE → ROLLED_BACK`, mais `REJECTED` alcançável de
   `VALIDATION_FAILED`/`READY_FOR_ACTIVATION`. `ACTIVE` só a partir de `READY_FOR_ACTIVATION`;
   `ROLLED_BACK` só a partir de `ACTIVE`; `READY_FOR_ACTIVATION` exige `validation.status ===
   "VALID"` explicitamente passada — grafo permitir não basta. Guarda extra de
   `ARTIFACT_CHANGED` quando o hash do artefato não bate com o hash validado.

**Não implementado nesta subetapa** (conforme escopo): migration, tabela, provider, rota, tela,
ativação real, rollback real, invalidação de cache, ou qualquer alteração da configuração
efetivamente usada pela API hoje. As duas ocorrências pendentes do bug de `POST` sem corpo em
`generateDraftComparison`/`revealDraftReviewResult` (api-client.ts) continuam fora de escopo,
sinalizadas à parte na Etapa 26b — não foram tocadas aqui.

**Testes**: 68 novos em `packages/core` (24 configuração efetiva, 8 no motor + baseline
explícita, 7 artefato/hash, 7 equivalência laboratório×motor, 11 validação dos 9 estados, 13
máquina de estados) — 596 no total do pacote. Cobrem exatamente a lista pedida: baseline
reproduz resultado atual (com o bug de ponto flutuante corrigido), configuração candidata
reproduz o laboratório (via bundle real, não só métrica congelada), peso muda
`configHash`/`artifactHash`, nome não muda, threshold de derivação rejeitado, versão
incompatível rejeitada (dois casos distintos: candidata com versão que o domínio não reconhece
vs. artefato com manifesto desatualizado), artefato adulterado falha, zero casos exatos impede
prontidão, release validada chega a `READY_FOR_ACTIVATION`, não fica ativa sozinha, transição
inválida bloqueada, `core` sem I/O (nenhum import de fs/rede/prisma em `release/`), mesma
entrada produz o mesmo ranking, baseline preserva scores/ordenação anteriores.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos nos quatro pacotes
TypeScript, sem regressão em nenhum teste pré-existente (996 testes agregados no monorepo:
core 596, riot 96, desktop 73, api 241, mais o teste de infraestrutura da raiz).

Ver `docs/release-domain.md`.
