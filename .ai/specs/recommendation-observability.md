# Avaliação longitudinal e observabilidade do motor

Fonte de verdade: `docs/recommendation-observability.md`.

## Contrato operacional

- Agregação pura `recommendation-observability/1.0.0`, calculada sob demanda
  sobre históricos imutáveis; nenhuma nova tabela ou fonte concorrente.
- Uma observação por `DraftSession` vinculada com segurança ao Match-V5.
- Usa somente o snapshot vigente no `lockedInAt`; snapshots substituídos ou
  posteriores ao lock-in não entram.
- `NOT_IN_SNAPSHOT` não recebe rank, score, cobertura ou risco retroativos.
- Zero real permanece disponível e cada dimensão ausente é contabilizada
  sem eliminar a observação.
- Contagens sempre preservam numerador, denominador e amostra.
- Faixas versionadas são somente agrupamentos de leitura, sem calibração ou
  probabilidade.
- Versões de recomendação, estratégia, risco e pós-game permanecem separadas.
  Contexto ou amostra insuficiente torna a comparação de versões
  indisponível.
- Vitória e derrota são fatos observados; não existe taxa de acerto,
  causalidade, contrafactual, ajuste de pesos ou aprendizado.

API autenticada:

- `GET /players/:playerId/recommendation-observability`;
- `GET /players/:playerId/recommendation-observability/versions`;
- `GET /players/:playerId/recommendation-observability/roles/:role`.

Filtros de período, patch, fila, posição, campeão, grupo e versão são
aplicados antes dos numeradores e denominadores. O desktop apresenta a tela
compacta “Histórico do motor”.
