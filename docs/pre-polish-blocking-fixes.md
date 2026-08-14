# Correções bloqueantes pré-polish do Desktop

**Data:** 2026-08-14

**Base auditada:** `baa12c2c91cb55ba2f6784b31cb82d1c859b8bf3`

**Escopo:** somente os cinco bloqueios de confiabilidade e segurança definidos na Etapa 0061.

## Resultado

Os cinco bloqueios desta etapa foram corrigidos com mudanças mínimas e testes de regressão. Não
houve redesign, nova tela, alteração do motor, publicação de API, RSO, provider de e-mail ou
recuperação de senha. O Desktop **não fica automaticamente autorizado para o polish visual**:
confirmação de e-mail end-to-end, recuperação de senha e os demais itens ainda abertos na auditoria
continuam pendentes para etapas próprias.

## 1. Propagação do patch no Docker

**Causa.** O `pnpm-lock.yaml` referencia `patches/extract-zip@2.0.1.patch`, mas os estágios `deps` e
`build` do `Dockerfile.api` executavam instalação congelada sem copiar `patches/` para o contexto do
estágio. O runtime não necessita das fontes do patch.

**Correção.** `COPY patches ./patches` passou a ocorrer antes de cada caminho que pode executar
`pnpm install --frozen-lockfile`, somente em `deps` e `build`. O estágio final continua multi-stage,
sem copiar `patches/`.

**Evidência.** O teste estrutural valida todas as entradas de `pnpm.patchedDependencies`, a ordem de
cópia nos estágios e a ausência no runtime. O build Docker real concluiu, a API ficou saudável em
`/health`, e a inspeção da imagem confirmou usuário `node` e ausência de `patches`, `.env`, `.git`,
fontes da API e executáveis de lint/test/build.

## 2. Sessão preservada durante indisponibilidade

**Causa.** O boot tratava qualquer rejeição de `fetchSession` como sessão inválida, apagava o bearer
cifrado pelo `safeStorage` e voltava ao login, mesmo em timeout, DNS/network failure, API offline ou
5xx.

**Nova regra.** Somente `401` autenticado, evidência autoritativa de credencial expirada, revogada ou
inválida, remove a sessão persistida. Timeout, falha de rede, indisponibilidade e 5xx preservam o
token, bloqueiam o shell e mostram um estado offline com retry. Não existe acesso local a dados
remotos sem confirmação da API.

**Evidência.** Testes cobrem API offline, timeout, 5xx, 401, erro transitório desconhecido e
recuperação na segunda tentativa. No Electron real, o token permaneceu no `safeStorage` após a API
ser parada, o shell ficou bloqueado, e o retry restaurou o Dashboard quando a API retornou.

## 3. Isolamento do draft LCU stale

**Causa.** A perda da sessão automática limpava apenas parte do estado React; aliados, inimigos,
bans e campeão observados podiam continuar alimentando recomendações. O snapshot também não tinha
uma identidade inequívoca da sessão observada.

**Lifecycle adotado.** O `gameId` positivo do LCU vira `sessionId`. O processo main mantém uma
`draftRevision` monotônica, publica uma revisão nova em toda mudança ou invalidação e inicia uma
observação vazia ao entrar ou trocar de sessão. O renderer aceita somente observações atuais e, ao
perder a confirmação, limpa todos os campos vindos do LCU, preservando apenas a escolha manual de
posição. Dados de revisão anterior não voltam a ser atuais.

**Evidência.** Testes determinísticos cobrem resposta antiga após indisponibilidade, nova sessão sem
aliados antigos e limpeza integral com preservação manual. No Electron real, uma sessão com Ashe foi
observada, a remoção do lockfile limpou Ashe, e uma nova sessão com outro `gameId` mostrou Lux sem
reintroduzir Ashe.

## 4. Corrida entre partidas no pós-game

**Causa.** As cinco famílias de requests iniciadas por `openMatch` não compartilhavam identidade ou
cancelamento. Uma resposta tardia da partida A podia fazer commit depois de o usuário selecionar B.

**Estratégia.** `LatestRequestCoordinator` atribui revisão e identidade a cada seleção, aborta a
seleção anterior e só permite commit enquanto o ticket continuar atual. Relatório, observação,
participantes, evidência por papel e comparação de draft recebem o mesmo `AbortSignal`; sucesso,
erro, loading e `finally` usam a mesma guarda. Unmount cancela o ticket ativo.

**Evidência.** Testes controlados reproduzem A inicia → B inicia → B termina → A termina, erro tardio
de A e cancelamento da tela. O estado final permanece exclusivamente B. A troca rápida entre duas
partidas também foi exercitada no Electron real.

## 5. Origem IPC e navegação Electron

**Superfície endurecida.** Todos os `ipcMain.handle` privilegiados validam frame principal, URL do
remetente e payload antes de sessão, autorização Riot, download de skin ou leitura LCU. Navegação
interna e novas janelas são fail-closed. `contextIsolation`, sandbox, CSP, `nodeIntegration: false` e
`safeStorage` foram preservados.

**Origins permitidos.** Em desenvolvimento, somente protocolo, origin e pathname exatos de
`ELECTRON_RENDERER_URL`; query string pode variar. Empacotado, somente o `file:` exato do
`out/renderer/index.html`. Autorização externa continua limitada a HTTPS em
`auth.riotgames.com`; skins, a HTTPS nos dois CDNs existentes e a nome de arquivo seguro.

**Casos rejeitados.** Prefixo de host malicioso, pathname diferente, outro arquivo local, subframe,
remetente sem frame principal, `window.open`, navegação externa, token vazio/excessivo, Riot URL fora
da allowlist, CDN/protocolo inválido e path traversal no nome da skin.

**Evidência.** Sete testes Node cobrem origins, frame, navegação, janela e payloads. No Electron real,
`window.open` retornou bloqueado, a tentativa de substituir a página por URL externa não navegou, e
houve zero erro de runtime ou resposta HTTP inesperada.

## Matriz da etapa

| Área                     | Estado  | Evidência                                                              | Bloqueio restante                                                         |
| ------------------------ | ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Docker patch propagation | `READY` | 3 testes estruturais; build/health real; runtime sem patch/dev/secrets | Nenhum neste item; warning OpenSSL do Prisma permanece follow-up separado |
| Session/offline          | `READY` | 11 testes de roteamento; QA offline/retry com `safeStorage` real       | Logout sem API continua item separado da auditoria                        |
| LCU stale draft          | `READY` | 8 testes Riot + 3 lifecycle; QA de desconexão e novo `gameId`          | RSO/API pública não fazem parte deste item                                |
| Postgame race            | `READY` | 3 testes de concorrência; 157 testes Desktop; troca rápida real        | Indisponibilidade visual por fonte continua item separado                 |
| Electron IPC/navigation  | `READY` | 7 testes de segurança; QA de navegação/window; 0 erros                 | Limite de bytes de download continua item separado                        |

## Validação

- instalação: `pnpm@10.34.4 install --frozen-lockfile`;
- versão: 8 superfícies coerentes em `0.9.0`;
- Prisma: generate e schema válidos; 24 migrations atualizadas no container;
- testes: raiz 21 + site 102 + core 635 + Riot 98 + API 353 + Desktop 157 = **1.366**;
- analyzer: 1/1, com warning de depreciação Starlette/httpx já conhecido;
- typecheck, lint e build de todos os workspaces;
- build Electron real e build Docker multi-stage da API;
- API Docker saudável e imagem final inspecionada;
- QA Electron/CDP real com 0 erros de runtime e 0 respostas HTTP inesperadas.

O Prisma continua emitindo no Debian slim o warning já conhecido de autodetecção do OpenSSL. A
imagem inicia, executa migrations e atende o healthcheck, mas a correção desse warning não foi
misturada a esta etapa restrita.

## Pendências explícitas

- confirmação de e-mail end-to-end e provider transacional;
- recuperação de senha;
- semântica de logout/revogação quando a API está indisponível;
- demais itens não incluídos nos cinco bloqueios desta etapa;
- decisão formal posterior sobre entrada no polish visual.
