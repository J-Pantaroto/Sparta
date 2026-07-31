---
status: IMPLEMENTADA
implementado_em: 2026-07-31 09:55
solicitado_em: 2026-07-31 09:10
---

# Laboratório de calibração: persistência, API e interface (Etapa 25b)

## Pedido original

> # ETAPA 25b — Persistência, API e interface do laboratório de calibração
>
> Tornar o laboratório da Etapa 25a utilizável, sem alterar o motor operacional: persistência de
> configurações candidatas (com revisões auditáveis), persistência imutável dos experimentos,
> execução offline sobre snapshots históricos, API autenticada, interface técnica, aprovação ou
> rejeição manual e validação real com os snapshots existentes.
>
> `APPROVED_FOR_FUTURE_RELEASE` significa apenas configuração revisada, experimento concluído e
> aprovação humana registrada. Não significa configuração ativa, deploy, alteração de pesos nem
> mudança de versão operacional. A ativação será uma etapa separada.
>
> Não implementar agora: captura prospectiva dos inputs de replay.

## Auditoria (feita antes da implementação)

### 1. O domínio da 25a já entrega tudo que a execução precisa

`packages/core/src/calibration/` expõe `validateCalibrationCandidate`, `replaySnapshotCase`,
`summarizeCalibrationExperiment`, `canonicalCandidateString` e `canonicalExperimentInputString`.
A 25b **não recalcula nada**: orquestra, persiste e apresenta.

O hash ficou deliberadamente fora do core (que também roda no renderer, sem `node:crypto`) — a
API é quem aplica SHA-256 sobre a string canônica, mesmo padrão de `hashCanonicalInput` da
Etapa 16.

### 2. Isolamento por conta já tem padrão estabelecido

`resolveAccount` (`modules/reviews/routes.ts:97`) resolve `RiotAccount` a partir do usuário
autenticado, e todo acesso do repositório filtra por `riotAccountId`. A 25b reusa exatamente
isso — nenhuma rota aceita `playerId` vindo do cliente.

### 3. Fonte dos snapshots

`RecommendationSnapshot` pendura em `DraftSession`, que tem `riotAccountId`. Snapshots
substituídos carregam `supersededAt`. O executor usa somente os **não substituídos**: são a
análise que valia quando a sessão terminou, e incluir os ticks intermediários contaria a mesma
decisão várias vezes.

### 4. Concorrência

Não existe fila (Redis provisionado, sem worker). A execução é síncrona na rota, e a exclusão
mútua vem de um `updateMany` condicional (`PENDING → RUNNING`), que é atômico no Postgres: duas
chamadas simultâneas resultam em uma reivindicação e uma recusa, sem lock aplicativo.

## Decisões

- **Revisão em vez de edição**: alterar peso, threshold ou métrica desligada cria uma linha nova
  com `revision + 1` na mesma `lineageId`; a anterior recebe `supersededAt` e continua legível.
  `configHash` é o que define "alteração funcional" — renomear não cria revisão.
- **Experimento identificado por `inputHash`**: `@@unique([riotAccountId, inputHash])`. Repetir o
  mesmo experimento devolve o existente em vez de criar outro; mudar filtro ou peso muda o hash.
- **Imutabilidade**: `COMPLETED` nunca é reescrito. Falha grava `FAILED` sem resultado, e os casos
  parciais são removidos na mesma transação — não existe resultado parcial consultável.
- **Aprovação é documental**: grava quem, quando, qual experimento e observação. Nenhuma rota
  escreve peso operacional; o motor não lê nenhuma dessas tabelas.

## Fora do escopo

Captura prospectiva (`ReplayInputBundle`), ativação de configuração, fila real, otimizador
automático e qualquer alteração do motor.

## Resultado

- Migration aplicada ao Postgres real (`prisma migrate deploy` dentro do container da API):
  as três tabelas existem no banco local.
- 18 testes novos de rota cobrindo isolamento por conta (401/422/404), rejeição estruturada de
  configuração não reproduzível, validação sem persistir, revisão, `409` de execução concorrente,
  reaproveitamento por `inputHash` (`200` + `reused`), paginação com filtro por status de replay,
  e a aprovação declarando `activation: NOT_ACTIVATED`.
- Suíte completa: **867 testes**. `typecheck`, `lint`, `test` e `build` completos.

## Não validado nesta etapa

A execução ponta a ponta contra a API em execução com a conta real (criar configuração, rodar o
experimento sobre os 2 snapshots do banco, abrir os casos na tela do Electron) **não foi feita**:
exigiria reconstruir a imagem Docker da API com o código novo. O caminho de execução em si já foi
medido na Etapa 25a contra os mesmos snapshots reais (11 de 11 reconstruídos com diferença zero);
o que falta confirmar é a camada HTTP e a tela contra dado real.
