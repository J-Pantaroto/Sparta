# Local AI Coaching Runtime (Etapa 31O.1)

**Data:** 2026-10-02

**Estado:** `LOCAL_AI_COACH_PROTOTYPE` · `NEEDS_RIOT_REVIEW_FOR_PUBLIC_RELEASE`

**Release pública:** `false`
**Instalador republicado:** não

## Resultado e limites

O Sparta agora possui a fundação de um coach contextual por voz estritamente local. Ela está
desligada por padrão, exige dois opt-ins de desenvolvimento e não pode ser habilitada no build de
produção. A IA seleciona **o que** merece atenção a partir de um contexto sanitizado; nunca recebe
acesso a ferramenta, shell, browser, filesystem, banco, LCU, Riot API ou Game Client API. A frase
falada é criada depois por código determinístico.

A máquina auditada não possui Ollama, LM Studio, llama.cpp, KoboldCpp ou outro servidor de modelo
local instalado/escutando. Nenhum software foi instalado. O provider foi implementado, mas o estado
real permanece `AI_UNAVAILABLE` até configuração explícita. O TTS offline do Windows foi validado.

Não há chatbot, overlay, ação no jogo, aprendizado, rating, ajuste automático de regra ou dado de
adversário.

## Auditoria do pré-requisito 31O

Os resultados já produzidos pela 31O foram conferidos antes da implementação:

- `REAL_GAME_TLS_VALIDATION=PASS`;
- `REAL_GAME_SWAGGER_COMPARISON=PASS`;
- `REAL_GAME_VALIDATION=PASS`;
- três Practice Tools reais, 197 snapshots, somente os quatro endpoints aprovados;
- ciclo `ENDED → UNAVAILABLE → CONNECTING → LIVE` corrigido e revalidado com novo `sessionId`;
- replay e arquitetura anterior não foram reabertos sem evidência.

Limitações herdadas continuam documentadas: a tela Electron de diagnóstico não foi aberta com dados
reais na 31O, e uma reconexão dentro da mesma partida não foi induzida.

## Arquitetura entregue

```text
Game Client API read-only
  → LiveGameSnapshot redigido
  → CoachingLiveFacts (segunda minimização)
  → LiveStateDelta
  → gatilho relevante ou heartbeat de 45 s
  → PersonalCoachingContext
  → PatchKnowledge versionado
  → LocalCoachingModel (Ollama em 127.0.0.1:11434)
  → CoachingDecision estruturada
  → Policy Gate determinístico
  → anti-spam/fila/TTL
  → PhraseComposer PT-BR determinístico
  → VoiceOutput offline do Windows
```

O watcher entrega ao runtime a mesma versão redigida que cruza o IPC. O Riot ID usado internamente
para consultar `/playerscores` é removido antes desse ponto. `CoachingLiveFacts` reduz novamente o
snapshot: tempo, nível, ouro, K/D/A, CS, ward score, razões de vida/recurso e referências opacas de
eventos. Nome de evento e identidade não entram no modelo.

## Runtime local escolhido

O adapter inicial é `OllamaLocalCoachingModel`:

- origem fixa no código: `http://127.0.0.1:11434`;
- endpoints locais: `GET /api/tags` e `POST /api/generate`;
- o renderer não escolhe URL, host, porta, path ou prompt;
- modelo somente por `SPARTA_LOCAL_AI_MODEL`, com nome estritamente validado;
- temperatura `0`, seed `31`, formato JSON, limite de saída, health timeout de 2 s, inferência
  timeout de 6 s e cancelamento;
- uma única repetição controlada quando a resposta é sintaticamente inválida;
- ausência do servidor/modelo degrada para `AI_UNAVAILABLE` e não afeta watcher, desktop ou teste
  de voz.

Modelo recomendado para a primeira validação manual: `qwen2.5:3b` em formato Ollama, pequeno e com
boa aderência a JSON/instruções multilíngues. É uma **recomendação de laboratório**, não um modelo
instalado, aprovado ou medido nesta execução. Qualquer troca preserva a interface
`LocalCoachingModel` e precisa repetir os testes de política, latência e estabilidade.

Setup explícito, fora do instalador:

```powershell
ollama pull qwen2.5:3b
$env:SPARTA_LIVE_CLIENT_PROTOTYPE = "1"
$env:SPARTA_LOCAL_AI_COACH = "1"
$env:SPARTA_LOCAL_AI_MODEL = "qwen2.5:3b"
pnpm dev:desktop
```

O Sparta não executa `ollama pull`, não instala runtime e não baixa modelo.

## Gatilhos, concorrência e custo

- Polling factual permanece em 1 s; isso **não** dispara inferência a cada poll.
- Mudanças relevantes: nova sessão, morte, nível, bloco de CS, ward score, variação material de
  vida/recurso ou evento novo.
- Heartbeat conservador: 45 s.
- Intervalo mínimo entre avaliações: 10 s.
- No máximo uma avaliação ativa; uma situação mais nova cancela a anterior.
- Toda resposta é vinculada ao `sessionId` capturado. Resposta tardia de sessão antiga é descartada.
- Timeout: 6 s.
- Término/troca de sessão cancela inferência, voz e fila.
- Métricas em memória: contagem, p50/p95, timeouts, rejeições, silêncio, falas, expirados e drops.

## Contexto pessoal

`PersonalCoachingContext` é derivado do `PlayerProfileOverview`, mas contém somente quatro dimensões:
visão, sobrevivência, farm e objetivos. Cada uma carrega estado, tamanho de amostra e cobertura:

- `RECURRING_CONCERN`;
- `NOT_OBSERVED`;
- `INSUFFICIENT_DATA` (menos de 3 partidas);
- `UNAVAILABLE`.

Não contém Riot ID, match IDs, partidas, campeões, adversários, texto livre de insight nem história
bruta. `NOT_OBSERVED` significa apenas que a regra não encontrou o sinal na amostra, nunca que o
problema não existe.

## Conhecimento do jogo

A base inicial `league-generic/1.0.0` tem quatro entradas pequenas e revisadas: janela segura de
visão, margem de segurança inicial, sobrevivência e farm/recursos. Cada item tem ID estável, fonte,
referência, data de revisão, versão, categorias e flag `patchSensitive`.

O runtime atual não injeta conhecimento sensível a patch. Se uma futura entrada for sensível, ela
só entra quando sua versão coincide com o patch da sessão; no mismatch permanecem apenas entradas
agnósticas. Não há conteúdo global de meta, matchup, build ou runas.

O contrato marca explicitamente as fontes como `LIVE_FACT`, `PERSONAL_HISTORY_FACT`,
`PATCH_KNOWLEDGE` e `GENERIC_KNOWLEDGE`; uma entrada de knowledge também carrega seu `kind`.

## Schema, política e linguagem

Uma decisão falável exige exatamente:

- `schemaVersion`, `shouldSpeak=true`, `sessionId`;
- categoria e prioridade permitidas;
- `confidence` finita de 0 a 1 (mínimo operacional 0,65);
- observação e até duas opções de enums fechados;
- `evidenceRefs` existentes no contexto;
- `knowledgeRefs` existentes na base enviada;
- `cooldownKey` restrita;
- TTL inteiro entre 1 s e 15 s.

Campo extra, JSON inválido, baixa confiança, referência inventada, categoria desligada, prioridade
acima do teto, incompatibilidade categoria/observação, sessão antiga ou TTL expirado resultam em
silêncio/drop. Visão, segurança inicial e farm têm prioridade máxima `NORMAL`; sobrevivência pode
chegar a `HIGH`.

O modelo não devolve texto falado. `PhraseComposer` mapeia enums para PT-BR curto, calmo e
opcional: “uma opção é”, “se estiver segura”, “pode ser o foco”. Não existe template para “warde
agora”, “recue”, “invada”, “vá dragão”, “ganke”, “faça recall” ou “compre X”.

## Anti-spam e voz

- cooldown global: 12 s;
- cooldown por categoria: 30 s;
- deduplicação por chave: 90 s;
- fila máxima: 3;
- TTL revalidado imediatamente antes do TTS;
- estados: `IDLE`, `SPEAKING`, `CANCELING` (contrato; cancelamento volta a `IDLE`);
- eventos: `queued`, `speaking`, `spoken`, `expired`, `dropped`;
- fila e áudio são limpos ao trocar/encerrar sessão.

`WindowsSpeechVoiceOutput` usa `System.Speech.Synthesis` local. Texto e opções chegam ao processo
filho por stdin JSON, nunca por interpolação de comando. Há listagem de vozes, volume, velocidade,
seleção e cancelamento. A máquina ofereceu quatro vozes, três em `pt-BR` (Microsoft Maria Desktop,
Microsoft Daniel e Microsoft Maria) e uma `en-US` (Microsoft Zira Desktop). Uma síntese real para
WAV gerou 125.160 bytes e a cópia temporária foi removida.

## Exemplos sanitizados

Entrada resumida:

```json
{
  "sessionId": "live-example",
  "live": { "gameTimeSeconds": 420, "wardScore": 0, "healthRatio": 0.78 },
  "personal": { "vision": { "state": "RECURRING_CONCERN", "sampleSize": 12, "coverage": 1 } },
  "evidenceRefs": ["live.gameTimeSeconds", "live.wardScore", "live.healthRatio"]
}
```

Saída estruturada aceita:

```json
{
  "schemaVersion": "coaching-decision/1.0.0",
  "shouldSpeak": true,
  "sessionId": "live-example",
  "category": "VISION",
  "priority": "NORMAL",
  "confidence": 0.86,
  "observation": "VISION_WINDOW",
  "options": ["ESTABLISH_VISION_WHEN_SAFE"],
  "evidenceRefs": ["live.wardScore"],
  "knowledgeRefs": ["generic.vision.safe-window.v1"],
  "cooldownKey": "vision.safe-window",
  "ttlMs": 5000
}
```

Frase determinística: “Há uma possível janela de visão, se estiver segura. Uma opção é estabelecer
visão quando houver segurança.”

Silêncio: contexto insuficiente; modelo ausente; modelo devolve JSON estrito com
`shouldSpeak=false`; confidence baixa; ref inexistente; regra repetida/cooldown; contexto expirado;
sessão trocada; categoria desligada.

## Validação real desta etapa

| Verificação                                | Resultado                                                   |
| ------------------------------------------ | ----------------------------------------------------------- |
| Runtime/modelo local instalado             | `AI_UNAVAILABLE` — nenhum servidor encontrado               |
| League/Game Client ativo e `:2999` ouvindo | `PENDING` — nenhum processo/listener durante a execução     |
| TTS offline real                           | `PASS` — 4 vozes, WAV real de 125.160 bytes                 |
| Pipeline com provider simulado             | `PASS`                                                      |
| Practice Tool + inferência real            | `PENDING`                                                   |
| `/playeritems` em partida real             | `PENDING`                                                   |
| Latência p50/p95 de modelo real            | `PENDING`                                                   |
| CPU/RAM em partida real                    | `PENDING`                                                   |
| Network capture do fluxo completo          | `PENDING`; o código limita IA a loopback e TTS não usa rede |

Nenhum número real de modelo ou partida foi inventado. O painel DEV expõe somente diagnósticos
sanitizados e métricas em memória; nunca prompt integral, identidade, inimigos, tokens ou secrets.

## `/playeritems` e trinkets

O endpoint foi reavaliado como `LOCAL_AI_COACH_PROTOTYPE` somente quando restrito ao Riot ID do
jogador ativo, mas **não foi ativado** nesta execução. Sem Practice Tool não foi possível validar
`itemID`, `displayName`, `slot`, `count` e `canUse` contra payload real nem conferir os IDs com o
catálogo Riot/Data Dragon. Portanto:

- nenhuma semântica foi atribuída a `count`;
- nenhum estado de carga foi inferido;
- nenhum trinket foi classificado como `WARDING_TRINKET`, `FARSIGHT_TRINKET` ou `ORACLE_LENS`;
- o runtime continua usando apenas `wardScore` factual e conhecimento genérico;
- `playerlist` permanece proibido e não chamado.

## Capability Matrix — AI_COACHING_CAPABILITIES

| Capacidade                                       | Estado                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| Coaching próprio por fatos já visíveis           | `LOCAL_AI_COACH_PROTOTYPE` / `NEEDS_RIOT_REVIEW_FOR_PUBLIC_RELEASE` |
| TTS local de frases determinísticas              | `LOCAL_AI_COACH_PROTOTYPE` / `NEEDS_RIOT_REVIEW_FOR_PUBLIC_RELEASE` |
| `/playeritems` somente do jogador ativo          | `PENDING_REAL_VALIDATION` / `NEEDS_RIOT_REVIEW_FOR_PUBLIC_RELEASE`  |
| Cooldown/posição/item timing/intenção de inimigo | `DO_NOT_USE`                                                        |
| Jungle path, fog, wards ocultas ou gank previsto | `DO_NOT_USE`                                                        |
| Ação, comando, overlay ou automação no jogo      | `DO_NOT_USE`                                                        |

## Texto preparado para a Riot — não enviado

> O Sparta GG está avaliando um protótipo local, desabilitado por padrão e não distribuído, de
> coaching por voz para o próprio jogador. O protótipo lê exclusivamente por HTTPS local os
> endpoints `/liveclientdata/gamestats`, `/liveclientdata/activeplayer`,
> `/liveclientdata/playerscores?riotId=<ACTIVE_PLAYER_RIOT_ID>` e `/liveclientdata/eventdata`.
> Avaliamos também `/liveclientdata/playeritems?riotId=<ACTIVE_PLAYER_RIOT_ID>`, ainda não ativado,
> somente para itens/trinket do jogador ativo após validação de schema em partida real. Não usamos
> `/playerlist`, `/allgamedata` nem dados de adversários. O processamento de IA e TTS é inteiramente
> local, sem transmissão a terceiros; a IA recebe um contexto sanitizado e não tem ferramentas nem
> acesso direto às APIs. A saída passa por schema e policy gate determinísticos, sem comandos,
> ações no cliente, overlay, tracking de cooldown/posição inimiga ou informação escondida. Podemos
> submeter detalhes adicionais antes de considerar qualquer distribuição pública.

## Gates e como desligar

- `LIVE_GUIDANCE_PUBLIC_RELEASE=false`;
- `LIVE_VOICE_GUIDANCE_PUBLIC_RELEASE=false`;
- `LOCAL_AI_COACH_ENABLED=false`;
- ambiente de desenvolvimento;
- `SPARTA_LIVE_CLIENT_PROTOTYPE=1`;
- `SPARTA_LOCAL_AI_COACH=1`;
- opt-in local do usuário nas configurações (default `false`).

Remover qualquer variável, desligar a opção, encerrar a partida ou deixar o modelo indisponível
interrompe o pipeline. O instalador público não satisfaz os gates. Nenhum serviço de produção,
RSO, site, VPS, Caddy, Resend, motor de recomendação, calibração, replay, pré-game ou pós-game foi
alterado.
