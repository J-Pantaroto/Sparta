# Persistência de drafts e recomendações

Domínio: `packages/core/src/draft/draft-session.ts` e
`packages/core/src/draft/recommendation-snapshot.ts` (puros).
Persistência: `apps/api/src/modules/drafts/draft-session-repository.ts`.
Migration: `20260728120000_draft_session_persistence`.

## O que esta etapa guarda — e o que ela não faz

Guarda o que estava acontecendo no champion select, o que o Sparta recomendou naquele momento e
qual campeão foi escolhido, para permitir **no futuro** a comparação com a partida real.

**Não avalia se a escolha foi certa ou errada.** Não existe aqui nenhuma nota de acerto, nenhum
ajuste de peso por resultado e nenhum aprendizado automático. Escolha fora do ranking é registrada
como fato (`NOT_IN_SNAPSHOT`), não como erro.

## Substituição dos modelos antigos

`DraftSession` e `PickRecommendation` existiam no schema desde o início e **nunca tiveram uma
linha de código que lesse ou escrevesse nelas** (confirmado por busca no repositório e por
contagem: 0 linhas nas duas). As formas antigas não sustentavam esta etapa — `draftStateJson` era
um blob sem contrato, não havia ciclo de vida, origem, vínculo com partida nem `updatedAt`; e as
recomendações penduravam direto na sessão, sem o conceito de execução imutável entre as duas. Por
isso foram substituídas, não estendidas. Não houve migração de dados porque não havia dado.

## Sessão

| Campo | Observação |
|---|---|
| `source` | `LCU` ou `USER`. **Sessão manual nunca é apresentada como observada.** |
| `status` | `ACTIVE` → `LOCKED_IN`/`IN_GAME` → `COMPLETED`/`ABANDONED` |
| `roleSource` | Como a posição foi obtida; ausência é tratada como `USER`, nunca `LCU` |
| `knownDraftJson` | Contrato estruturado do estado conhecido — **não** é o payload bruto do LCU |
| `externalSessionId` | Chave técnica da sessão no cliente (ver abaixo) |
| `linkedMatchId` | Só preenchido com identificador confiável |

### Identidade

O LCU não expõe identificador estável de sessão de champion select no cliente atual. A chave
técnica é gerada **pelo desktop ao entrar** no champion select e descartada ao sair:

- Não deriva de campeão, posição nem horário — nada que pudesse unir duas sessões diferentes.
- Uma entrada nova gera outra chave, então **nunca reaproveita a sessão anterior**.
- É única por conta (`@@unique([riotAccountId, externalSessionId])`).

Quando o LCU passar a expor um id estável, ele ocupa esse mesmo campo sem mudar o modelo.

### Ciclo de vida

Transições permitidas ficam em `ALLOWED_TRANSITIONS` (`draft-session.ts`). Consequências:

- Sessão encerrada (`COMPLETED`/`ABANDONED`) **nunca volta para `ACTIVE`**; um tick atrasado do
  LCU ou um reenvio depois do dodge não a ressuscita, e o `upsert` devolve a linha intacta.
- `ACTIVE` não pula direto para `COMPLETED`.
- `COMPLETED` exige `linkedMatchId`. Sem identificador, a rota responde `422`
  `MATCH_LINK_UNAVAILABLE` e a sessão fica onde estava — concluir sem prova seria inventar o
  desfecho.

## Snapshot

Cada execução persistida guarda o **input canônico**, o hash dele, as versões de algoritmo, a
cobertura e todos os candidatos.

### Hash do input canônico

O hash é SHA-256 da serialização canônica (`canonicalSnapshotInputString`). Entram: posição,
origem da posição, pool habilitado, aliados, inimigos, bans, adversário direto, campeão
selecionado, versões de catálogo e de algoritmo.

**Ficam de fora de propósito**: ordem de arrays (tudo é ordenado e desduplicado), instante da
análise, ids internos e campos de interface. Sem isso o poll de 2,5 s do LCU produziria um hash
novo a cada tick e o mecanismo perderia a função.

O hash mora na API porque `packages/core` também roda no renderer e não pode depender de
`node:crypto`; o core produz a string canônica.

### Imutabilidade e frequência

- Input idêntico ao último: **nenhuma escrita**, `UNCHANGED`.
- Input diferente: cria snapshot novo e marca o anterior com `supersededAt` — o conteúdo do
  anterior nunca é reescrito.
- `@@unique([draftSessionId, inputHash])` é a garantia final contra duplicata, além da checagem
  em memória.
- Snapshot e candidatos entram na **mesma transação**: nunca fica um snapshot sem recomendações
  nem dois snapshots "atuais".

### O que cada candidato preserva

`championId`, ranking, grupo (`PRIMARY`/`ALTERNATIVE`), score final, cobertura, origem no pool,
amostra pessoal, métricas estruturadas (indisponível continua indisponível, sem valor), **pesos
efetivos** depois da normalização, categoria, confiança, motivos com código e impacto, alertas,
limitações, proveniência do pool e a análise estratégica daquele instante.

Os pesos efetivos passaram a sair do motor nesta etapa (`RankedPoolRecommendation.effectiveWeights`).
O valor já existia dentro de `recommendFromPersonalPool`, só não era exposto — **nenhum cálculo
mudou**.

## Campeão escolhido

`compareSelectedChampion` devolve um dos três estados, sem julgamento:

| Estado | Significado |
|---|---|
| `RANKED` | Estava no snapshot; guarda posição e grupo |
| `NOT_IN_SNAPSHOT` | Havia snapshot e o campeão não estava nele |
| `NO_SNAPSHOT` | A escolha aconteceu antes de existir snapshot — só o fato é conhecido |

## Vínculo com Match-V5

`decideMatchLink` só aceita um `matchId` explícito. Campeão igual, horário aproximado, resultado e
posição isolada **não** vinculam. Sem identificador a sessão permanece `UNLINKED` com o motivo, e
a reconciliação pode acontecer depois.

**Nenhum draft histórico foi criado a partir das partidas já armazenadas.** O Match-V5 não contém
o estado anterior do draft nem as recomendações produzidas; fabricá-los seria inventar exatamente
o dado que esta etapa existe para guardar.

## Falhas de persistência

A gravação é **efeito colateral** da orquestração: roda depois de a análise estar pronta.
`persistRecommendationSnapshot` não lança — devolve `FAILED`, e a rota devolve
`persistence: { status: "FAILED" }` junto com a recomendação completa. O Champion Select continua
funcionando; a interface diz "Histórico não pôde ser salvo".

Nenhum stack trace, mensagem do banco, host ou porta sai na resposta.

## Segurança

Não são persistidos: Riot API Key, headers de autenticação, senha do lockfile, URL do LCU, payload
bruto do LCU, tokens nem stack traces. A sessão referencia `RiotAccount.id`; o PUUID não é copiado
para as tabelas novas.

Toda leitura filtra por conta (`riotAccountId`) — sessão de outro jogador responde `404`, não o
conteúdo dela.

## API

| Rota | O que faz |
|---|---|
| `POST /drafts/recommendations` | Analisa e, com `session` no payload, persiste como efeito colateral |
| `GET /drafts/sessions/active` | Sessão em andamento da própria conta |
| `GET /drafts/sessions` | Histórico recente |
| `GET /drafts/sessions/:id` | Detalhe + snapshot atual + comparação da escolha + estado do vínculo |
| `GET /drafts/sessions/:id/snapshots` | Todos os snapshots, do mais novo ao mais antigo |
| `POST /drafts/sessions/:id/lock-in` | Registra o campeão confirmado |
| `POST /drafts/sessions/:id/status` | Transição explícita de ciclo de vida |

Não existe endpoint que aceite um snapshot arbitrário: a criação passa sempre pela orquestração,
com o input reconstruído a partir do que o motor de fato usou.

## Limitações conhecidas

- **Bans não têm lado.** `DraftState.bannedChampionIds` é uma lista plana, e a derivação do LCU
  junta os bans dos dois times de propósito. Separar aliados de inimigos exigiria inventar o lado,
  então eles são preservados sem atribuição e o contrato declara `banSideKnown: false`.
- **`queueId`/`gameVersion`** só são gravados quando o cliente os informa; não são deduzidos.
- **A conclusão automática por Match-V5 ainda não existe**: hoje o vínculo depende de alguém
  informar o `matchId`. A reconciliação automática é trabalho de uma etapa futura, e a ausência
  dela deixa a sessão honestamente sem vínculo.
