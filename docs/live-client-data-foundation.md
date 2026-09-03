# Etapa 31O — Live Client Data Foundation

**Data:** 2026-08-29

**Estado:** `PROTOTYPE_LOCAL_ONLY` · `NOT_APPROVED_FOR_PUBLIC_LIVE_GUIDANCE` ·
`REAL_GAME_VALIDATION=PASS` · `REAL_GAME_TLS_VALIDATION=PASS` ·
`REAL_GAME_SWAGGER_COMPARISON=PASS` (validação real em 2026-09-03, §10)

**Escopo:** fundação factual e somente leitura para observar uma partida em andamento na própria
máquina, via Game Client API (`https://127.0.0.1:2999`). **Não** implementa narrador, voz, coach,
recomendação em partida, overlay, automação ou análise de adversário — ver
`docs/live-client-capability-matrix.md`.

**Superfície correta:** esta é a **Game Client API**, documentada pela Riot em seção própria como
API HTTPS local para aplicações nativas. Não é a **League Client API (LCU)** que o Sparta já usa
desde a Fase 6c (`packages/riot/src/lcu/`) — é da LCU, e só dela, que a Riot declara *"not
officially supported for use with third party applications"*. A distinção, com as duas citações
lado a lado, está em `docs/live-client-capability-matrix.md`.

---

## 1. A auditoria de TLS, que mudou o desenho

O pedido pedia para **auditar primeiro** a opção de usar o certificado raiz publicado pela Riot,
antes de considerar qualquer exceção. A auditoria produziu um resultado concreto — e negativo.

### O que a Riot publica

A documentação instrui: *"use the root certificate to validate the game client's SSL
certificate"*, apontando para
`https://static.developer.riotgames.com/docs/lol/riotgames.pem`.

Baixado e inspecionado:

| Propriedade | Valor |
| --- | --- |
| Subject / Issuer | `CN=LoL Game Engineering Certificate Authority` (autoassinado) |
| Validade | 2013-12-04 → 2043-11-27 (válido) |
| Assinatura | `sha1WithRSAEncryption` |
| Chave | RSA 2048 |
| `basicConstraints` | **ausente** (`X509Certificate.ca === false`) |
| SHA-256 do arquivo | `da884275737f024b33c93ae5d28bdb002768a3cb73752ab40254a32218193521` |

### O achado

**O certificado publicado não pode ser usado como `ca` do Node.** Faltando
`basicConstraints: CA:TRUE`, o OpenSSL se recusa a usá-lo como emissor de outro certificado.

Medido com uma cadeia sintética replicando a estrutura exata da Riot (raiz autoassinada, SHA-1,
`CA:FALSE`; folha assinada por ela):

```
ca pinned + hostname check    -> INVALID_PURPOSE
ca pinned, sem hostname check -> INVALID_PURPOSE
ca pinned + servername        -> INVALID_PURPOSE
rejectUnauthorized: false     -> OK (HTTP 200)
```

E um **teste de controle isolou a variável**: trocando apenas `CA:FALSE` por `CA:TRUE` na raiz —
mantendo a assinatura SHA-1 — a validação **passa**. Ou seja, o bloqueio é a ausência do
`basicConstraints`, **não** o SHA-1 (o OpenSSL 3.0.13 deste ambiente ainda aceita SHA-1 nesse
caminho). Sem esse controle, a conclusão natural seria culpar o SHA-1 e estaria errada.

### A solução adotada

Nem desabilitar TLS globalmente (proibido, e desnecessário), nem aceitar qualquer certificado
(perderia a garantia que a Riot pretendia). Em vez disso:

1. A conexão abre com `rejectUnauthorized: false` **escopado a esta requisição** — nunca
   `NODE_TLS_REJECT_UNAUTHORIZED`, nunca um agente global. Todo o resto do processo (Riot API,
   Data Dragon, API do Sparta) mantém validação TLS normal.
2. A verificação que o OpenSSL se recusa a fazer na construção da cadeia é feita **à mão**:
   `verifyGameClientCertificate` confere que o certificado apresentado foi assinado pela chave
   pública da raiz da Riot.
3. **Fail-closed, no handshake.** A checagem roda no evento `secureConnect` — assim que o TLS
   fecha e **antes** de qualquer resposta ser lida. Peer que não confere tem o socket derrubado na
   hora, e o resultado é `UNTRUSTED_CERTIFICATE`. O callback de resposta ainda tem uma guarda
   redundante: sem `certificateVerified === true`, a resposta é destruída sem parsing. E
   `agent: false` impede herdar do pool um socket que não passou por esta verificação.

Verificado nos dois sentidos, com certificados sintéticos gerados no próprio teste (DER escrito à
mão em `__fixtures__/synthetic-certificate.ts` — não há biblioteca de emissão no projeto, e não
valia adicionar uma só para isto):

| Caso | Resultado |
| --- | --- |
| Folha assinada por uma autoridade, verificada contra a chave dessa autoridade | **aceita** (prova que a verificação não é "sempre false") |
| Certificado **autoassinado de outra chave** | **rejeitado** |
| Folha emitida por uma **autoridade impostora** | **rejeitado** |
| Folha legítima com **um byte adulterado** | **rejeitado** |
| Raiz da Riot com **um byte adulterado** | **rejeitado** |

E a prova de fail-closed no caminho de rede real: um **servidor TLS impostor** sobe em
`127.0.0.1:2999` respondendo `200` com JSON que passaria no validador. O cliente devolve
`UNTRUSTED_CERTIFICATE`, sem `data` — e o servidor registra **zero requisições atendidas**, ou
seja, a conexão morreu antes de o corpo ser sequer solicitado. Confirmado que esse teste
**reprova** sem a correção (com a verificação no callback de resposta, o servidor contava 1
requisição atendida). Se a porta estiver ocupada — há um Game Client real na máquina — o teste se
declara **pulado** em vez de passar sem exercitar nada.

Os certificados e o servidor desses testes são sintéticos. A validação contra o certificado que o
Game Client apresenta de fato foi executada em 2026-09-03 e **passou** — ver §10.

O que se perde em relação ao TLS completo é a checagem de *hostname* — irrelevante aqui, já que o
destino é literalmente `127.0.0.1` e o certificado do Game Client não traz SAN para esse IP.

O PEM é **embutido como constante** (`riot-root-certificate-pem.ts`), não lido do disco: o processo
main é empacotado (rollup → `app.asar`) e resolver caminho relativo a partir de `import.meta.url`
não é confiável depois do bundle. Um teste trava o `fingerprint256`, de modo que trocar o
certificado por outro reprova em vez de o app passar a confiar numa raiz diferente em silêncio.

---

## 2. Arquitetura

```
League abre partida
        ↓
Game Client API :2999 disponível
        ↓
requestLiveClient            (TLS escopado + verificação manual, GET fixo)
        ↓
normalize*                   (contrato próprio; ausente ≠ zero)
        ↓
LiveGameSession              (identidade, revisão, ciclo de vida, dedupe)
        ↓
LiveClientObserver           (single-flight, polling 1000ms)
        ↓
reduceLiveClientState (main) (redação de Riot ID, isolamento entre partidas)
        ↓
live-client-watcher (main)   (gate + IPC + broadcast)
        ↓
LiveClientDiagnosticsScreen  (dev-only)
```

`packages/riot/src/live-client/`:

| Arquivo | Papel |
| --- | --- |
| `riot-root-certificate-pem.ts` | PEM oficial embutido (gerado do `.pem`, não editar à mão) |
| `riot-root-certificate.ts` | Parse memoizado + a auditoria completa em comentário |
| `live-client-client.ts` | HTTP/TLS, taxonomia de status, verificação de certificado |
| `live-game-snapshot.ts` | Contrato próprio + normalizadores + redação |
| `live-game-session.ts` | Máquina de estados, revisão, deduplicação de eventos |
| `live-client-observer.ts` | Orquestra endpoints, single-flight, intervalo de polling |

`apps/desktop/src/main/`:

| Arquivo | Papel |
| --- | --- |
| `live-guidance-gate.ts` | Gate de produto e opt-in de desenvolvimento |
| `live-client-state.ts` | Reducer **puro** do estado exposto ao renderer |
| `live-client-watcher.ts` | IPC, broadcast e agendamento do polling |

A separação entre reducer e watcher não é estética: as três regras que precisam de teste —
redação do Riot ID antes do IPC, isolamento do histórico de eventos entre partidas, e quando
transmitir — ficavam dentro de um closure com Electron em escopo, e exercitá-las exigiria
instanciar o processo main. Extraídas, são função pura e têm teste direto.

---

## 3. Endpoints e minimização de dados

A API expõe 12 endpoints. **Consumimos 4.** O critério: um endpoint só entra se algum dado
necessário não existir em outro que já consumimos.

- `/gamestats` — relógio, modo, mapa. Base do ciclo de vida.
- `/activeplayer` — nível, ouro, `championStats`, e o Riot ID que a própria API exige em
  `/playerscores`.
- `/playerscores?riotId=<próprio>` — K/D/A, CS, ward score. **Somente do jogador ativo.**
- `/eventdata` — eventos factuais já ocorridos.

Não consumidos e por quê:

- `/playerlist` e `/allgamedata` — trazem os dez jogadores, incluindo Riot IDs e itens dos
  adversários. Nada aqui precisa disso; consumi-los seria coletar dado de terceiros sem
  finalidade.
- `/activeplayerabilities`, `/activeplayerrunes`, `/activeplayername` — **redundantes**: a Riot já
  devolve `abilities`, `fullRunes` e o Riot ID embutidos em `/activeplayer`. Três requisições a
  mais por segundo para obter o que já veio na primeira não se justifica.

---

## 4. `ausente ≠ zero`

A invariante mais importante do normalizador. Todo campo que a API pode não devolver é opcional no
contrato. Um `0` significa "a API devolveu zero" — nunca "não veio".

Preencher ausência com zero produziria um ouro de 0, um K/D/A de 0/0/0 ou um nível 0 que o jogador
leria como fato. Mesmo princípio já aplicado em `StatCoverage` e nas métricas de recomendação.

Concretamente, os leitores (`readNumber`, `readString`) devolvem `undefined` quando o campo não
veio **ou** veio com tipo inesperado — nunca coagem. `NaN` e `Infinity` não passam como número. E
`championStats`/`scores` sem nenhum campo reconhecido viram ausência, não `{}`.

Testado nos dois sentidos: `gameTime: 0` real é preservado como `0`; placar zerado real é
preservado; ausência permanece `undefined`.

---

## 5. Ciclo de vida e isolamento entre partidas

`UNAVAILABLE → CONNECTING → LIVE ⇄ DEGRADED → ENDED`

Duas garantias que justificam a máquina de estados existir, em vez de derivar tudo de "a porta
respondeu":

**Identidade.** Cada partida observada ganha um `sessionId` próprio e uma `revision` monotônica.
Toda leitura captura a revisão *antes* de disparar e a confere na volta; resposta de uma sessão
anterior é descartada sem tocar em estado. É a mesma filosofia de `draftRevision` no Champion
Select, e é o que impede o placar de uma partida de aparecer na seguinte.

**Continuidade.** Falha isolada **não** encerra a partida — vira `DEGRADED`. Só três falhas
consecutivas (~3s) encerram. Isso separa "o Game Client engasgou" de "a partida acabou", que são
indistinguíveis para quem só olha se a porta respondeu.

**Partida nova** é detectada por regressão de `gameTime` maior que 30s. O relógio da Riot só anda
para frente dentro de uma partida; a folga absorve jitter de leitura, e qualquer coisa além disso
só acontece quando um jogo novo começou. Ao trocar de sessão, **todo** dado da anterior é zerado —
inclusive os IDs de evento já vistos, senão a partida nova nasceria suprimindo os próprios eventos
como repetidos.

`sessionId` é um identificador **técnico local** (contador + instante). Não é o `gameId` da Riot,
não deriva de identidade nenhuma do jogador e não correlaciona partidas entre execuções.

---

## 6. Eventos idempotentes

`/eventdata` devolve o **histórico inteiro** a cada chamada. Tratar a resposta como "eventos novos"
republicaria a partida inteira a cada segundo.

A chave de deduplicação é o `EventID` da própria Riot — identidade factual, não heurística de
conteúdo ou tempo. Reprocessar a mesma resposta duas vezes não produz evento algum na segunda. A
saída sai ordenada por ID, então o consumidor recebe em ordem factual mesmo se a API devolver fora
de ordem. Eventos sem `EventID` são descartados: sem identidade não há deduplicação possível, e um
evento repetido a cada segundo é pior que um evento ausente.

---

## 7. Polling

**1000 ms**, conservador de propósito. Nada nesta fundação precisa de resolução sub-segundo: o
relógio do jogo anda em segundos e os eventos são discretos. Um intervalo menor só multiplicaria
carga no Game Client local sem produzir informação nova. Ajustar exige razão técnica medida.

**Single-flight**: `poll()` recusa reentrância enquanto a rodada anterior não terminou. Sem isso,
um Game Client lento acumularia requisições a cada tick até saturar. O timeout por requisição
(800 ms) é menor que o intervalo, então uma tentativa nunca sobrepõe a próxima. `AbortController`
cancela tudo que estiver em voo ao encerrar a sessão.

---

## 8. Fronteira Electron e privacidade

O renderer **não** recebe acesso HTTP arbitrário ao localhost. Não existe — e não deve existir —
um `fetch(url)` genérico no preload. A superfície exposta é: um `invoke` que devolve o estado
normalizado e um `on` que recebe atualizações. O renderer não escolhe URL, host, porta nem
endpoint.

Todo o hardening existente é preservado: `assertTrustedIpcSender` (main frame + URL exata do
renderer), política de `window.open`, restrição de navegação.

**Riot ID** é necessário no main (a API exige o parâmetro em `/playerscores`), mas é removido do
snapshot antes de cruzar o IPC (`redactSnapshotForTransport`) — reconstruindo o objeto sem a chave,
de modo que ela nem chega a ser serializada. Dois testes cobrem isso em camadas diferentes:
`live-client-state.test.ts` serializa o payload inteiro do IPC e confirma que o identificador não
sobrevive, e `LiveClientDiagnosticsScreen.test.tsx` confirma que ele também não aparece no DOM
renderizado.

Nada é persistido em disco. Nenhum payload bruto é logado. As fixtures de teste são sanitizadas
(`TestSummoner#TEST`, valores inventados).

---

## 9. Gate de produto

`LIVE_GUIDANCE_PUBLIC_RELEASE = false`, com opt-in adicional
`SPARTA_LIVE_CLIENT_PROTOTYPE=1` que **só** funciona fora de produção.

Por que um gate explícito em vez de "é só não mostrar a tela": num build empacotado, esquecer de
esconder uma tela é um erro de uma linha. Aqui o watcher inteiro não inicia e nenhum poll acontece
— o protótipo não tem como vazar para uma release por descuido de UI. Um instalador de produção
nunca satisfaz as duas condições, e há teste travando exatamente isso.

---

## 9.1 O que está coberto por teste

**78** testes automatizados, distribuídos por camada, mais o teste opt-in que roda contra o jogo
de verdade.

| Camada | Arquivo | Cobre |
| --- | --- | --- |
| TLS e transporte | `live-client-client.test.ts` (11) | Identidade da raiz por `fingerprint256`, motivo do `ca` não servir, rejeição de autoassinado de outra chave/autoridade impostora/adulteração, aceitação da folha legítima, e fail-closed contra servidor TLS impostor real em `:2999` |
| Normalização | `live-game-snapshot.test.ts` (14) | `ausente ≠ zero`, tipo inesperado vira ausência, `NaN`/`Infinity` recusados, redação do Riot ID |
| Ciclo de vida | `live-game-session.test.ts` (17) | Identidade e revisão, `DEGRADED` vs `ENDED`, partida nova por regressão de relógio, resposta obsoleta descartada, deduplicação por `EventID` |
| Política de leitura | `live-client-observer.test.ts` (13) | Os 4 endpoints e **nenhum** dos proibidos/redundantes, `/playerscores` só do jogador ativo, ausência de Riot ID não vira placar zerado, disponibilidade por parte, single-flight, stale em voo, `stop()` |
| Fronteira IPC | `live-client-state.test.ts` (8) | Riot ID não sobrevive à serialização, zero real preservado, histórico isolado por partida e limitado, quando transmitir |
| Gate e preload | `live-guidance-gate.test.ts` (8) | Release pública travada em `false`, produção nunca liga, preload sem `fetch`/host/porta/endpoint |
| Diagnóstico | `LiveClientDiagnosticsScreen.test.tsx` (6) | Gate fechado declarado na tela, leitura factual do próprio jogador, ausência como travessão, evento único por ID, zero dado de adversário |
| **Partida real** | `live-client-real-game.test.ts` (1, opt-in) | Roda o observador e o reducer contra o Game Client em execução: relógio avança, sessão estável, zero evento repetido, payload de IPC sem Riot ID nem campo de terceiro |

`live-client-real-game.test.ts` exige `SPARTA_LIVE_CLIENT_REAL_GAME=1` **e** a porta escutando;
sem as duas condições ele se declara **pulado**, nunca passa por omissão. É o que transforma o
procedimento manual de §10 em algo repetível.

---

## 10. Validação com partida real — executada em 2026-09-03

**`REAL_GAME_VALIDATION=PASS` · `REAL_GAME_TLS_VALIDATION=PASS` ·
`REAL_GAME_SWAGGER_COMPARISON=PASS`**

Três partidas de Practice Tool consecutivas na máquina do responsável, com o processo
`League of Legends.exe` servindo `127.0.0.1:2999` (confirmado por `netstat`: o PID que escuta é o
do processo de jogo, não o do launcher).

### 10.1 TLS real

O cliente de produto (`requestLiveClient`, sem alteração) falou com o Game Client e recebeu `OK`.
Nada global foi tocado: `NODE_TLS_REJECT_UNAUTHORIZED` permaneceu `undefined`, host e porta
permaneceram fixos em `127.0.0.1:2999`.

| | Valor observado |
| --- | --- |
| Subject do certificado apresentado | `CN=rclient` |
| Issuer | `CN=LoL Game Engineering Certificate Authority` |
| Serial | `3BF10803C8CA18594F87B9B22E2055778583F9F1` |
| Validade | 2026-01-04 → 2125-12-11 |
| `fingerprint256` do certificado do jogo | `23:17:88:E9:B3:24:45:B6:3D:92:C8:79:31:61:02:03:E3:22:D8:EA:DC:65:D2:17:73:70:7D:78:A6:C9:3B:2C` |
| Raiz versionada da Riot (`fingerprint256`) | `CA:8C:9D:32:5B:4C:DC:46:4C:6C:94:A5:85:C8:5E:91:EC:23:D4:0B:A5:BF:3A:E2:82:2B:95:1A:4A:50:4E:A3` |
| `verifyGameClientCertificate(peer)` | **`true`** |

A raiz publicada continua assinando o certificado que o jogo apresenta. Não foi necessário — nem
feito — nenhum afrouxamento.

### 10.2 Swagger da instalação real

`/swagger/v3/openapi.json` (OpenAPI **3.0.0**) e `/swagger/v2/swagger.json` (Swagger **2.0**),
título `LoLClient`, 26 paths, dos quais **12 em `/liveclientdata`** — confirmando o "4 de 12" que
a etapa assumia a partir da documentação.

| Comparação | Resultado |
| --- | --- |
| Os 4 endpoints consumidos existem | Sim, os quatro |
| Endpoints ofertados e **não** consumidos | `activeplayerabilities`, `activeplayername`, `activeplayerrunes`, `allgamedata`, `playeritems`, `playerlist`, `playermainrunes`, `playersummonerspells` |
| `playerscores` | Exige `riotId` em query, `required: true` — exatamente como o cliente monta |
| `eventdata` | Aceita `eventID` **opcional**, que não usamos: buscamos o histórico e deduplicamos localmente |
| Schemas de resposta | Declarados como objeto livre, sem propriedades tipadas |

**Achado relevante**: o Swagger instalado **não tipa os campos de resposta**. Os nomes assumidos
(`gameTime`, `gameMode`, `riotId`, `level`, `currentGold`, `kills`, `creepScore`…) não são
verificáveis por ele — foram confirmados apenas pela resposta real, observada aqui. Isso reforça a
decisão de normalizar defensivamente: campo ausente ou de tipo inesperado vira ausência.

Nenhum cliente foi gerado a partir do Swagger, e nenhum endpoint novo foi consumido por ele
ofertar mais dados.

### 10.3 Endpoints realmente chamados

Medido no **transporte** (`https.request` instrumentado fora do código de produto), 13 rodadas
contra o jogo real: 52 requisições, distribuídas em `gamestats` (13), `activeplayer` (13),
`playerscores` (13) e `eventdata` (13). **Zero** chamadas a `playerlist`, `allgamedata`,
`playeritems`, `playersummonerspells`, `playermainrunes`, `activeplayerabilities`,
`activeplayerrunes` ou `activeplayername`.

O `playerscores` levou **um único** parâmetro `riotId`, idêntico ao do jogador ativo e escapado
(`%23`) — verificado por comparação, sem imprimir o identificador.

### 10.4 Snapshot, polling e eventos

197 snapshots ao longo das partidas observadas:

| Observação | Resultado |
| --- | --- |
| `gameTime` | Monotônico dentro de cada partida, **zero regressões espúrias** |
| Modo / mapa | `PRACTICETOOL` / `Map11` |
| Jogador ativo | Nível, ouro (fracionário real), `championStats` com 10 campos |
| Placar | K/D/A reais (chegou a `3/0/0`), CS, ward score |
| Disponibilidade | As 4 partes `true` em todas as rodadas |
| Zero real | `currentGold: 0` e `gameTime: 0.0` observados e **preservados como zero** |
| Riot ID após redação | Ausente em 100% dos snapshots |
| Cadência efetiva (medida pelo relógio do jogo) | Mediana **1,042 s** (mín. 1,023 / máx. 1,298) |
| Duração da rodada | Mediana 35 ms, máximo 303 ms — bem abaixo do timeout de 800 ms |
| Single-flight | Máximo de 1 rodada em voo, zero acúmulo, zero exceção não tratada |
| Memória (RSS do processo observador) | 36,3 → 50,2 MB, oscilando, sem crescimento monotônico |

**Eventos reais** (`eventdata` devolve o histórico inteiro a cada chamada): numa das partidas foram
emitidos os ids 0–8 — `GameStart`, `MinionsSpawning`, `ChampionKill`, `FirstBlood`, `Ace`,
`ChampionKill`, `Ace`, `ChampionKill`, `Ace` — **cada um exatamente uma vez**, em apenas 4 das 197
rodadas. Zero duplicação. Dois `MinionsSpawning` com `EventID` distintos foram emitidos como dois
eventos, o que confirma que a chave é o id da Riot e não o nome.

### 10.5 Fim de partida e segunda sessão

Sequência observada ao encerrar o Practice Tool:

| Estado | Rodada | Evidência |
| --- | --- | --- |
| `LIVE` | 167 | último snapshot, `gameTime` 439,9 s |
| `DEGRADED` | 168 | rodada de 815 ms: o timeout de 800 ms disparando quando o cliente parou de responder |
| `ENDED` | 170 | exatamente os 3 fracassos consecutivos |
| `UNAVAILABLE` | 171 | porta recusando conexão |
| `CONNECTING` | 301 | partida nova carregando: porta responde, leitura ainda inválida |
| `LIVE` | 306 | primeira leitura válida da partida nova |

Na transição: nenhuma requisição em voo virou snapshot, o estado antigo não permaneceu exposto
como atual, e o histórico de eventos foi zerado. A partida nova nasceu com `sessionId`
**`live-mtkyvkjf-2`**, distinto do `live-mtkyossi-1` da anterior, com `gameTime` voltando a 0,0 s,
nível 1 e CS 0 — sem qualquer contaminação da partida anterior.

### 10.6 Bug real encontrado e corrigido

A **primeira** execução deste ciclo reprovou, e o defeito só era observável com um jogo de verdade.

| | Partida 1 (último snapshot) | Partida 2 (primeiro snapshot) |
| --- | --- | --- |
| `gameTime` | 722,1 s | 0,7 s |
| Nível / ouro / CS | 6 / 1242 / 60 | 1 / 500 / 0 |
| `sessionId` | `live-mtkycj27-1` | **`live-mtkycj27-1`** (o mesmo) |

**Causa**: `LiveGameSession.observe()` decidia abrir sessão nova **enumerando** os estados
`UNAVAILABLE` e `ENDED`, e omitia `CONNECTING` — que é justamente por onde uma partida real passa
enquanto carrega. Os dois guardas falharam juntos: a regressão de relógio (722 s → 0,7 s) também
não disparou, porque `endSession()` já havia zerado `lastGameTimeSeconds`. Nenhum teste sintético
cobria `CONNECTING → LIVE`; todos exercitavam `UNAVAILABLE → LIVE` ou `ENDED → LIVE`.

**Correção** (mínima, uma condição): a decisão passou a enumerar quem **continua** a sessão —
apenas `LIVE`/`DEGRADED` sem regressão de relógio — de modo que qualquer outro estado abre sessão
nova. É seguro porque `observeFailure` nunca leva de `LIVE`/`DEGRADED` a `CONNECTING`, e fecha a
classe inteira do defeito em vez do caso específico.

**Regressão**: dois testes novos em `live-game-session.test.ts` reproduzem a sequência real
`ENDED → UNAVAILABLE → CONNECTING → LIVE` e exigem identidade nova, mais o histórico de eventos
limpo nessa transição. Confirmado que **reprovam sem a correção** e passam com ela. A validação
afetada foi repetida com uma terceira partida real — resultado em §10.5.

### 10.7 Limitações registradas

A tela de diagnóstico do Electron **não** foi aberta com dado real nesta sessão: ela vive atrás do
login, e Docker/Postgres/API estavam parados. O que foi validado contra o jogo real é o payload
que a alimenta — produzido pelo `LiveClientObserver` e por `reduceLiveClientState`, ambos código
de produto, com o teste opt-in confirmando ausência de Riot ID e de campo de terceiro. A
renderização em si continua coberta apenas por teste de componente.

Também não foi induzida uma **reconexão transitória dentro** da mesma partida (o `DEGRADED` real
observado foi sempre o do encerramento). Esse caminho segue coberto de forma sintética.

---

## 11. Bloco preparado para o Riot Developer Portal — **NÃO ENVIADO**

A Riot exige saber quais endpoints locais um produto usa. O texto abaixo está pronto; **o envio é
decisão do responsável** e não foi feito automaticamente. Nada foi editado na Production
Application existente.

> **Sparta GG — uso da Live Client Data API (local)**
>
> Estamos prototipando, **localmente e sem distribuição pública**, uma funcionalidade futura de
> acompanhamento durante a partida. Nesta fase construímos apenas a camada de observação factual.
>
> **Endpoints utilizados** (todos em `https://127.0.0.1:2999`, somente `GET`):
> - `/liveclientdata/gamestats` — tempo de jogo, modo e mapa, para detectar início/fim de partida.
> - `/liveclientdata/activeplayer` — nível, ouro e estatísticas do **próprio** jogador.
> - `/liveclientdata/playerscores?riotId=<jogador ativo>` — K/D/A, CS e visão do **próprio**
>   jogador. Chamado exclusivamente com o Riot ID do jogador local.
> - `/liveclientdata/eventdata` — eventos já ocorridos, para registro factual sem duplicação.
>
> **Como usamos**: exclusivamente leitura, na máquina do próprio jogador, exibida em um painel de
> diagnóstico interno. Não consumimos `playerlist` nem `allgamedata`.
>
> **O que NÃO fazemos**: nenhuma escrita no cliente; nenhuma automação de pick, ban, itens ou
> qualquer ação; nenhum rastreio de cooldown de adversário; nenhuma inferência de informação
> escondida (posição, rota de caçador, timers); nenhuma decisão ditada ao jogador; nenhum overlay;
> nenhuma leitura de memória, pixels ou tráfego.
>
> **Distribuição**: esta funcionalidade **não** está em nenhuma versão pública e permanece
> desabilitada por padrão no código. Comunicaremos antes de qualquer distribuição.

---

## 12. Estado por item do escopo

Completo = implementado, documentado e coberto por teste automatizado.

| Item | Estado | Observação |
| --- | --- | --- |
| `LiveClientDataClient` | **Completo** | GET fixo, host/porta não parametrizáveis, taxonomia de status, timeout e cancelamento |
| Verificação TLS | **Completo em código**, evidência sintética | Fail-closed no `secureConnect`; ver `REAL_GAME_TLS_VALIDATION` |
| Normalização factual | **Completo** | `ausente ≠ zero` como invariante, tipo inesperado vira ausência |
| `LiveGameSnapshot` | **Completo** | Contrato próprio, sem campo de adversário |
| Ciclo de vida da sessão | **Completo** | Identidade, revisão monotônica, `DEGRADED` antes de `ENDED` |
| Stale / fora de ordem | **Completo** | Revisão capturada antes da leitura e conferida na volta, nas duas camadas |
| Polling conservador | **Completo** | 1000 ms, single-flight, timeout menor que o intervalo |
| Deduplicação de eventos | **Completo** | Chave é o `EventID` da Riot, por sessão |
| Fronteira Electron/IPC | **Completo** | Sem `fetch` genérico, sender validado, contrato tipado, Riot ID redigido |
| Diagnóstico local dev-only | **Completo** | Item de navegação e watcher ambos sob o gate |
| Privacidade e logs | **Completo** | Nada em disco, nenhum payload logado, fixtures sanitizadas |
| Matriz de capacidade | **Completo** | `docs/live-client-capability-matrix.md` |
| Gate de release pública | **Completo** | `LIVE_GUIDANCE_PUBLIC_RELEASE = false` travado por teste |
| Comunicação à Riot | **Preparada, não enviada** | Decisão do responsável (§11) |
| Observação em partida real | **Completo** | `REAL_GAME_VALIDATION=PASS` (§10.3–10.5) |
| Certificado real do Game Client | **Completo** | `REAL_GAME_TLS_VALIDATION=PASS` (§10.1) |
| Comparação com o Swagger instalado | **Completo** | `REAL_GAME_SWAGGER_COMPARISON=PASS` (§10.2) |
| Tela de diagnóstico com dado real no Electron | **Não exercitada** | Depende de API/login; o payload que a alimenta foi validado (§10.7) |
| Reconexão transitória dentro da mesma partida | **Não induzida** | Coberta de forma sintética (§10.7) |

Os três gates da validação real estão fechados. O único item que continua fora do alcance técnico
é a comunicação à Riot, que é decisão do responsável, não trabalho de implementação.

---

## 13. Não alterado

Motor de recomendação, pesos, `release-etapa27c-v1`, replay, calibração, pré-game, pós-game, auth,
RSO, e-mail/Resend, API pública, Postgres, Redis, analyzer, site, Caddy, Docker de produção, DNS,
Production Application existente e a semântica atual do LCU — nenhum arquivo tocado. Nenhuma
dependência nova foi adicionada: o cliente usa `node:https` e `node:crypto`.
