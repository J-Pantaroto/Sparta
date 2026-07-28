# Impacto teórico das mudanças do patch

Fonte de verdade: `docs/theoretical-patch-impact.md`.

## Contrato operacional

- Algoritmo puro e determinístico `theoretical-patch-impact/1.0.0`.
- Usa somente a revisão estruturada da Etapa 19 e capacidades rastreáveis da
  mesma habilidade na Etapa 14.
- Mudança oficial é `OFFICIAL`; interpretação é `DERIVED`; força observada
  continua `META_STRENGTH: UNAVAILABLE`.
- Direção nasce da relação entre escalar e dimensão, nunca de `changeType`.
- Compensações permanecem separadas ou `MIXED`; bugfix permanece `UNKNOWN`.
- Magnitude usa apenas variação relativa de escalares comparáveis:
  `<10% MINOR`, `10%-25% MODERATE`, `>25% MAJOR`.
- Cobertura é a fração de unidades oficiais com ao menos um sinal seguro.
- Ausência de capacidade, séries, texto e ambiguidade permanecem indisponíveis.
- O resultado carrega patch, revisão, hash, IDs, evidência e versões.

API:

- `GET /patches/:patch/impacts`;
- `GET /patches/:patch/champions/:championId` inclui `theoreticalImpact`.

Resumo do patch, pool pessoal e detalhe secundário do Champion Select exibem
o contexto sem inseri-lo em `POST /drafts/recommendations`. Score, pesos,
ranking, pool, risco, matchup, snapshots e `META_STRENGTH` permanecem
inalterados.
