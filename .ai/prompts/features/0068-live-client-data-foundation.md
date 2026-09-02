---
status: IMPLEMENTADA
solicitado_em: 2026-08-29 12:20
implementado_em: 2026-08-29 13:05
---

# Etapa 31O — Live Client Data Foundation

## Pedido original

> ETAPA 31O — LIVE CLIENT DATA FOUNDATION. Aplique as regras permanentes registradas em `.ai/`.
>
> **Contexto**: o Sparta GG está com a Production Application em análise pela Riot. Enquanto a
> Production Key / RSO não são aprovados: a API pública continua desativada; esta feature NÃO será
> distribuída publicamente; não alterar os gates atuais de produção; não usar Development Key como
> substituto de Production Key. Queremos iniciar um PROTÓTIPO LOCAL de uma futura experiência de
> narrador/guia durante a partida. Nesta etapa NÃO implementar o narrador. O objetivo é construir e
> validar exclusivamente a fundação factual e read-only de dados em tempo real. A fonte é a Game
> Client API / Live Client Data API documentada pela Riot, disponível localmente durante uma partida
> em `https://127.0.0.1:2999` (swagger em `/swagger/v3/openapi.json` e `/swagger/v2/swagger.json`).
> Não confundir com Riot Web API, Match-V5, LCU ou Replay API.
>
> 1. **Objetivo**: camada robusta que detecte partida ativa e observe, SOMENTE LEITURA, dados
>    factuais locais. Pipeline: League abre partida → Game Client API :2999 disponível →
>    LiveClientDataClient → validação/parsing → LiveGameSnapshot normalizado → LiveGameSession
>    lifecycle → diff/event stream interno → diagnóstico local. PARAR AÍ. Não implementar TTS, voz,
>    narrador, coach, recomendações durante a partida, decisões sugeridas, overlay público, IA/LLM,
>    automação ou timers inferidos.
> 2. **Factual e read-only**: consumir só o que a API realmente retorna. Não inferir, não fabricar
>    estado, não extrapolar, não rastrear informação escondida, não observar memória do processo,
>    não usar packet inspection, não ler tela/pixels, não injetar DLL, não enviar input ao League,
>    não controlar câmera, não escrever no cliente, não usar Replay API.
> 3. **Endpoints**: auditar Swagger/OpenAPI e a doc Riot atual antes de implementar; preferir o
>    MENOR conjunto suficiente. Candidatos: `/liveclientdata/gamestats`,
>    `/liveclientdata/activeplayer`, `/liveclientdata/activeplayerabilities`,
>    `/liveclientdata/activeplayerrunes`, `/liveclientdata/playerscores?riotId=<ACTIVE_PLAYER>`
>    (somente o jogador ativo), `/liveclientdata/eventdata`. NÃO consumir `playerlist` salvo
>    necessidade técnica demonstrável e documentada. O fato de um endpoint existir NÃO significa que
>    tudo que ele retorna deve ser usado. Aplicar minimização de dados.
> 4. **Dados de inimigos**: esta etapa NÃO deve construir nenhuma análise de inimigos — sem cooldown
>    inimigo, cooldown de summoner inimigo, timer inferido, jungle tracking, path prediction,
>    localização inferida, item timing inferido, respawn estratégico, previsão de rotação,
>    recommendation baseada no estado inimigo, análise de comportamento ou scouting. Mesmo que o dado
>    esteja tecnicamente presente, NÃO transformá-lo em feature. Documentar cada categoria como
>    SAFE_FOR_FOUNDATION / NEEDS_RIOT_REVIEW / DO_NOT_USE.
> 5. **Modelo normalizado**: não acoplar o produto aos JSONs da Riot. Criar contrato próprio
>    (`LiveGameSnapshot`) com observedAt, sessionId, game (gameTimeSeconds, mode, map), activePlayer
>    (riotId? não persistir desnecessariamente, level, currentGold, championStats, abilities, runes,
>    scores), events, availability. IMPORTANTE: ausente ≠ zero — campo que não vier fica
>    undefined/unavailable, nunca 0 só pra satisfazer UI/schema.
> 6. **LiveGameSession**: lifecycle explícito (UNAVAILABLE, CONNECTING, LIVE, DEGRADED, ENDED). Não
>    depender só de "porta respondeu". Sessão com identidade própria; dados de uma partida não podem
>    vazar pra próxima. Considerar: client não abriu, partida começou, endpoint aparece, request
>    falha temporariamente, Game Client reinicia, partida termina, endpoint desaparece, usuário
>    inicia outra partida, `gameTime` volta pra valor baixo, resposta atrasada de partida anterior
>    chega depois, League fecha abruptamente. Mesma filosofia de draftRevision/gameId/latest-only/
>    stale request cancellation já usada no Sparta.
> 7. **Polling**: não agressivo. Frequência documentada, começar conservador (~1000ms), ajustar só
>    com razão técnica mensurável. Usar AbortController, timeout, single-flight/latest-only,
>    cancellation ao encerrar sessão. Não acumular requests.
> 8. **Eventos**: `eventdata` retorna histórico. Não tratar cada poll como eventos novos. Manter
>    cursor/identidade factual pelo identificador retornado. Garantir idempotência; não gerar evento
>    duas vezes; não inferir evento que a API não retornou.
> 9. **Segurança HTTPS local**: certificado local/self-signed. NÃO usar
>    `NODE_TLS_REJECT_UNAUTHORIZED=0` global, não desabilitar validação TLS pro processo inteiro.
>    Auditar primeiro a opção de usar o certificado raiz fornecido/documentado pela Riot. Se for
>    necessário aceitar o certificado local, isolar a exceção estritamente ao cliente
>    `https://127.0.0.1:2999`. Documentar a decisão. Nenhuma configuração global insegura é
>    aceitável.
> 10. **Boundary Electron**: chamada a :2999 fica no lado privilegiado. Não dar ao renderer acesso
>     HTTP arbitrário ao localhost, não expor `fetch(url)` genérico via preload. IPC mínimo e
>     tipado. Preservar hardening existente (main-frame validation, origin validation, exact URL
>     policy, payload validation, navigation/window.open restrictions). Renderer recebe só o
>     contrato normalizado.
> 11. **Privacidade**: não persistir respostas brutas por padrão; evitar persistir Riot IDs de
>     outros jogadores, `playerlist` completo, payloads integrais. Runtime em memória. Logs sem
>     payload completo e sem Riot ID por padrão. Fixtures só em teste e sanitizadas. Capturas reais
>     com identificadores não entram no Git.
> 12. **Diagnóstico local**: forma mínima de observar a fundação (painel interno / rota dev /
>     logger sanitizado) mostrando Game Client, Session, Game time, level, gold, K/D/A, CS, último
>     evento. Não virar UI de produto, não criar overlay, não falar por voz.
> 13. **Swagger/contrato real**: com partida ativa, consultar `/swagger/v3/openapi.json` e comparar
>     com a documentação assumida; registrar endpoints presentes, schemas relevantes e diferenças.
>     Não gerar cliente gigante automaticamente. Tolerar mudanças aditivas; validar só os campos
>     realmente consumidos.
> 14. **Testes**: CLIENT (indisponível, timeout, HTTP failure, JSON inválido, payload parcial,
>     payload válido); NORMALIZER (ausência preservada, zero real preservado, campos extras
>     ignorados, tipos inesperados); SESSION (começa, termina, reconexão, segunda partida, gameTime
>     reset, stale response, out-of-order, shutdown durante request); EVENTS (primeiro lote, evento
>     novo, repetido, IDs fora de ordem, reconexão não reproduz tudo); IPC (main frame autorizado,
>     subframe rejeitado, origin inesperada, payload inválido, renderer não escolhe URL);
>     PRIVACIDADE (logs sem Riot ID, fixtures sem identificador real).
> 15. **Validação com partida real**: preferencialmente Practice Tool. Não afirmar "validado em
>     partida real" sem partida ativa. Se não for possível: concluir implementação, testes verdes,
>     marcar REAL_GAME_VALIDATION=PENDING e fornecer procedimento exato. Com partida real verificar
>     11 pontos (indisponível antes, aparece durante, GameStats, ActivePlayer, scores, eventos,
>     polling estável, zero requests acumulados, endpoint some ao terminar, sessão encerrada e
>     memória limpa, segunda partida cria nova sessão).
> 16. **Matriz de compliance**: documento "Live Client Data Capability Matrix" com endpoint, campo,
>     finalidade potencial, informação já visível ao jogador?, utilizada nesta etapa?, e
>     classificação SAFE_FOR_FOUNDATION / NEEDS_RIOT_REVIEW / DO_NOT_USE + justificativa. Começam
>     como DO_NOT_USE: enemy ultimate/summoner cooldown tracking, jungle path prediction, inferred
>     hidden location, recommendation "vá para X agora", automatic item/macro decision. A existência
>     técnica do dado não substitui análise de política.
> 17. **Gate de produto**: `LIVE_GUIDANCE_PUBLIC_RELEASE=false` ou equivalente arquitetural. O
>     protótipo não pode acabar acidentalmente em release pública. Não alterar installer público,
>     não republicar Desktop, não alterar versão pública retirada, não anunciar no site.
> 18. **Riot Developer Portal**: a doc informa que a Riot precisa saber quais endpoints locais são
>     usados e como. NÃO enviar mensagem nem editar a Production Application automaticamente. Apenas
>     preparar um bloco pronto para futura comunicação (objetivo, lista exata de endpoints,
>     read-only, localhost only, sem automação, sem informação escondida, sem enemy cooldown
>     tracking, sem decisão ditada, ainda não distribuída publicamente).
> 19. **Não alterar**: motor de recomendação, pesos, release-etapa27c-v1, replay, calibration,
>     pregame, postgame, auth, RSO, email, Resend, API pública, Postgres, Redis, analyzer, site,
>     Caddy, Docker de produção, DNS, Production Application existente, LCU semantics atuais. Não
>     introduzir dependency pesada sem necessidade.
> 20. **Documentação**: spec, changelog, `.ai/CLAUDE`, prompt da feature, capability matrix,
>     arquitetura Live Client, manual real-game validation checklist. Documentar claramente
>     PROTOTYPE_LOCAL_ONLY e NOT_APPROVED_FOR_PUBLIC_LIVE_GUIDANCE.
> 21. **Critérios de aceitação** (20 itens): cliente isolado pra :2999; Game Client offline tratado
>     como estado normal; snapshots normalizados; ausente não vira zero; lifecycle explícito; stale
>     responses não atravessam sessões; eventos idempotentes; polling não acumula; TLS não
>     desabilitado globalmente; renderer sem fetch localhost arbitrário; nenhum dado
>     escondido/inferido; nenhum conselho de gameplay; nenhum TTS; nenhuma análise de inimigo;
>     logs/fixtures sanitizados; capability matrix existe; release pública desabilitada;
>     testes/typecheck/lint/build verdes; motor/release intactos; commit/push na main.
>
> Relatar ao final: arquitetura criada, arquivos alterados, endpoints consumidos, campos utilizados,
> frequência de polling, estratégia TLS, lifecycle, tratamento de stale data, eventos/deduplicação,
> IPC, privacidade, capability matrix, testes, validação real ou PENDING, diferenças no Swagger
> real, itens NEEDS_RIOT_REVIEW, itens DO_NOT_USE, regressões evitadas, commit final.

## Notas de implementação

Relatório técnico em `docs/live-client-data-foundation.md` e matriz em
`docs/live-client-capability-matrix.md` (ambos espelhados em `.ai/specs/`). Resumo:

- **A auditoria de TLS mudou o desenho.** O pedido mandava auditar primeiro o certificado raiz
  publicado pela Riot. Baixado e inspecionado: autoassinado, SHA-1, válido até 2043 — e **sem
  `basicConstraints: CA:TRUE`**. Medido com uma cadeia sintética replicando a estrutura exata:
  `ca` pinado falha com `INVALID_PURPOSE` nas três variantes (com hostname check, sem, e com
  `servername`). Um **teste de controle** trocando só `CA:FALSE` por `CA:TRUE` — mantendo SHA-1 —
  **passa**, isolando que o bloqueio é o `basicConstraints`, não o digest. Sem esse controle a
  conclusão natural seria culpar o SHA-1, e estaria errada.
- **Solução**: `rejectUnauthorized: false` escopado à requisição (nunca global, nunca
  `NODE_TLS_REJECT_UNAUTHORIZED`) + verificação **manual** de que o certificado apresentado foi
  assinado pela chave pública da raiz da Riot, **no `secureConnect`** — fail-closed antes de
  qualquer resposta ser lida. PEM embutido como constante porque o main é empacotado em `app.asar`
  e caminho relativo não resolve; teste trava o `fingerprint256`.
- **4 endpoints de 12**, por minimização: `gamestats`, `activeplayer`, `playerscores` (só do
  jogador ativo) e `eventdata`. `playerlist`/`allgamedata` **não** consumidos — trariam Riot IDs e
  itens dos adversários sem finalidade. `activeplayerabilities`/`activeplayerrunes`/
  `activeplayername` são **redundantes**: já vêm embutidos em `/activeplayer`.
- **`ausente ≠ zero`** como invariante do normalizador: leitores devolvem `undefined` para campo
  ausente OU de tipo inesperado, `NaN`/`Infinity` não passam, e `championStats`/`scores` sem campo
  reconhecido viram ausência em vez de `{}`. `gameTime: 0` e placar zerado reais são preservados.
- **Sessão com identidade e revisão monotônica**: resposta de partida anterior é descartada
  (mesma filosofia de `draftRevision`); falha isolada vira `DEGRADED`, só 3 seguidas encerram;
  partida nova detectada por regressão de `gameTime` > 30s, e a troca zera os IDs de evento vistos
  (sem isso a partida nova nasceria suprimindo os próprios eventos).
- **Eventos idempotentes** pelo `EventID` da Riot; `/eventdata` devolve histórico inteiro a cada
  chamada, então tratar a resposta como "novos" republicaria a partida a cada segundo.
- **Polling 1000ms com single-flight** (timeout 800ms < intervalo, então tentativa não sobrepõe) e
  `AbortController` no encerramento — requisições não acumulam.
- **Fronteira Electron**: sem `fetch` genérico no preload; renderer recebe só o contrato
  normalizado e não escolhe URL/host/porta/endpoint. Riot ID redigido antes do IPC, com teste que
  serializa e verifica que não sobrevive.
- **Gate** `LIVE_GUIDANCE_PUBLIC_RELEASE=false` + opt-in que só funciona fora de produção; o
  watcher inteiro não inicia com o gate fechado. Teste trava o valor e garante que produção nunca
  liga.
- **`REAL_GAME_VALIDATION=PENDING`**: nenhuma partida ativa durante a etapa (confirmado:
  `RiotClientServices` rodando, `:2999` sem escutar — o próprio estado `UNAVAILABLE`). Procedimento
  manual documentado, incluindo a comparação com o Swagger real, que também fica pendente.
- **1480 testes** no monorepo (riot 98→138, desktop 171→184). Zero arquivo em `packages/core`,
  `apps/api`, `prisma/`, `infra/`, Docker ou site — a não regressão do motor é estrutural.
- Nenhuma dependência nova: `node:https` + `node:crypto`.

## Correções de contexto aplicadas em 2026-09-02 (pedido do usuário)

1. **Numeração**: este arquivo nasceu como `0067-...`, número que já pertencia à Etapa 31N
   (`0067-polimento-visual-2-site-screenshots-desktop.md`). Renomeado para `0068` via `git mv`; a
   referência no `.ai/CHANGELOG.md` foi corrigida junto.
2. **Sequência histórica**: `671d22c` = Etapa 31M.1, `dd6871f` = Etapa 31N, esta etapa = 31O. A
   descrição errada de `dd6871f` como continuação da 31M.1 ficou só numa mensagem de chat —
   confirmado por busca que ela nunca chegou a `docs/`, `.ai/specs/` ou ao changelog, que já
   listavam a ordem correta.
3. **LCU × Game Client API**: eu tinha atribuído à Game Client API o disclaimer *"not officially
   supported for use with third party applications"*. Errado — essa declaração é da seção **League
   Client API (LCU)**. A seção da Game Client API descreve o serviço como *"served over HTTPS by
   League of Legends game client and are only available locally for native applications"*, sem
   disclaimer equivalente. Corrigido em `docs/live-client-capability-matrix.md` (com as duas
   citações lado a lado e o registro explícito do erro), em `docs/live-client-data-foundation.md` e
   nos comentários de `packages/riot/src/live-client/{index,live-game-snapshot}.ts`. A justificativa
   de usar contrato próprio foi re-fundamentada na regra já aplicada ao Match-V5 desde a Fase 1.
4. **TLS endurecido para fail-closed**, mantendo o achado empírico intacto (raiz sem
   `basicConstraints`, `INVALID_PURPOSE`, SHA-1 descartado como causa por teste de controle):
   verificação movida para o `secureConnect`, socket derrubado na hora quando o peer não confere,
   guarda redundante no callback de resposta e `agent: false` para não herdar socket do pool.
   Testes novos: certificado **autoassinado de outra chave** rejeitado, folha de **autoridade
   impostora** rejeitada, **adulteração** (da folha legítima e da própria raiz da Riot) rejeitada, e
   o caso **positivo** (folha legítima aceita contra a chave da sua autoridade) para o verificador
   não poder passar devolvendo sempre `false`. Mais um teste de rede real contra **servidor TLS
   impostor** em `127.0.0.1:2999`: `UNTRUSTED_CERTIFICATE`, sem `data`, com **zero requisições
   atendidas** pelo servidor — confirmado que reprova sem a correção. Nada de global, nada de
   `NODE_TLS_REJECT_UNAUTHORIZED`, host/porta continuam fora do alcance do renderer.
5. **`REAL_GAME_TLS_VALIDATION=PENDING`** registrado como estado próprio: os certificados e o
   servidor dos testes são sintéticos, e isso não é apresentado como validação em `:2999` real. O
   procedimento manual ganhou um passo dedicado a fechar essa lacuna, com instrução explícita de
   não afrouxar a verificação se o certificado real for recusado.
