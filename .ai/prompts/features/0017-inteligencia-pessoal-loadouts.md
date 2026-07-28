---
status: EM_ANDAMENTO
solicitado_em: 2026-07-28 14:43
implementado_em:
---

# Inteligência pessoal de builds, runas e feitiços

## Pedido original

> Transformar os dados normalizados da Etapa 10 em inteligência pessoal de
> builds, runas e feitiços por jogador, campeão e posição observada, com
> filtros opcionais de patch, fila, período e recência.
>
> Agregar separadamente inventários finais, páginas de runas e pares de
> feitiços. Cada padrão deve preservar assinatura canônica, amostra, vitórias,
> derrotas, última utilização, patches, filas, disponibilidade, IDs originais,
> resolução por catálogo, limitações, proveniência e versão do algoritmo.
>
> Inventários representam estado final, nunca ordem de compra; slot vazio não
> entra, duplicatas e IDs desconhecidos permanecem. Runas parciais não podem
> virar completas. Posições e modos não podem ser misturados silenciosamente,
> e histórico de patch anterior não pode parecer atual.
>
> Expor consulta autenticada e protegida por jogador e apresentar uma seção
> factual e secundária no detalhe da recomendação e no pré-game. O histórico
> pessoal não pode alterar score, ranking, pool, risco de execução, cobertura,
> motor estratégico ou snapshots de recomendação.
>
> Ausência e parcialidade devem ser estruturadas, a ordenação deve ser
> determinística, e nenhum padrão pode ser tratado como build global, ideal ou
> causalidade sobre vitória. Executar somente a Etapa 17.

## Casos críticos

- Inventários iguais em slots diferentes são agrupados e itens duplicados são
  preservados.
- Item `0` não entra; ID desconhecido continua disponível como observação.
- Páginas de runas diferentes ou incompletas não são agrupadas indevidamente.
- Pares de feitiços preservam a observação e documentam a equivalência usada no
  agregado.
- Posições, patches e filas permanecem auditáveis.
- Uma partida gera amostra 1 sem rótulo de superioridade.
- Ausência produz `UNAVAILABLE`; disponibilidade de uma parte não contamina as
  demais.
- Outro jogador não consegue consultar o histórico pessoal da conta.
- Mesmo input produz o mesmo agregado e ranking/score permanecem invariantes.

## Notas de implementação

Em andamento.
