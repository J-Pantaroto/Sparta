# Patch Intelligence

Desde a Etapa 20, a evidência factual deste módulo também pode alimentar a
interpretação `DERIVED` e separada de
`.ai/specs/theoretical-patch-impact.md`.

Fonte de verdade: `docs/patch-intelligence.md`.

## Contrato operacional

- Apenas notas oficiais allowlisted da Riot.
- Parser `riot-patch-notes-parser/1.0.0`, conservador e determinístico.
- Hash canônico independente de coleta, whitespace e atributos visuais.
- Identidade `patch + locale + sourceUrl`; revisões imutáveis por hash.
- Cache `FRESH` por uma hora e fallback `STALE` por até sete dias.
- Falha de rede/parser nunca cria release vazio nem apaga evidência anterior.
- Associação ao catálogo somente por normalização genérica exata; colisão e
  ausência permanecem não resolvidas com motivo.

Comandos:

```bash
pnpm --filter @sparta/api patches:check --patch=26.14 --locale=pt_BR
pnpm --filter @sparta/api patches:import --patch=26.14 --locale=pt_BR
```

API:

- `GET /patches`;
- `GET /patches/current`;
- `GET /patches/:patch`;
- `GET /patches/:patch/champions/:championId`.

Patch Intelligence é somente contexto factual. Não altera
`META_STRENGTH`, score, ranking, pesos, pool, risco, matchup ou elegibilidade
global.
