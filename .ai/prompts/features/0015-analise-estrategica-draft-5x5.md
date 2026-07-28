---
status: IMPLEMENTADA
solicitado_em: 2026-07-28 01:14
implementado_em: 2026-07-28 01:37
---

# Análise estratégica do draft 5×5

## Pedido original

> Criar um único motor estratégico 5×5, puro, determinístico e reutilizado
> pelo ranking, pelos detalhes dos candidatos e pelo pré-game. A análise deve
> considerar candidato, aliados e inimigos conhecidos, adversário direto,
> capacidades rastreáveis, necessidades aliadas, ameaças, respostas e picks
> desconhecidos.
>
> Alterar somente `TEAM_COMPOSITION` e `ENEMY_RESPONSE`, sem mudar pesos,
> desempenho pessoal, matchup, meta, dificuldade, risco, pool ou quantidade
> de recomendações. Usar `ChampionCapabilityProfile` como fonte principal e
> `ChampionTag` somente como fallback genérico explícito, sem contagem dupla.
>
> Preservar evidência, proveniência, disponibilidade e cobertura em cada
> sinal. Ausência de evidência não significa ausência da capacidade. Draft
> incompleto deve gerar análise parcial e reduzir cobertura, nunca introduzir
> score neutro artificial.
>
> Implementar relações gerais, documentadas e versionadas entre ameaças e
> respostas por capacidade, nunca regras por campeão. Ranking principal,
> alternativas e pré-game devem usar exatamente o mesmo cálculo.
>
> A interface deve mostrar resumo estratégico nos cards e, nos detalhes,
> capacidades, aliados, inimigos, ameaças, respostas, lacunas, limitações e
> cobertura, mantendo experiência, dificuldade e risco visualmente separados.

## Restrições preservadas

- Não integrar fonte nova nem modelar tipo de dano, resistências, anti-heal,
  anti-shield, imunidades, builds, runas, meta ou counters específicos.
- Não tratar bans como membros, inferir picks ou completar campeões
  desconhecidos.
- Não persistir sessões de draft.
- Não avançar para a etapa seguinte.

## Casos críticos

- O candidato entra exatamente uma vez e nunca é tratado como aliado prévio.
- Pick desconhecido reduz cobertura, não score.
- Capacidade indisponível não vira ausência.
- Preencher lacuna é diferente de reforçar recurso existente.
- Relações de resposta admitem parcialidade e não afirmam counter completo.
- Alterar aliado/inimigo afeta somente sinais pertinentes.
- Ranking e pré-game produzem os mesmos sinais estratégicos.

## Notas de implementação

Implementada no commit `24802ce`. O motor puro `analyzeDraftStrategy`
centraliza ranking, detalhes e pré-game, separa candidato, aliados, inimigos e
adversário direto, e produz perfis, contribuições, lacunas, ameaças, respostas,
cobertura, disponibilidade, evidência e proveniência versionadas. Somente
`TEAM_COMPOSITION` e `ENEMY_COMPOSITION_ANSWER` passaram a consumir os novos
sinais; os pesos e os demais conceitos do ranking foram preservados.

`ChampionCapabilityProfile` é a fonte principal. `ChampionTag` atua apenas como
fallback explícito para dimensões suportadas, sem contagem dupla; desconhecido
e indisponível nunca viram ausência nem score neutro. Cards e detalhes exibem o
resumo estratégico, com risco de execução e experiência mantidos separados.

Validação concluída com 565 testes TypeScript e 1 teste Python, typecheck, lint
e builds de core, Riot, API e desktop. A API real em Docker confirmou análise
parcial rastreável e igualdade exata entre os sinais do ranking e do pré-game.
