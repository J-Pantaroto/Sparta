---
status: EM_ANDAMENTO
solicitado_em: 2026-07-28 00:19
implementado_em:
---

# Dificuldade do campeão e risco pessoal de execução

## Pedido original

> Integrar ao ranking duas dimensões distintas: a dificuldade geral real do
> campeão, proveniente de `info.difficulty` da Data Dragon, e o risco pessoal
> estimado de execução, derivado dessa dificuldade e da evidência pessoal na
> posição. Preservar valor original, versão, algoritmo e proveniência; não
> inventar familiaridade, confiança ou valores neutros quando os dados
> estiverem ausentes. O risco deve influenciar a ordenação de forma limitada,
> explicável e sem dupla contagem de desempenho pessoal, mantendo
> compatibilidade com respostas antigas e todas as restrições da Etapa 13.

## Notas de implementação

- `info.difficulty` é preservado na escala 0-10, com versão do catálogo,
  recurso e proveniência oficial, e normalizado para 0-100 pelo algoritmo
  versionado `champion-difficulty-normalization/1.0.0`. O fato oficial ficou
  separado de `ChampionTag.difficulty`, que continua sendo dimensão
  estratégica derivável/curável.
- `PERSONAL_EXPERIENCE` considera somente amostra e recência na posição.
  `EXECUTION_RISK` combina essa evidência com a dificuldade sem ler win rate
  ou desempenho, e aplica no máximo 8 pontos de penalização ao score base.
  Sem dificuldade, risco e penalização ficam indisponíveis/zero.
- Candidato manual sem histórico continua elegível: a familiaridade é
  indisponível, mas a ausência observada (`sampleSize: 0`) pode compor o risco
  quando a dificuldade oficial existe. Respostas antigas recebem os três
  campos novos como `UNAVAILABLE`, sem neutro artificial.
- Manifesto regenerado com Data Dragon 16.14.1 e 173/173 dificuldades
  preservadas. Migration aplicada ao Postgres; seed idempotente confirmou
  173/173 valores brutos, normalizados e algoritmos.
- Testes novos no core, repositório, adapter e renderer. Bateria final: 539
  testes TypeScript, 1 teste Python, typecheck, lint, build e
  `champion-tags:check` aprovados. A API real retornou cinco principais e uma
  alternativa para Jungle com dificuldade, experiência, risco e penalização
  explicáveis.

Fora de escopo preservado: risco específico por composição/adversário,
maestria, inferência de habilidade, alteração de elegibilidade global,
recomendação de build/runa e recalibração geral do scoring.
