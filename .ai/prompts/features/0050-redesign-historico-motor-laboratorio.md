---
status: IMPLEMENTADA
solicitado_em: 2026-08-07 03:15
implementado_em: 2026-08-07 06:15
---

# Etapa 31I — Redesign do Histórico do Motor e Laboratório de Calibração

## Pedido original

> Modernizar visualmente: Histórico do Motor, Laboratório de Calibração, visualização de
> experimentos, comparação de configurações, estados de replay, histórico de releases e
> evidência de auditoria. Auditoria completa antes de tocar código, classificando cada tela/
> componente/contrato em reaproveitar/refatorar/substituir/manter, sem reorganizar o domínio só
> para facilitar CSS. Separação conceitual explícita entre Histórico do Motor ("o que o motor
> usou e produziu"), Laboratório ("o que aconteceria reavaliando historicamente uma configuração
> congelada") e Release ("qual configuração está operacionalmente ativa"), nunca misturados numa
> mesma tabela. Histórico do Motor: lista/timeline com hashes resumidos (disclosure progressivo),
> detalhe dividido em contexto congelado/resultado produzido/configuração, ranking visual sem
> comparar com score atual, seção de replay com estados completos e divergência campo a campo
> (nunca resumida como vermelho/verde). Laboratório: cabeçalho "ambiente histórico/não
> operacional", lista de experimentos reaproveitando estados existentes, comparação base×candidata
> só com pesos que de fato mudaram, métricas via cards/barras/distribuições nunca inventando
> acurácia, bloco de integridade temporal explícito, cobertura visual sem enquadrar exclusão como
> falha. Releases: histórico visual com só uma marcada ATIVA quando factualmente verdadeiro, card
> dedicado da release ativa, controles de ativação/rollback redesenhados sem mudar comportamento,
> relação experimento→release visível sem implicar que todo experimento vira release. Reaproveitar
> ao máximo o sistema de design recente, reduzir barras de progresso repetitivas em favor de
> deltas/cards/tabelas/chips, padrão de disclosure de hash, filtros só com suporte real,
> responsividade 1000/1280/1600px, acessibilidade completa, performance sem carregar tudo de uma
> vez. Confirmar rotas autenticadas, autorização intacta, sem acesso cross-account, hashes visíveis
> mas nunca tokens/segredos. Checklist extenso de teste. Não regressão completa (fórmulas, pesos,
> métricas, critérios do laboratório, corte temporal, ReplayInputBundle, snapshots, release ativa,
> ativação, rollback, ranking, recomendações, modelo de autorização) com EXACT_REPLAY e
> `release-etapa27c-v1` confirmada intacta. Verificação completa (version-check, prisma generate,
> typecheck, lint, build, testes, analyzer, Electron empacotado). Documentação, changelog, status
> da feature, commit, push para main, CI verde, árvore limpa, `HEAD == origin/main`. Não alterar a
> infraestrutura de testes por causa da flakiness já conhecida de `apps/api`. Não implementar modo
> carreira, coach ao vivo, dado global, RSO real, serviço de email real, site institucional,
> domínio ou VPS. Não alterar a ciência/lógica operacional do motor.

## Notas de implementação

Relatório completo em `docs/engine-history-calibration-lab-redesign.md`. Resumo:

**Auditoria (§1-§2)**: `DraftHistoryScreen.tsx` (nav "Histórico de drafts") é o alvo real dos
§3-§7 — lista snapshots individuais com hash/config/release/replay. `CalibrationLabScreen.tsx`
("Laboratório do motor") é o alvo dos §8-§18. `MotorHistoryScreen.tsx` (observabilidade agregada
da Etapa 23) já usava integralmente o design system atual, tokens corretos e zero barra de
progresso repetitiva — auditoria concluiu **manter**, sem tocar código.

**Backend (aditivo)**: `RecommendationSnapshot.configurationSource`/`configurationReleaseId`/
`configurationVersion`/`configHash` já existiam no schema desde a Etapa 27b (colunas nullable)
e nunca eram serializados. `resolveSnapshotRelease` (novo, `draft-session-repository.ts`) resolve
a release referenciada + se é a atualmente apontada; os quatro campos + resumo de release passam
a sair em `GET /drafts/sessions/:id`. Mudança 100% de leitura — nenhuma query nova, nenhum campo
computado que não estivesse já persistido.

**Frontend**: `ui/HashChip.tsx` (novo) — disclosure progressivo de hash (resumido por padrão,
expandir, copiar). `DraftHistoryScreen.tsx` reescrito com filtros client-side (posição/período),
três blocos rotulados no detalhe (Contexto congelado/Resultado produzido/Configuração), ranking
com `ScoreBadge`, `HashChip` nos hashes. `ReplayCapabilitySummary.tsx` ganhou uma tabela real
(`<table>`) de divergência campo a campo. `CalibrationLabScreen.tsx` ganhou banner "Ambiente
histórico/não operacional", `computeWeightDeltas` (só pesos que divergem entre release ativa e
candidata), substituição dos três `<pre>JSON</pre>` por cards/tabelas estruturados (cobertura,
integridade temporal factual, revisão humana, componentes de score), `RELEASE_STATUS_LABELS` +
badge "ATIVA" (`tone="positive"`, só quando `currentlyActive === true`), indicador de relação
experimento→release.

**Validação real**: Docker reconstruído com a imagem contendo as mudanças; `prisma migrate
deploy` confirmou zero migrations pendentes (etapa aditiva, sem schema novo). Contra a conta real
Zekerus#117: `release-etapa27c-v1` `ACTIVE` com `artifactHash`/`configHash` idênticos aos
registrados antes; recomendação controlada de sempre → 5 candidatos idênticos à linha de base;
snapshot novo persistido com os campos novos corretos (`configurationSource: RELEASE`,
`currentlyActive: true`); `verify-replay` → `EXACT_REPLAY`, 0 divergências.

**Limitação registrada, não escondida**: validação visual em Electron real via CDP não foi
executada nesta sessão — desde a Etapa 31D o boot de `App.tsx` chama
`window.sparta.session.get()` incondicionalmente, e sem o bridge de preload do processo Electron
real essa chamada lança, então uma aba de navegador comum não reproduz mais as telas pós-login.
A validação se apoiou em: leitura/serialização confirmada contra o Postgres/API reais via curl,
suíte de testes de componente cobrindo texto exato renderizado, e `typecheck`/`build` do bundle
sem erros.

**1228 testes** no monorepo (core 635, riot 97, api 353, desktop 127, raiz 15, analyzer 1) — 12
novos cobrindo especificamente esta etapa (`draft-session-repository.test.ts` 5,
`HashChip.test.tsx` 3, `DraftHistoryScreen.test.tsx` 3, `CalibrationLabScreen.test.tsx` 4, mais a
extensão de `ReplayCapabilitySummary.test.tsx`). `typecheck`/`lint`/`build` completos nos quatro
pacotes TypeScript; `apps/api` isolado passou 353/353 numa única execução, sem flakiness desta
vez; infraestrutura de testes não foi alterada.
