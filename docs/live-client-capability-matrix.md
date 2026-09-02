# Live Client Data — Matriz de Capacidade

**Data:** 2026-08-29

**Estado:** `PROTOTYPE_LOCAL_ONLY` · `NOT_APPROVED_FOR_PUBLIC_LIVE_GUIDANCE`

Este documento existe para separar duas perguntas que são frequentemente confundidas:

1. **O dado está tecnicamente disponível?**
2. **Podemos construir uma funcionalidade com ele?**

A Live Client Data API roda na própria máquina do jogador e devolve, entre outras coisas, o estado
completo dos dez jogadores da partida. Boa parte disso é tecnicamente trivial de consumir — e
mesmo assim **não deve** virar funcionalidade. A existência técnica de um dado nunca substitui a
análise de política.

## Contexto declarado pela própria Riot

### Game Client API ≠ League Client API (LCU) — distinção que importa

`developer.riotgames.com/docs/lol` documenta **duas** superfícies locais, em seções separadas, e
confundi-las leva a conclusões erradas sobre o que é permitido:

| | **League Client API (LCU)** | **Game Client API** (esta etapa) |
| --- | --- | --- |
| Onde roda | Cliente/launcher do League | Cliente **de jogo**, durante a partida |
| Porta | Dinâmica (lockfile) | `2999`, fixa |
| Como a Riot descreve | *"This service is not officially supported for use with third party applications"*, com *"no guarantees of full documentation, service uptime, or change communication for unsupported services"* | *"The Game Client APIs are served over HTTPS by League of Legends game client and are only available locally for native applications."* |
| Disclaimer de "unsupported" | **Sim** | **Não** — a seção não traz nenhum |

**Correção registrada:** uma versão anterior deste documento atribuía o disclaimer de *"not
officially supported"* à Game Client API. Isso estava **errado**. Reconferido na documentação: a
frase pertence à seção **League Client API**, sob *"What is the League Client API?"*; a seção
**Game Client API**, que vem logo depois, apresenta o serviço como API HTTPS local para aplicações
nativas e **não** carrega disclaimer equivalente.

O Sparta usa as duas superfícies, e o disclaimer de unsupported se aplica ao uso **do LCU**
(`packages/riot/src/lcu/`, leitura de gameflow e champion select) — não a esta fundação.

### Por que o produto fala com contrato próprio, então

A justificativa **não** é "a Riot chama de unsupported". É a mesma regra que o projeto já aplica ao
Match-V5 desde a Fase 1 (mappers em `packages/riot/src/mappers/`): o domínio não se acopla ao
formato de payload de terceiro. Aqui isso vale ainda mais porque o schema acompanha o patch do
jogo e pode ganhar campos a qualquer atualização.

Consequências práticas, ambas já aplicadas:

- O produto fala com `LiveGameSnapshot`, não com o JSON da Riot.
- Só validamos os campos que realmente consumimos, tolerando adições — uma mudança aditiva da Riot
  não pode quebrar o app.

### Comunicação exigida

A documentação exige que a Riot saiba quais endpoints locais o produto usa e como:

> "we need to know about it. Either create a new application or leave a note on your existing
> application in the Developer Portal. We need to know which endpoints you're using and how you're
> using them."

Essa comunicação **não foi enviada**. O texto está preparado em
`docs/live-client-data-foundation.md` e o envio é decisão do responsável.

## 1. Endpoints

| Endpoint | Consumido nesta etapa? | Classificação | Justificativa |
| --- | --- | --- | --- |
| `/liveclientdata/gamestats` | **Sim** | `SAFE_FOR_FOUNDATION` | Relógio, modo e mapa. Informação que o jogador já vê na própria tela. Base do ciclo de vida da sessão. |
| `/liveclientdata/activeplayer` | **Sim** | `SAFE_FOR_FOUNDATION` | Dados do **próprio** jogador. Ele já os vê no HUD. Traz também o Riot ID exigido por `/playerscores`. |
| `/liveclientdata/playerscores?riotId=<próprio>` | **Sim** (só o próprio) | `SAFE_FOR_FOUNDATION` | K/D/A, CS e ward score do próprio jogador — visíveis no placar. Chamado exclusivamente com o Riot ID do jogador ativo. |
| `/liveclientdata/eventdata` | **Sim** | `SAFE_FOR_FOUNDATION` | Eventos já ocorridos e anunciados na partida. Nada é inferido; só se registra o que a API devolveu. |
| `/liveclientdata/activeplayerabilities` | Não | `SAFE_FOR_FOUNDATION` (redundante) | Seria seguro, mas `/activeplayer` já devolve `abilities` embutido. Consumir seria uma requisição por segundo para obter o que já veio. |
| `/liveclientdata/activeplayerrunes` | Não | `SAFE_FOR_FOUNDATION` (redundante) | Idem: `fullRunes` já vem em `/activeplayer`. |
| `/liveclientdata/activeplayername` | Não | `SAFE_FOR_FOUNDATION` (redundante) | O Riot ID já vem em `/activeplayer`. |
| `/liveclientdata/playerlist` | **Não** | `NEEDS_RIOT_REVIEW` | Devolve os dez jogadores, incluindo Riot IDs, itens e runas dos adversários. Nada nesta fundação precisa disso; consumi-lo seria coletar dado de terceiros sem finalidade. Qualquer uso futuro exige revisão explícita. |
| `/liveclientdata/allgamedata` | **Não** | `NEEDS_RIOT_REVIEW` | Superconjunto de tudo, incluindo `playerlist`. Mesmo motivo, agravado — é o oposto de minimização de dados. |
| `/liveclientdata/playeritems?riotId=` | **Não** | `NEEDS_RIOT_REVIEW` | Seguro para o próprio jogador; para adversários entra no território de item timing. Não usado. |
| `/liveclientdata/playersummonerspells?riotId=` | **Não** | `NEEDS_RIOT_REVIEW` | Para o próprio jogador seria observação; para adversários é o insumo direto de rastreio de cooldown de feitiço. Não usado. |
| `/liveclientdata/playermainrunes?riotId=` | **Não** | `NEEDS_RIOT_REVIEW` | Idem. Não usado. |

## 2. Campos efetivamente consumidos

Todos referentes ao **próprio jogador** ou à partida como um todo. Nenhum campo de adversário é
lido, armazenado ou exibido.

| Origem | Campo | Uso nesta etapa | Já visível ao jogador? | Classificação |
| --- | --- | --- | --- | --- |
| `gamestats` | `gameTime` | Relógio + detecção de partida nova (regressão) | Sim (HUD) | `SAFE_FOR_FOUNDATION` |
| `gamestats` | `gameMode`, `mapName`, `mapNumber`, `mapTerrain` | Contexto da sessão | Sim | `SAFE_FOR_FOUNDATION` |
| `activeplayer` | `level`, `currentGold` | Diagnóstico | Sim (HUD) | `SAFE_FOR_FOUNDATION` |
| `activeplayer` | `championStats.*` | Diagnóstico | Sim (HUD) | `SAFE_FOR_FOUNDATION` |
| `activeplayer` | `riotId` | **Somente** como parâmetro de `/playerscores`; redigido antes do IPC e nunca persistido | Sim (é o próprio nome) | `SAFE_FOR_FOUNDATION` |
| `playerscores` | `kills`, `deaths`, `assists`, `creepScore`, `wardScore` | Diagnóstico | Sim (placar) | `SAFE_FOR_FOUNDATION` |
| `eventdata` | `EventID`, `EventName`, `EventTime` | Deduplicação e registro factual | Sim (anúncio na partida) | `SAFE_FOR_FOUNDATION` |

Campos presentes nas respostas e **deliberadamente não lidos**: tudo que identifica ou descreve
outro jogador (`summonerName`/`riotId` de terceiros, `items`, `runes`, `scores`, `team`,
`isDead`, `respawnTimer`, `position`).

## 3. Capacidades classificadas `DO_NOT_USE`

Estas começam — e permanecem — proibidas. Não estão "adiadas por falta de tempo": são decisões de
política. Implementá-las exigiria revisão explícita da Riot, e várias colidem diretamente com o
escopo que o próprio produto declara publicamente não fazer (`docs/riot-compliance.md`).

| Capacidade | Classificação | Justificativa |
| --- | --- | --- |
| Rastreio de cooldown de ultimate inimiga | `DO_NOT_USE` | Informação que o jogador **não** teria sem a ferramenta. É exatamente o tipo de vantagem que o Sparta declara publicamente não oferecer. |
| Rastreio de cooldown de feitiço de invocador inimigo | `DO_NOT_USE` | Idem. Clássico caso de assistência in-game proibida. |
| Previsão de rota de caçador (jungle path prediction) | `DO_NOT_USE` | Deriva localização não observada — informação escondida por construção. |
| Localização inferida de adversário | `DO_NOT_USE` | O jogo esconde essa informação de propósito. Inferi-la é subvertê-lo. |
| Item timing / power spike inimigo | `DO_NOT_USE` | Constrói vantagem informacional sobre o adversário. |
| Timer de respawn estratégico de objetivo | `DO_NOT_USE` | Timer inferido; o pedido desta etapa proíbe explicitamente. |
| Recomendação "vá para X agora" | `DO_NOT_USE` | Decisão ditada durante a partida. O produto é apoio à decisão pré/pós-jogo, não comando em tempo real. |
| Decisão automática de item/build durante a partida | `DO_NOT_USE` | Automação de decisão. |
| Decisão macro automática | `DO_NOT_USE` | Idem. |
| Narração/TTS/voz | `DO_NOT_USE` **nesta etapa** | É o objetivo de longo prazo, mas exige a comunicação à Riot e revisão de política antes de existir. |
| Overlay durante a partida | `DO_NOT_USE` | Fora do escopo declarado do produto desde o início (`docs/riot-compliance.md`). |
| Qualquer escrita no cliente | `DO_NOT_USE` | O Sparta é read-only por construção. O cliente HTTP fixa o método em `GET`. |

## 4. Como as proibições são sustentadas no código

Documentar não basta; parte disso é estrutural:

- **Método fixo em `GET`** e host/porta não parametrizáveis em `requestLiveClient` — o chamador só
  escolhe o `path` dentro de `/liveclientdata/`. Não há como este cliente escrever no jogo.
- **`playerlist` e `allgamedata` nunca são chamados.** Como não são consumidos, nenhum dado de
  adversário entra no processo — a proibição não depende de alguém lembrar de filtrar depois.
- **Riot ID redigido na fronteira** (`redactSnapshotForTransport`), com teste que serializa o
  snapshot e verifica que o identificador não sobrevive.
- **Gate de produto** (`LIVE_GUIDANCE_PUBLIC_RELEASE = false`), com teste que trava o valor e outro
  que garante que nem mesmo a variável de opt-in liga o protótipo em produção.
- **Sem `fetch` genérico no preload**, com teste que lê o código do preload (sem comentários) e
  reprova se aparecer host, porta, path ou função de requisição arbitrária.

## 5. Itens que precisam de decisão da Riot antes de qualquer avanço

`NEEDS_RIOT_REVIEW` — nenhum está implementado:

1. Uso de `playerlist`/`allgamedata`, ainda que só para o próprio jogador.
2. Qualquer leitura de campo de adversário, mesmo dado já visível na tela.
3. Narração/TTS a partir de eventos factuais.
4. Qualquer distribuição pública desta fundação.
