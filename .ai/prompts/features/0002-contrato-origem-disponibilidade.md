---
status: IMPLEMENTADA
solicitado_em: 2026-07-25 12:35
implementado_em: 2026-07-25 15:52
---

# Contrato de origem, disponibilidade e confiança dos dados

## Pedido original

> # ETAPA 2 — Contrato de origem, disponibilidade e confiança dos dados
>
> ## Contexto
>
> A auditoria confirmou que o Sparta atualmente pode apresentar o valor 50 tanto para:
>
> - Um resultado realmente calculado como neutro.
> - Ausência de dados.
> - Fallback artificial.
> - Componente ainda não implementado.
>
> Esses casos precisam deixar de ser semanticamente e visualmente iguais.
>
> Também existem dados oficiais, observados, calculados, derivados e inferidos sem um contrato
> central que informe sua origem, disponibilidade, atualidade e confiança.
>
> ## Objetivo
>
> Criar um contrato central e extensível para representar: valor disponível, parcial,
> desatualizado, indisponível; dado oficial, observado, calculado, derivado, inferido, de cache;
> origem, contexto, confiança e motivo de indisponibilidade.
>
> A estrutura deve preparar o domínio para futuras métricas de: desempenho e conforto pessoal,
> experiência com o campeão, matchup pessoal, matchup global, sinergia aliada, resposta à
> composição inimiga, adequação ao draft completo 5×5, dificuldade do campeão, risco de execução
> para o jogador, impacto oficial do patch, força observada no meta, builds e runas, pré-game e
> pós-game. Não implemente os cálculos dessas funcionalidades nesta etapa.
>
> ## Contrato de proveniência
>
> Crie uma estrutura equivalente a `DataProvenance`, permitindo informar quando aplicável: tipo
> da origem, identificação da fonte, endpoint/recurso, patch, região, elo, fila, posição, tamanho
> da amostra, data da coleta, data de validade, versão do algoritmo, confiança, status, motivo de
> indisponibilidade, motivo de desatualização. Campos não aplicáveis devem permanecer ausentes.
> Não utilize valores fictícios para preencher campos opcionais.
>
> Origem: OFFICIAL, OBSERVED, CALCULATED, DERIVED, INFERRED, CACHE.
> Disponibilidade: AVAILABLE, PARTIAL, STALE, UNAVAILABLE.
>
> ## Métrica estruturada
>
> Contrato central para métricas de recomendação contendo, no mínimo: identificador, valor
> numérico opcional, status de disponibilidade, confiança opcional, proveniência opcional,
> explicação curta opcional, motivo de indisponibilidade opcional. Uma métrica indisponível não
> pode receber automaticamente 0 ou 50.
>
> ## Separação obrigatória de conceitos
>
> Matchup pessoal, matchup global, mudança oficial do patch, impacto teórico do patch, força
> observada no meta, experiência pessoal, dificuldade geral, risco de execução para o jogador,
> confronto direto de lane e resposta à composição inimiga completa não podem ser unidos numa
> métrica genérica.
>
> ## Recomendações múltiplas
>
> A estrutura deve funcionar individualmente para cada candidato, sem pressupor um único campeão.
> Suportar futuramente 5+ recomendações, alternativas, métricas/proveniência/confiança
> independentes por candidato. Não alterar ainda o pool nem a quantidade atual.
>
> ## Interface
>
> Atualizar somente o necessário para suportar métrica disponível/parcial/desatualizada/
> indisponível, confiança e origem resumida. Quando indisponível: não mostrar barra numérica,
> mostrar "Indisponível", mostrar o motivo quando existir, não representar ausência com 50.
> Quando desatualizado: identificar visualmente. Manter o design system, não redesenhar telas.
>
> ## Fora do escopo
>
> Não converter ainda meta/matchup 50 em indisponível; não alterar pesos ou scores; não refatorar
> sinergia/composição; não alterar pool de candidatos; não implementar as cinco recomendações,
> matchup global, Patch Intelligence, Meta Intelligence, pré-game, persistência de drafts; não
> integrar APIs novas; não alterar ChampionTag nem seeders; não corrigir ainda o fallback MID.
>
> ## Testes mínimos
>
> 1. Valor 50 legítimo com status disponível. 2. Métrica indisponível com valor ausente.
> 3. Ausência não convertida para 0. 4. Ausência não convertida para 50. 5. Interface exibindo
> "Indisponível" sem barra. 6. Estado desatualizado diferente de disponível. 7. Proveniência
> oficial diferente de derivada. 8. Campos não aplicáveis permanecendo ausentes. 9. Métricas
> independentes para múltiplos candidatos. 10. Dados ausentes sem quebrar a interface.
> 11. Confiança ausente permanecendo ausente. 12. Compatibilidade dos consumidores atuais.

## Notas de implementação

### O que foi criado

- `packages/core/src/types/provenance.ts` — `DataProvenance`, `ProvenanceSourceType`
  (OFFICIAL/OBSERVED/CALCULATED/DERIVED/INFERRED/CACHE), `AvailabilityStatus`
  (AVAILABLE/PARTIAL/STALE/UNAVAILABLE), `ConfidenceScore` numérico com
  `toConfidenceLabel`/`toConfidenceScore` fazendo a ponte com o `Confidence` categórico
  que já existe no domínio desde a Fase 2.
- `packages/core/src/types/recommendation-metric.ts` — `RecommendationMetric` com
  `value: number | null` e os construtores `availableMetric`/`unavailableMetric`/
  `staleMetric`. `unavailableMetric` não aceita valor: o invariante "indisponível nunca tem
  número" é garantido pelo tipo, não por disciplina de quem chama.
- `packages/core/src/draft/recommendation-metrics.ts` — adaptador ÚNICO entre o bloco numérico
  atual e o contrato. Também `ensureRecommendationMetrics` (ver "Achado real" abaixo).
- `apps/desktop/src/renderer/src/ui/MetricRow.tsx` + `.css` — renderiza os quatro estados.
- `apps/desktop/vitest.config.ts` — primeira configuração de teste do renderer (jsdom +
  @testing-library/react); antes não havia como testar componente nenhum do desktop.
- `docs/data-provenance.md` (+ espelho em `.ai/specs/`).

### Decisões

- **`roles` do contrato**: campos de `DataProvenance` são todos opcionais de propósito. O que
  não se aplica fica ausente — preencher com placeholder recriaria o problema que o contrato
  existe pra resolver.
- **`LANE_MATCHUP` e `META_STRENGTH` saem sem `provenance`.** Elas continuam `AVAILABLE` com
  50 (a etapa proíbe converter em indisponível agora), mas declarar uma origem pra elas seria
  inventar. Ausência do campo é a representação honesta até a etapa seguinte.
- **15 chaves de métrica, não 8.** As 7 que o motor ainda não produz já existem no tipo e já
  têm rótulo em pt-BR: o custo de separar os conceitos agora é zero e evita que uma futura
  fusão indevida (matchup pessoal com matchup global, por exemplo) pareça natural.
- **`ConfidenceScore` numérico coexiste com `Confidence` categórico** em vez de substituí-lo.
  A conversão categórica → numérica é lossy e está documentada como aproximação.

### Achado real durante a validação

Validando no Electron real contra a API em execução, a tela de Champion Select **quebrou
inteira**: `TypeError: selected.metricDetails is not iterable`. Causa: a API rodando no Docker
era o build anterior ao contrato e devolvia recomendação sem o campo novo. Desktop e API são
implantados separadamente, então isso não é hipotético.

Corrigido com `ensureRecommendationMetrics`, aplicado **uma vez** em
`services/api-client.ts` (nenhum componente se defende por conta própria). Sem `metricDetails`
e sem `metrics`, devolve lista vazia — nunca valores inventados. 3 testes de regressão.

### Testes

24 automatizados novos: 17 em `recommendation-metric.test.ts`, 10 em
`recommendation-metrics.test.ts` (3 deles do achado acima), 9 em `MetricRow.test.tsx`. Os 12
casos mínimos pedidos estão cobertos. Suíte total: 230 testes.

### Validação no app real

Electron real via CDP (conta Zekerus#117, Champion Select em JUNGLE):

- Contra a API **antiga**: 8 métricas renderizadas normalmente pelo caminho de compatibilidade.
- Contra a API **reconstruída**: `metricDetails` nativo, com `PERSONAL_PERFORMANCE` 52.2
  `CALCULATED` conf. 0.2, `BLIND_SAFETY` 43 `DERIVED`, `TEAM_COMPOSITION` 65 `DERIVED`, e
  `LANE_MATCHUP`/`META_STRENGTH` em 50 **sem proveniência**, como projetado.
- Comportamento visual idêntico ao anterior — esperado: esta etapa troca o contrato, não o
  que é exibido.

**Não validado**: os estados PARTIAL/STALE/UNAVAILABLE dentro do app real, porque nenhuma
métrica os produz ainda (a etapa proíbe converter). Estão cobertos por teste de componente
(`MetricRow.test.tsx`), não por observação no app.
