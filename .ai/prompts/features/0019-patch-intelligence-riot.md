---
status: IMPLEMENTADA
solicitado_em: 2026-07-28 16:09
implementado_em: 2026-07-28 16:35
---

# Patch Intelligence com notas oficiais da Riot

## Pedido original

> Execute somente a Etapa 19: importe, estruture, persista e apresente notas oficiais de patch
> da Riot de forma rastreável e auditável. Preserve patch, classificação oficial, entidade,
> componente, resumo e detalhes oficiais, valores anteriores e novos explicitamente publicados,
> URL oficial, locale, datas, versão do parser, proveniência e disponibilidade.
>
> O módulo deve aceitar somente páginas oficiais allowlisted, reutilizar timeout, retry e cache da
> Etapa 9, ter parser isolado, determinístico e versionado, associação segura ao catálogo,
> importação idempotente por `patch + locale + fonte`, hash canônico e histórico de revisões.
> Exponha comandos controlados `patches:import`/`patches:check`, consultas `/patches`,
> `/patches/current`, `/patches/:patch` e `/patches/:patch/champions/:championId`, além de resumo
> na interface e indicadores secundários no Champion Select.
>
> Mudança oficial permanece separada de impacto teórico e de impacto observado no meta. Não
> alterar `META_STRENGTH`, ranking, score, pesos, pool, risco de execução, matchup global ou
> elegibilidade global; não usar patch como motivo de recomendação; não avançar para integração
> entre patch, meta e ranking.

## Notas de implementação

Implementada no commit funcional `013878a`.

- Contrato `patch-intelligence/1.0.0`, parser
  `riot-patch-notes-parser/1.0.0`, allowlist oficial, timeout/retry e cache
  `FRESH`/`STALE` da Etapa 9.
- Hash canônico sem horário de coleta, whitespace, atributos visuais ou IDs
  do site; identidade por patch, locale e fonte; revisões imutáveis e
  tentativas de importação separadas.
- Classificação conservadora baseada em evidência editorial, valores
  estruturados somente quando explícitos e associação genérica/exata ao
  catálogo, sem aproximações.
- Comandos `patches:check`/`patches:import`, quatro consultas `/patches`,
  resumo e indicadores secundários no Champion Select.
- Migration `20260728163000_patch_intelligence` aplicada. Patch oficial
  26.14 importado com 21 mudanças, 10 campeões resolvidos, três itens
  preservados sem catálogo e revisão 1; segunda importação retornou
  `UNCHANGED`.
- Testes novos cobrem classificação, mudança mista, bugfix, valor ausente,
  hash, allowlist, resolução ambígua, idempotência, revisão, falha de rede,
  parser incompatível, stale, estados da API e interface. Bateria final:
  675 testes TypeScript, 1 Python, typecheck, lint e builds.
- Patch Intelligence não entra no input do motor de recomendação e não
  altera `META_STRENGTH`, ranking, score, pesos, pool, risco, matchup ou
  elegibilidade global.
