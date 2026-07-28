---
status: IMPLEMENTADA
solicitado_em: 2026-07-28 10:05
implementado_em: 2026-07-28 13:10
---

# Persistência de drafts e recomendações

## Pedido original

> # ETAPA 16 — Persistência de drafts e recomendações
>
> ## Contexto
>
> O Sparta produz, durante o draft: pool pessoal por posição; até 5 recomendações principais e 3
> alternativas; métricas independentes por candidato; cobertura e proveniência; dificuldade e
> risco de execução; análise estratégica 5×5; pré-game derivado do mesmo motor. Essas informações
> ainda são temporárias — depois que a sessão termina não é possível reconstruir o estado do
> draft, quais campeões foram recomendados, por quê, qual foi escolhido, nem quais versões de
> algoritmo sustentaram a análise.
>
> ## Objetivo
>
> Persistir sessões reais de draft e snapshots imutáveis das recomendações, preparando a
> comparação futura entre o que o Sparta recomendou, o que o jogador escolheu e o que aconteceu na
> partida. A persistência não pode alterar o ranking nem bloquear o Champion Select.
>
> ## Sessão de draft
>
> Persistir `id`, `playerId`, `source` (`LCU`/`USER`), `status`
> (`ACTIVE`/`LOCKED_IN`/`IN_GAME`/`COMPLETED`/`ABANDONED`), `role`, `roleSource`, `queueId?`,
> `gameVersion?`, `patch?`, `selectedChampionId?`, `startedAt`, `updatedAt`, `lockedInAt?`,
> `completedAt?`, `externalSessionId?`, `linkedMatchId?`. A sessão preserva o estado conhecido do
> draft: aliados, inimigos, bans aliados, bans inimigos, adversário direto quando identificado,
> posições conhecidas e quantidade de picks ainda desconhecidos. Não persistir o payload bruto
> completo do LCU como substituto do contrato.
>
> ## Origem e identidade
>
> Sessões do LCU e manuais devem permanecer distinguíveis; não apresentar sessão manual como
> observada. Quando o LCU fornecer identificador estável, usá-lo para evitar duplicações. Sem
> identificador estável: derivar chave técnica apenas com elementos seguros e documentados; não
> usar chave que possa unir duas sessões diferentes; não depender de campeão e horário aproximado.
> Uma nova entrada no Champion Select não pode reutilizar silenciosamente a sessão anterior.
>
> ## Ciclo de vida
>
> Transições explícitas e testáveis: entrada cria ou recupera a sessão ativa correta; mudanças
> reais atualizam o estado; confirmação registra `LOCKED_IN`; início da partida pode registrar
> `IN_GAME`; vínculo confirmado com Match-V5 registra `COMPLETED`; dodge/abandono registra
> `ABANDONED`; perda transitória de conexão não cria outra sessão; sessão encerrada não volta para
> `ACTIVE`. Não inventar conclusão quando o estado real não puder ser determinado.
>
> ## Snapshot de entrada
>
> Registrar o input canônico: posição, origem da posição, pool considerado, aliados, inimigos,
> bans, adversário direto, campeão selecionado quando aplicável, versões dos catálogos, versões
> dos algoritmos, instante da análise. Gerar hash determinístico que **não** dependa de ordem
> acidental de arrays, timestamps de geração, IDs internos irrelevantes nem campos de interface.
>
> ## Snapshot de recomendações
>
> Persistir `id`, `draftSessionId`, `inputHash`, `algorithmVersions`, `dataCoverage`, `createdAt`,
> `supersededAt?` e as recomendações. Cada candidato preserva `championId`, ranking, grupo
> `PRIMARY`/`ALTERNATIVE`, score final, cobertura, origem no pool, amostra pessoal, métricas
> estruturadas, pesos efetivamente utilizados, motivos, sinais indisponíveis, dificuldade, risco de
> execução, análise estratégica e proveniência relevante. Não persistir apenas o score agregado.
>
> ## Imutabilidade
>
> Snapshots históricos são imutáveis. Draft mudou: cria novo snapshot, marca o anterior como
> substituído se necessário, não reescreve a análise anterior. Input e versões idênticos: não cria
> outro snapshot. Mudança apenas de `generatedAt` não pode produzir duplicação.
>
> ## Frequência de gravação
>
> Evitar gravação por tick, snapshots duplicados, escrita sem mudança relevante e recomputação por
> ordenação diferente dos mesmos dados. Persistir novo snapshot só quando mudar posição, campeão
> do jogador, aliado, inimigo, ban relevante, adversário direto, pool habilitado, ou versão de
> algoritmo/catálogo.
>
> ## Campeão escolhido
>
> Registrar o campeão escolhido na sessão; identificar se estava entre as recomendações; registrar
> sua posição no ranking daquele snapshot quando existir; não classificar escolha fora do ranking
> como erro; não gerar julgamento estratégico. Escolha anterior a um snapshot válido: preservar
> apenas o fato conhecido.
>
> ## Vínculo com Match-V5
>
> Usar identificadores confiáveis como `gameId`. Não relacionar por campeão igual, horário
> aproximado, vitória/derrota ou posição isolada. Sem identificador suficiente: manter sem vínculo,
> permitir reconciliação futura, não adivinhar. Não fazer backfill fictício de drafts antigos a
> partir das partidas armazenadas.
>
> ## Falhas de persistência
>
> Não podem derrubar a análise em tempo real: manter recomendações e pré-game utilizáveis,
> registrar erro sanitizado, informar discretamente que o histórico não pôde ser salvo, não repetir
> escritas indefinidamente sem política, não expor stack trace. Não manter dados parcialmente
> persistidos sem transação quando a consistência exigir gravação conjunta.
>
> ## Segurança e privacidade
>
> Não persistir Riot API Key, headers de autenticação, senha do lockfile, URL do LCU com
> credenciais, payload bruto integral do LCU, tokens, stack traces nem dados pessoais
> desnecessários. PUUID e identificadores da Riot só onde o modelo realmente precisar.
>
> ## API
>
> Consultas: sessão ativa, histórico, detalhe, snapshots da sessão, recomendação selecionada,
> estado do vínculo. Criação/atualização automáticas pela orquestração do produto, não por
> endpoints públicos que aceitem snapshots arbitrários sem validação. Proteger acesso por jogador.
>
> ## Interface
>
> Mínima, para validar a persistência: indicar quando a sessão foi salva; histórico recente; abrir
> detalhe; mostrar recomendações daquele momento; destacar o campeão escolhido; informar se a
> partida foi vinculada. Linguagem factual (`Recomendado em 2º lugar`, `Escolha fora das
> recomendações registradas`, `Partida ainda não vinculada`, `Histórico não pôde ser salvo`). Não
> implementar avaliação de acerto ou erro.
>
> ## Compatibilidade
>
> Sessões antigas ou registros incompletos continuam legíveis. Campos ausentes não recebem score
> neutro, cobertura fictícia, algoritmo atual nem proveniência inventada. Snapshots antigos
> continuam associados às versões reais com que foram gerados; não recalcular automaticamente.
>
> ## Restrições
>
> Não: alterar ranking, pesos, thresholds ou fórmulas; recalcular recomendações antigas; criar
> drafts retroativos a partir de Match-V5; avaliar se a escolha foi correta; implementar
> aprendizado automático; ajustar pesos por resultado; implementar meta ou matchup global;
> implementar build ou runas; reescrever o pré-game; persistir credenciais ou payload bruto do LCU;
> criar snapshots duplicados por tick; misturar esta etapa com Dependabot.
>
> ## Casos críticos
>
> Mesmo input/versões não criam snapshot; alteração relevante cria; ordem diferente dos mesmos
> campeões gera o mesmo hash; candidato entra uma vez; principais e alternativas preservam ranking
> e grupo; métricas indisponíveis permanecem indisponíveis; pesos efetivos e cobertura preservados;
> snapshot anterior não reescrito; nova sessão não herda estado antigo; sessão manual não vira LCU;
> dodge termina como abandono sem partida fictícia; falha de persistência não derruba o Champion
> Select; vínculo só com identificador confiável; sessão sem vínculo permanece honesta; escolha
> fora do ranking registrada sem julgamento; versão nova do algoritmo cria snapshot distinto; dados
> de outro jogador inacessíveis; nenhum segredo no banco ou nos logs.

## Auditoria (feita antes de implementar)

1. **`DraftSession` e `PickRecommendation` existem no schema e são código morto.** Busca por
   `draftSession`/`pickRecommendation` em `apps/` e `packages/` (fora de testes e `dist`)
   retornou **zero** ocorrências. O `CLAUDE.md` já registrava as duas como "sem nenhum código que
   leia/escreva". As formas atuais são ambíguas para esta etapa:
   - `DraftSession` tem `draftStateJson` (blob sem contrato), `playerRole String`, `pickOrder`,
     e **nenhum** campo de ciclo de vida, origem, origem da posição, vínculo com partida ou
     `updatedAt`.
   - `PickRecommendation` tem `totalScore`/`confidence`/`category` + `snapshotJson`, mas **não
     tem ranking, grupo, cobertura, pesos efetivos, origem no pool nem `inputHash`**, e pendura
     as recomendações direto na sessão — não existe o conceito de execução (snapshot) entre as
     duas, que é justamente o que precisa ser imutável.
   Conclusão: as duas são substituídas. Estão vazias, então não há dado a preservar.
2. **`PostgameReport.draftSessionId` é um `String?` solto**, sem relação declarada no Prisma —
   nada quebra ao redesenhar a sessão.
3. **Bans não têm lado no contrato atual.** `DraftState.bannedChampionIds` é uma lista plana, e
   `deriveDraftSnapshot` (Fase 16) junta os bans dos dois times de propósito ("um ban derruba o
   campeão pra todo mundo"). **Separar bans aliados de inimigos exigiria inventar o lado** —
   fica registrado como limitação, com os bans preservados sem atribuição de time.
4. **O LCU não expõe identificador estável de sessão** no cliente atual: `read-only-client.ts`
   não lê `gameId` nem `sessionId` do champ-select. Derivar identidade de campeão + horário é
   explicitamente proibido, então a chave técnica precisa de outra base — ver notas.
5. **A rota `POST /drafts/recommendations`** é a única execução real do motor; ela já resolve
   pool, tags, capacidades, matchups e chama `recommendFromPersonalPool`. É o ponto natural de
   orquestração da persistência, e é autenticada.
6. **O contrato de saída já carrega quase tudo que precisa ser persistido**:
   `RankedPoolRecommendation` tem `rank`, `poolSource`, `poolProvenance`, `personalGames`,
   `dataCoverage`, `metrics`, `metricDetails`, `limitations`, `strategicAnalysis`. O que **não**
   sai hoje são os **pesos efetivos** (`normalizedWeights` é local a `recommendFromPersonalPool`)
   — precisam ser expostos sem alterar cálculo nenhum.

## Notas de implementação

### Decisões

- **Substituir, não estender.** As duas tabelas antigas eram código morto e ambíguas para o que
  esta etapa exige (sem ciclo de vida, sem `inputHash`, sem execução imutável). Vazias no banco
  real, então não houve migração de dados.
- **Identidade sem adivinhação.** Como o LCU não expõe id estável de sessão, a chave é gerada
  pelo desktop **ao entrar** no champion select (`crypto.randomUUID`) e descartada ao sair. Não
  deriva de campeão nem de horário — as duas coisas que o pedido proíbe — e uma entrada nova
  jamais reaproveita a sessão anterior. `@@unique([riotAccountId, externalSessionId])`.
- **Hash na API, string canônica no core.** `packages/core` roda no renderer e não pode depender
  de `node:crypto`; ele produz a serialização estável e a API calcula o SHA-256.
- **`generatedAt` fora do hash.** Incluí-lo faria cada tick gerar hash novo e destruiria o
  mecanismo de dedup.
- **Pesos efetivos expostos, cálculo intacto.** `normalizedWeights` já existia dentro de
  `recommendFromPersonalPool`; só passou a sair no contrato. Nenhum peso, threshold ou fórmula
  mudou.
- **Bans sem lado.** O contrato atual não distingue ban aliado de inimigo, e a derivação do LCU
  junta os dois de propósito. Preservados sem atribuição, com `banSideKnown: false` — inventar o
  lado seria criar dado.
- **Falha isolada.** `persistRecommendationSnapshot` não lança: devolve `FAILED`, e a
  orquestração inteira está em try/catch. A recomendação sai completa de qualquer jeito.

### Testes

62 novos, 626 no total: 29 em `recommendation-snapshot.test.ts` (estabilidade do hash sob ordem
diferente, dedup de candidato, o que muda e o que não muda, ranking/grupo/pesos preservados,
métrica indisponível continua indisponível, cópia defensiva), 19 em `draft-session.test.ts`
(transições, sessão encerrada não reabre, estado conhecido sem inventar picks, bans sem lado,
comparação da escolha sem julgamento, vínculo só com identificador) e 14 em `routes.test.ts`
(NOT_TRACKED sem sessão, SAVED/UNCHANGED, falha e exceção não derrubando a análise nem vazando
detalhe, sessão manual como USER, acesso sempre filtrado por conta, 404 pra sessão de outro,
COMPLETED sem matchId recusado, transição inválida 409).

### Validação real (API + Postgres, conta Zekerus#117)

| Cenário | Resultado |
|---|---|
| 1ª chamada com sessão | `SAVED` (snapshot criado) |
| 2ª chamada, mesmo input | `UNCHANGED` — **zero escrita** |
| 3ª chamada, inimigo revelado | `SAVED` (snapshot novo) |
| Estado no banco | 1 sessão, 2 snapshots (1 com `supersededAt`), 11 recomendações |
| Conteúdo persistido | rank/grupo/`totalScore`/`poolSource` corretos; `effectiveWeights` completo |
| Lock-in fora do ranking | `NOT_IN_SNAPSHOT`, sem julgamento |
| Vínculo | `UNLINKED` com motivo |
| `COMPLETED` sem `matchId` | `422` `MATCH_LINK_UNAVAILABLE` |
| Abandonar e tentar reabrir | `200` e depois `409` — sessão encerrada não volta |

### Limite da validação

A tela "Histórico de drafts" foi validada por typecheck, build e pelos caminhos reais da API,
**mas não foi aberta no Electron real nesta etapa**. O comportamento que ela exibe vem inteiro das
rotas já validadas acima.
