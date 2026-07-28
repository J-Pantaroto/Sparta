---
status: IMPLEMENTADA
solicitado_em: 2026-07-28 15:34
implementado_em: 2026-07-28 15:45
---

# Decisão e contrato da fonte global de meta

## Pedido original

> Pesquisar, em documentação oficial e termos vigentes, opções sustentáveis e
> juridicamente utilizáveis para estatísticas globais de League of Legends.
> Comparar agregação própria pela Riot API, provedores externos licenciados e
> scraping, considerando legalidade, cobertura, granularidade, custo,
> atualização, operação, cache e segurança.
>
> Definir contratos globais independentes de fornecedor para estatísticas por
> campeão e posição, matchups, builds, runas e elegibilidade global. Toda
> métrica deve preservar contexto estatístico, amostra, patch, fila,
> proveniência, validade e versão do adapter.
>
> Criar um `GlobalStatisticsProvider` e uma implementação padrão
> `UnavailableGlobalStatisticsProvider`, sem chamadas externas e sem valores
> neutros. Até uma integração futura explicitamente aprovada,
> `GLOBAL_MATCHUP`, `META_STRENGTH`, builds globais e elegibilidade global
> permanecem `UNAVAILABLE`.
>
> Registrar a decisão em ADR verificável, com matriz comparativa, riscos,
> pontos não confirmados, recomendação concreta, condições para prosseguir e
> plano da próxima etapa. Não integrar fornecedor, coletar em massa, fazer
> scraping, inserir credenciais ou alterar ranking e score. Executar somente a
> Etapa 18.

## Casos críticos

- Provider indisponível nunca produz zero ou 50 e não realiza I/O externo.
- Contratos exigem patch, posição, fila, amostra, coleta e fornecedor.
- Patch, elo, região, fila e filtros não são misturados silenciosamente.
- Matchup e builds pessoais não satisfazem contratos globais.
- Cache preserva a fonte epistemológica original.
- Elegibilidade global permanece `eligible: null`.
- Tipos de fornecedor não entram no domínio e fixtures ficam apenas em testes.
- Ranking, score, cobertura, risco, estratégia e snapshots permanecem
  invariantes.

## Notas de implementação

Implementada no commit `ba042c9`. A pesquisa em documentação oficial da
Riot, GRID, PandaScore e Abios resultou em
`SELF_AGGREGATION_CANDIDATE`: a única candidata compatível com o meta de
partidas ranqueadas é agregação própria sobre APIs oficiais da Riot, mas ela
depende de Production Key, aprovação do uso/retenção, população do piloto,
privacidade, orçamento e plano operacional explicitamente aprovados.

O core ganhou contratos independentes de fornecedor e
`UnavailableGlobalStatisticsProvider` como padrão sem I/O, credencial, cache
ou fixture operacional. Todas as métricas globais permanecem
`UNAVAILABLE`, elegibilidade continua `eligible: null`, e não houve rota,
coleta, migration ou alteração de ranking, score, cobertura, risco,
estratégia e snapshots.

A validação cobriu 652 testes TypeScript e 1 teste Python, além de typecheck,
lint e build completos. Os testes novos verificam ausência de zero/50,
contextos separados, matchup pessoal não global, origem preservada no cache,
ausência de chamadas externas, determinismo e invariância do ranking.
