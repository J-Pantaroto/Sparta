# Etapa 31O — Live Client Data Foundation

**Data:** 2026-08-29

**Estado:** `PROTOTYPE_LOCAL_ONLY` · `NOT_APPROVED_FOR_PUBLIC_LIVE_GUIDANCE` ·
`REAL_GAME_VALIDATION=PENDING`

**Escopo:** fundação factual e somente leitura para observar uma partida em andamento na própria
máquina, via Game Client API (`https://127.0.0.1:2999`). **Não** implementa narrador, voz, coach,
recomendação em partida, overlay, automação ou análise de adversário — ver
`docs/live-client-capability-matrix.md`.

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
   pública da raiz da Riot. Se não foi, a resposta é descartada com `UNTRUSTED_CERTIFICATE` antes
   de qualquer parsing.

Verificado nos dois sentidos com a cadeia sintética: folha legítima **aceita**, folha de outra
cadeia **rejeitada**.

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
live-client-watcher (main)   (gate + IPC + redação de Riot ID)
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

`apps/desktop/src/main/`: `live-guidance-gate.ts` (gate) e `live-client-watcher.ts` (IPC).

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
de modo que ela nem chega a ser serializada. Teste verifica que o identificador não sobrevive a
`JSON.stringify`.

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

## 10. Validação com partida real — `PENDING`

**Nenhuma partida estava ativa durante esta etapa.** Verificado no início: `RiotClientServices`
rodando, mas League of Legends fora de partida e **nada escutando em `:2999`** — que é exatamente
o estado `UNAVAILABLE` que a fundação trata como repouso normal.

Portanto **não** se afirma "validado em partida real". O que foi validado: 36 testes automatizados
cobrindo cliente, normalizador, sessão, eventos, IPC e privacidade, mais a auditoria de TLS
executada contra uma cadeia sintética que replica a estrutura real do certificado da Riot.

### Procedimento manual para completar a validação

1. Iniciar o Desktop em desenvolvimento com o protótipo habilitado:
   ```bash
   SPARTA_LIVE_CLIENT_PROTOTYPE=1 pnpm --filter @sparta/desktop dev
   ```
2. Abrir **Observação ao vivo** (grupo Evolução, visível só em desenvolvimento). Confirmar
   `Indisponível` — `:2999` ainda não existe.
3. Abrir o League e iniciar uma partida no **Practice Tool**.
4. Confirmar, na tela de diagnóstico:
   - estado passa a `Ao vivo` e um `sessionId` aparece;
   - tempo de jogo avança;
   - modo/mapa correspondem à partida real;
   - nível, ouro, K/D/A e CS batem com o HUD do jogo;
   - eventos aparecem uma única vez cada (matar um monstro não deve duplicar linha).
5. Minimizar/restaurar o jogo e confirmar que o estado não oscila para erro.
6. Encerrar a partida. Confirmar que o estado volta para `Encerrada`/`Indisponível` e que os
   eventos são limpos.
7. Iniciar uma **segunda** partida e confirmar que o `sessionId` é diferente e que nenhum dado da
   primeira aparece.
8. Durante a partida, consultar o Swagger real e comparar com o assumido aqui:
   ```bash
   curl -k https://127.0.0.1:2999/swagger/v3/openapi.json
   ```
   Registrar diferenças de endpoint/schema neste documento.

**Ainda não executado:** o passo 8 (comparação com o Swagger real instalado) depende de partida
ativa. Os endpoints e campos usados vieram da documentação oficial consultada em 2026-08-29.

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

## 12. Não alterado

Motor de recomendação, pesos, `release-etapa27c-v1`, replay, calibração, pré-game, pós-game, auth,
RSO, e-mail/Resend, API pública, Postgres, Redis, analyzer, site, Caddy, Docker de produção, DNS,
Production Application existente e a semântica atual do LCU — nenhum arquivo tocado. Nenhuma
dependência nova foi adicionada: o cliente usa `node:https` e `node:crypto`.
