---
status: EM_ANDAMENTO
solicitado_em: 2026-07-28 17:43
implementado_em:
---

# Pós-game comparativo entre draft, escolha e partida real

## Pedido original

> Executar somente a Etapa 22: criar um relatório pós-game comparativo, rastreável,
> descritivo e educativo entre a `DraftSession` vinculada, o
> `RecommendationSnapshot` histórico, a escolha realizada e a partida Match-V5.
>
> O relatório deve separar estritamente o que era conhecido antes da partida do que
> foi observado depois, preservar ranking, score, cobertura, grupo e sinais do
> snapshot sem recalcular o motor, e apresentar somente correspondências verificáveis
> sem causalidade, julgamento, contrafactual, taxa de acerto ou aprendizado.
>
> Escolhas fora do snapshot devem ser `NOT_IN_SNAPSHOT`, sem score retroativo.
> Ausência de snapshot, timeline, posição, adversário, loadout ou participação em
> objetivos deve permanecer explícita e independente; zero real não pode virar
> ausência. Divergência de posição reduz comparabilidade e não autoriza reutilizar
> matchup, experiência ou loadout de outra posição.
>
> Persistir revisões idempotentes e reproduzíveis, com versões de algoritmo, IDs dos
> sinais do snapshot, cobertura, motivos de indisponibilidade e hash canônico dos
> inputs. Expor consultas por sessão e por partida, protegidas por conta, e não aceitar
> métricas ou conclusões prontas do desktop.
>
> Evoluir o pós-game com a seção “Draft versus partida”, incluindo escolha, posição no
> ranking original, contexto do draft, fatos observados, correspondências e
> limitações, além do aviso de que correspondência não significa causalidade e um
> resultado isolado não valida nem invalida a recomendação.

## Notas de implementação

- Contrato puro `draft-postgame-comparison/1.0.0`, com separação explícita
  entre evidência anterior e fatos posteriores.
- Snapshot histórico é lido sem recalcular o motor; escolha fora dele não
  recebe score, posição ou grupo retroativos.
- Comparações de posição, risco/timeline, matchup confirmado, loadout
  anterior ao snapshot e patch preservam proveniência e não causalidade.
- `DraftPostGameComparisonRevision` mantém revisões imutáveis, hash canônico,
  versões, IDs de sinais, cobertura e indisponibilidades, vinculando o
  domínio existente de `PostgameReport` quando disponível.
- APIs por sessão e partida são protegidas por conta; o endpoint de geração
  rejeita métricas e conclusões enviadas pelo cliente.
- A seção “Draft versus partida” foi adicionada sem redesenhar o pós-game e
  continua disponível quando a timeline impede a análise geral.
- Validados 718 testes TypeScript, typecheck dos quatro projetos, lint,
  builds de produção, Prisma validate/generate e navegação local sem erros de
  console. A seção preenchida foi validada por teste de componente; o
  navegador local ficou no estado sem conta Riot vinculada.
