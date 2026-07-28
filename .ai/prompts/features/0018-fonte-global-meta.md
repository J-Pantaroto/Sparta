---
status: EM_ANDAMENTO
solicitado_em: 2026-07-28 15:34
implementado_em:
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

Em andamento.
