---
status: IMPLEMENTADA
solicitado_em: 2026-10-02 16:58
implementado_em: 2026-10-02 17:39
---

# Etapa 31O.1 — Local AI Coaching Runtime

## Pedido original

> Criar um agente local de coaching por voz que interprete fatos atuais da própria partida,
> mudanças recentes, histórico pessoal resumido e conhecimento controlado/versionado do jogo. A
> IA pode raciocinar sobre fatos, mas nunca criar fatos; silêncio é resultado válido. Executar
> somente esta etapa e manter o protótipo local, desabilitado por padrão e fora do instalador
> público.
>
> Antes de implementar, auditar a Etapa 31O e seus gates `REAL_GAME_TLS_VALIDATION`,
> `REAL_GAME_SWAGGER_COMPARISON` e `REAL_GAME_VALIDATION`. Não falsificar uma validação real
> pendente. Confirmar a correção do lifecycle `ENDED → UNAVAILABLE → CONNECTING → LIVE`, que deve
> criar novo `sessionId`, sem reabrir a arquitetura anterior sem evidência.
>
> Pipeline: Live Client → snapshot factual → `LiveStateDelta` → gatilho por mudança significativa
> ou heartbeat conservador → `PersonalCoachingContext` → `PatchKnowledge` versionado →
> `LocalCoachingModel` → `CoachingDecision` estruturada → Policy Gate determinístico →
> prioridade/anti-spam → `PhraseComposer` determinístico → `VoiceOutput` local. O escopo inicial
> cobre visão, segurança no early game, sobrevivência e farm/recursos próprios.
>
> Não criar chatbot, tools, shell, browser, filesystem/fetch arbitrário, Riot API/LCU/Game Client
> direto pelo modelo, banco direto, ações no jogo, controle do cliente ou texto livre enviado ao
> TTS. A IA recebe somente um `SituationContext` compacto e sanitizado, self-centric, preparado
> pelo Sparta. Não consumir `playerlist` nem ampliar silenciosamente dados de adversários.
>
> O modelo roda localmente. Não usar OpenAI, Claude, Gemini, Azure, ElevenLabs ou cloud. Criar
> abstração independente de runtime e auditar o ambiente antes de escolher provider. Não instalar
> software externo silenciosamente. Se não houver runtime, implementar provider loopback e setup
> explícito, mantendo-o indisponível até configuração. Aceitar somente `127.0.0.1`/`localhost`,
> sem URL arbitrária vinda do renderer.
>
> Criar `LiveStateDelta` para mudanças factuais relevantes e não inferir a cada poll. Suportar
> heartbeat na ordem de dezenas de segundos, debounce, single-flight, timeout, cancelamento,
> latest-only, session binding e fila bounded. Medir latência p50/p95, timeouts, rejeições e
> silêncios. Cancelar toda inferência e voz ao trocar/encerrar sessão.
>
> Criar `PersonalCoachingContext` apenas do histórico próprio, com amostra/período e estados
> `RECURRING_CONCERN`, `NOT_OBSERVED`, `INSUFFICIENT_DATA` e `UNAVAILABLE`; não enviar histórico
> bruto, adversários ou causalidade. Criar `PatchKnowledge` pequeno, auditável e versionado, com id,
> categoria, conteúdo, patch, provenance, revisão, sensibilidade e aplicabilidade. Separar
> `LIVE_FACT`, `PERSONAL_HISTORY_FACT`, `PATCH_KNOWLEDGE` e `GENERIC_KNOWLEDGE`. Em patch mismatch,
> permitir somente orientação `PATCH_AGNOSTIC` segura.
>
> Avaliar o endpoint `/liveclientdata/playeritems?riotId=<ACTIVE_PLAYER_RIOT_ID>` apenas para o
> jogador ativo, sem `playerlist`, e atualizar a Capability Matrix como
> `LOCAL_AI_COACH_PROTOTYPE`/`NEEDS_RIOT_REVIEW_FOR_PUBLIC_RELEASE`. Antes de atribuir semântica,
> validar em partida real `itemID`, `displayName`, `slot`, `count` e `canUse`. Classificar trinkets
> por fonte Riot/ID (`WARDING_TRINKET`, `FARSIGHT_TRINKET`, `ORACLE_LENS`, `UNKNOWN`) e não assumir
> que `count` significa cargas sem validação real.
>
> A resposta do modelo deve passar por schema forte: `shouldSpeak`, categoria permitida,
> prioridade, confidence, `evidenceRefs`, `knowledgeRefs`, intent/observation/opções semânticas,
> expiry e cooldown key. JSON inválido resulta em silêncio; no máximo um retry controlado. Toda
> referência deve existir no input. Referência criada pelo modelo, categoria proibida, confidence
> inválida ou expiry absurdo devem ser rejeitados.
>
> A IA decide o que comunicar; `PhraseComposer` decide como falar em português brasileiro, com tom
> curto, calmo, útil e não condescendente. Rejeitar ordens diretas como “warde agora”, “recue
> agora”, “invada”, “vá dragão”, “ganke top”, “faça recall agora” ou “compre X”. Usar opções como
> “considere”, “uma opção é” e “se houver uma janela segura”. O Policy Gate obrigatório valida
> schema, evidência, knowledge, categoria, sessão, compliance, freshness, cooldown e fila; qualquer
> falha vira `DROP`.
>
> Bloquear cooldown inimigo, summoner inimigo, item timing inimigo, posição inferida, jungle path,
> wards ocultas, fog-of-war, gank previsto, intenção inimiga e qualquer informação não factual.
> Criar testes adversariais para fato inexistente, localização/cooldown inimigo, refs inexistentes,
> ordem direta, JSON inválido, categoria/confidence/expiry inválidos. Favorecer `shouldSpeak=false`
> com contexto insuficiente, baixa confiança, falta de benefício/ação, repetição, stale ou
> knowledge insuficiente.
>
> Definir prioridade máxima por categoria, cooldown global, cooldown por categoria, janela de
> deduplicação, tamanho máximo da fila e TTL. Revalidar sessão/evidência/expiry/cooldown antes do
> TTS. Criar `VoiceOutput` local/offline com listagem de vozes, volume, rate e cancelamento, e fila
> `IDLE`/`SPEAKING`/`CANCELING` com estados queued/spoken/expired/dropped. Nenhuma mensagem da
> partida A pode chegar à B.
>
> Adicionar configurações locais reais: coach ativado, status/modelo da IA, categorias visão,
> segurança, sobrevivência e farm/recursos, volume, velocidade, verbosidade e testar voz. Não
> mostrar funcionalidades inexistentes. Manter `LOCAL_AI_COACH_ENABLED=false` e
> `LIVE_VOICE_GUIDANCE_PUBLIC_RELEASE=false`; ativação é local e explícita; não republicar Desktop.
>
> Versionar o system prompt e exigir fatos aprovados, nenhuma inferência de inimigos/localização,
> knowledge genérico separado de estado, JSON apenas, silêncio quando incerto, opções em vez de
> ordens e nenhum número patch-sensitive fora do knowledge recebido. Usar baixa temperatura e
> estabilidade sem exigir string idêntica de modelo real.
>
> Modelo parado/lento/errado produz `AI_UNAVAILABLE` sem derrubar watcher, Desktop, partida,
> sessão ou teste de voz. Criar diagnóstico DEV-only sanitizado com estado da IA, última avaliação,
> latência, decisão, policy e fila, sem prompt, Riot ID, payload bruto, adversários ou segredos.
> Log local sanitizado é opt-in e não persiste Riot ID, prompt, snapshot, adversários; não criar
> aprendizado, accuracy rate, reward model, auto-training ou prompt auto-modificável.
>
> Validar automatizadamente situação/delta/heartbeat/stale/sessão; contexto pessoal; knowledge e
> mismatch; provider offline/timeout/JSON/silêncio/decisão/cancelamento; schema; policy; fila; TTS;
> privacidade e loopback. Monitorar que IA/TTS geram somente tráfego loopback e não rodam no thread
> do renderer. Depois, validar em Practice Tool e apenas documentar honestamente o que não pôde ser
> observado; não fabricar cenário real.
>
> Atualizar `AI_COACHING_CAPABILITIES` na matriz: live AI permanece `LOCAL_PROTOTYPE` e
> `NEEDS_RIOT_REVIEW_FOR_PUBLIC_RELEASE`; enemy tracking é `DO_NOT_USE`. Preparar, mas não enviar,
> texto para a Riot com endpoints exatos, natureza local, fatos próprios, ausência de cloud,
> tracking inimigo, inferência de fog, automação e distribuição.
>
> Não alterar Production Application, Riot ticket, Web API gates, RSO, site, Caddy, VPS, Resend,
> auth, recommendation engine, calibration, release ativa, replay, postgame, pregame ou semântica
> LCU. Não republicar Desktop. Encerrar com testes/typecheck/lint/build verdes, documentação fiel,
> commit/push em `main` e relatório completo de arquitetura, runtime/provider, contexto, knowledge,
> policy, composer, TTS/fila, privacy/rede/performance, validação real e limitações.

## Notas de implementação

- `0069` era o próximo número livre quando o trabalho começou.
- A auditoria inicial confirmou `REAL_GAME_TLS_VALIDATION=PASS`,
  `REAL_GAME_SWAGGER_COMPARISON=PASS` e `REAL_GAME_VALIDATION=PASS` no commit
  `8265bf44c4bdb85b2d78f59f50c5d6a748df81c0`.
- O bug `ENDED → UNAVAILABLE → CONNECTING → LIVE` foi corrigido e revalidado numa terceira partida
  real; a sessão nova recebeu identidade própria.
- A máquina não tinha runtime local de IA nem listener comum; nada foi instalado. Foi criado o
  provider Ollama fixo em `127.0.0.1:11434`, com modelo explicitamente configurado e estado
  `AI_UNAVAILABLE` quando ausente.
- O core recebeu contratos versionados, `LiveStateDelta`, contexto pessoal minimizado,
  conhecimento genérico versionado, schema estrito, policy gate e `PhraseComposer` sem texto livre
  vindo do modelo.
- O runtime Electron é single-flight/latest-only, cancela por sessão, mede p50/p95, usa timeout,
  heartbeat, fila bounded, prioridade, cooldowns, dedupe, TTL e revalida evidência antes do TTS.
- `WindowsSpeechVoiceOutput` usa `System.Speech` offline e stdin JSON. A validação real encontrou
  quatro vozes (três pt-BR), sintetizou WAV de 125.160 bytes e removeu a cópia temporária.
- Configurações locais e diagnóstico DEV-only foram adicionados por bridge IPC estreito, sem URL,
  prompt ou fetch arbitrário no renderer.
- `/playeritems` foi reclassificado para avaliação do jogador ativo, mas ficou **não consumido**:
  não havia Practice Tool para validar payload/IDs/cargas. `playerlist` continua `DO_NOT_USE`.
- Gates: `LOCAL_AI_COACH_ENABLED=false`, `LIVE_GUIDANCE_PUBLIC_RELEASE=false` e
  `LIVE_VOICE_GUIDANCE_PUBLIC_RELEASE=false`, mais dois opt-ins de desenvolvimento e toggle local
  OFF por padrão. Nenhum instalador foi republicado.
- Verificação: version check, Prisma generate, typecheck, lint, build, 1.543 testes TS/JS verdes
  (1 teste real opt-in ignorado por design) e 1 teste do analyzer verde. Os dois timeouts da
  primeira rodada paralela da API passaram com `--maxWorkers=1`.
- Relatório: `docs/local-ai-coaching-runtime.md`; mirrors e Capability Matrix atualizados. O texto
  para a Riot foi preparado, não enviado.
