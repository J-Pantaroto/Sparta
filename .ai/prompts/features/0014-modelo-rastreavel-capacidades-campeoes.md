---
status: EM_ANDAMENTO
solicitado_em: 2026-07-28 00:52
implementado_em:
---

# Modelo rastreável de capacidades dos campeões

## Pedido original

> Criar um contrato estruturado e independente de `ChampionTag` para
> capacidades dos campeões, extraído deterministicamente somente dos dados
> completos oficiais da Data Dragon. Cada capacidade deve preservar
> evidências, regra de extração, proveniência, disponibilidade e cobertura,
> sem transformar ausência textual em capacidade negativa e sem alterar
> ranking, score, recomendações ou pré-game.

## Notas de implementação

- Novo `ChampionCapabilityProfile` com 23 dimensões independentes, evidências
  `PASSIVE`/`SPELL`/`CHAMPION_METADATA`, valor, disponibilidade, proveniência,
  versão e cobertura. Ausência textual permanece `UNAVAILABLE`, sem `false`,
  zero ou nível neutro.
- Extrator determinístico `champion-capability-extraction/1.0.0`, fixado em
  `pt_BR`, usa somente os recursos completos oficiais
  `champion/{championKey}.json`. Preserva frase oficial e regra aplicada;
  filtros conservadores removem menções de imunidade, resistência, negação e
  controle sofrido pelo próprio campeão.
- Hard CC não cria confiabilidade/alvo/área; dash ou blink não cria engage;
  escudo/cura não cria peel; classe/tag não cria frontline ou posição.
  `ChampionTag`, ranking, score, recomendações e pré-game não foram alterados.
- Manifesto revisável `data/seeds/champion-capabilities.json` gerado para
  173 campeões na Data Dragon 16.14.1. Nove dimensões possuem alguma
  informação utilizável e 14 permanecem integralmente indisponíveis.
  Cobertura média 19,15% (4,35%–30,43%), apenas informativa.
- Gerador com concorrência limitada, validação de campeão/habilidade,
  ordenação determinística, timestamp estável e modos
  `champion-capabilities:generate`/`champion-capabilities:check`.
- Consulta técnica
  `GET /catalog/champions/:championId/capabilities`; catálogo antigo ou ID
  ausente retorna indisponibilidade sem afetar rotas anteriores. A persistência
  desta etapa é o manifesto versionado; não há agregado ou migration no banco.
- 16 testes novos no core, cliente Data Dragon, manifesto, repositório e API.
  Bateria final: 555 testes TypeScript, 1 teste Python, typecheck, lint, build
  e check reprocessável aprovados. A imagem real da API retornou o perfil de
  Alistar com IDs/frases oficiais, manteve `ENGAGE`, `PEEL` e
  `CC_RELIABILITY` indisponíveis e respondeu `404/UNAVAILABLE` para ID ausente.

Fora de escopo preservado: análise 5×5, counters, matchup/meta global,
Community Dragon, curadoria campeão por campeão, posições, cards de
recomendação e qualquer mudança de ranking.
