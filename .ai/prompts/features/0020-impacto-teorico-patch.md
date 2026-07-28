---
status: IMPLEMENTADA
solicitado_em: 2026-07-28 16:46
implementado_em: 2026-07-28 17:02
---

# Impacto teórico das mudanças do patch

## Pedido original

> Execute somente a Etapa 20: transforme as mudanças oficiais estruturadas da
> Etapa 19 em sinais teóricos descritivos, rastreáveis e explicáveis por
> campeão. Preserve dimensão afetada, direção, magnitude somente quando houver
> metodologia objetiva, explicação, evidências, limitações, cobertura,
> disponibilidade, IDs das mudanças, versão do algoritmo e proveniência.
>
> Use somente a mudança oficial estruturada, componente e valores publicados,
> texto oficial e capacidades rastreáveis da Etapa 14. Não use estatísticas
> globais, win rate, conhecimento manual por campeão, regras por nome, opinião
> externa, histórico pessoal como prova, nem `changeType` isolado como
> conclusão. Mudanças mistas devem preservar efeitos opostos; bugfix permanece
> desconhecido sem direção funcional explícita; ausência de capacidade não
> cria capacidade nova; mesmo input deve produzir a mesma análise.
>
> Exponha a interpretação no resumo do patch, no contexto informativo do pool
> pessoal e como detalhe secundário do Champion Select, sempre separada da
> mudança oficial, do histórico pessoal e dos dados globais observados.
> `TheoreticalPatchImpact` não altera score, pesos, ranking, pool, risco,
> matchup, snapshots ou `META_STRENGTH`; não crie tier, `patchPowerScore`,
> recomendação de campeão/build/runa nem integre o impacto teórico ao ranking.

## Notas de implementação

Implementada no commit funcional `9cb0d3c`.

- Contrato e algoritmo puro `theoretical-patch-impact/1.0.0`, com 22
  dimensões estratégicas mais `UNCLASSIFIED`, direção, magnitude opcional,
  evidência oficial/capacidade, cobertura, revisão, hash e proveniência.
- Direção deriva da relação semântica com o escalar; `changeType` não decide.
  Compensações permanecem separadas ou `MIXED`; bugfix e ambiguidade ficam
  `UNKNOWN`; ausência de capacidade não cria capacidade nova.
- Magnitude documentada somente para escalares comparáveis na mesma unidade:
  `<10% MINOR`, `10%-25% MODERATE`, `>25% MAJOR`.
- Novas consultas `/patches/:patch/impacts` e
  `/patches/:patch/champions/:championId` com `theoreticalImpact`.
- Resumo do patch, pool pessoal e detalhe secundário do Champion Select
  apresentam o contexto em uma chamada própria, fora do motor.
- Validação real da revisão 1 do patch 26.14: 10 campeões alterados, três com
  sinais seguros, 18 unidades indisponíveis; duas respostas consecutivas
  foram byte a byte idênticas.
- Bateria final: 690 testes TypeScript, 1 Python, typecheck, lint, build e API
  Docker. Nenhum `patchPowerScore`; score, ranking, pesos, pool, risco,
  matchup, snapshots e `META_STRENGTH` permanecem inalterados.
