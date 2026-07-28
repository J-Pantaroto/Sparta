---
status: EM_ANDAMENTO
solicitado_em: 2026-07-28 16:09
implementado_em:
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

Em andamento.
