---
status: PENDENTE
solicitado_em: 2026-07-28 18:22
implementado_em:
---

# Avaliação longitudinal e observabilidade do motor

## Pedido original

> Executar somente a Etapa 23: criar uma camada longitudinal, descritiva e
> auditável sobre sessões de draft vinculadas com segurança ao Match-V5,
> preservando o snapshot vigente no lock-in, a escolha, o ranking, score,
> cobertura, risco, versões dos algoritmos, contexto da partida e a
> disponibilidade do relatório comparativo da Etapa 22.
>
> Os agregados devem permitir filtros e segmentação por jogador, período,
> posição, patch, fila, campeão, grupo da recomendação e versões dos motores,
> mantendo numerador, denominador, tamanho da amostra e indisponibilidades
> explícitos.
>
> Resultados devem permanecer fatos observados. Não criar taxa de acerto,
> causalidade, contrafactuais, calibração, comparação injustificada entre
> versões, preenchimento retroativo de métricas, ajuste de pesos, aprendizado
> automático ou qualquer alteração no motor.
>
> Disponibilizar consultas autenticadas de observabilidade geral, por versão
> e por posição, protegidas por conta, e criar uma seção compacta “Histórico
> do motor” no desktop.

## Notas de implementação

- Contrato puro `recommendation-observability/1.0.0` com uma observação por
  sessão vinculada, filtros determinísticos, numeradores, denominadores,
  amostras e indisponibilidades independentes.
- A API resolve somente o snapshot vigente no `lockedInAt`; snapshots
  substituídos ou posteriores não entram. Escolha `NOT_IN_SNAPSHOT` não
  recebe score, rank, cobertura ou risco retroativos.
- Agregados são calculados sob demanda sobre os registros imutáveis. Nenhuma
  tabela, cache longitudinal ou fonte histórica concorrente foi criada.
- Faixas de score, cobertura e risco usam
  `recommendation-observability-bands/1.0.0` apenas para leitura.
- Versões de recomendação, estratégia, risco e pós-game preservam amostra,
  período, patches, posições, grupos, pool e disponibilidade. Comparações
  sem sobreposição ou amostra suficiente ficam indisponíveis.
- Rotas autenticadas geral, por versões e por posição aceitam somente
  filtros e isolam o `puuid` pela conta do usuário.
- A tela “Histórico do motor” apresenta escolhas, ranking, resultados
  observados, faixas, posições, correspondências, versões e limitações sem
  placar de acertos.
- Testes novos no core, repositório/API, cliente e componente cobrem
  snapshot vigente, escolha fora do snapshot, ausência versus zero,
  filtros, deduplicação, divergência de posição, versões incompatíveis,
  isolamento por conta e linguagem não causal.
- Validados 731 testes dos quatro projetos TypeScript, mais os dois testes
  do script raiz; typecheck, lint e build de produção aprovados.
- A navegação e o estado sem conta vinculada foram verificados no renderer
  local, sem erros de console. O estado preenchido foi validado pelo teste
  de componente porque o modo local não possui conta Riot vinculada.
