---
status: IMPLEMENTADA
solicitado_em: 2026-07-26 18:20
implementado_em: 2026-07-27 14:20
---

# Pré-game real e derivado do draft atual

## Pedido original

> # ETAPA 7 — Tornar o pré-game real e derivado do draft atual
>
> ## Contexto
>
> A rota `POST /drafts/pre-game-analysis` ainda retorna conteúdo estático, independente do draft
> real. O desktop também apresenta uma orientação geral fixa, que não reage a campeão escolhido,
> posição, aliados, inimigos revelados, adversário direto, composição incompleta, matchup pessoal
> disponível, métricas indisponíveis nem cobertura dos dados.
>
> O Sparta já possui draft real importado do LCU, posição sem fallback artificial para MID,
> `ChampionTag` para o catálogo, motor de composição existente, métricas com origem/
> disponibilidade/confiança, matchup pessoal separado do global, meta explicitamente
> indisponível, normalização de pesos e `dataCoverage`, e componentes de interface para dados
> disponíveis, parciais, desatualizados e indisponíveis.
>
> Esta etapa deve substituir o pré-game estático por uma análise determinística e explicável,
> derivada somente dos dados realmente disponíveis.
>
> ## Objetivo
>
> Implementar um pré-game real que analise o campeão confirmado dentro do contexto atual da
> partida, considerando quando disponível: campeão escolhido, posição, adversário direto, matchup
> pessoal, aliados e inimigos revelados, encaixe com os aliados, resposta ao time inimigo,
> necessidades atendidas e não atendidas, ameaças gerais da composição inimiga, distribuição de
> dano, engage, peel, frontline, wave clear, pickoff, escalamento e cobertura dos dados.
>
> O pré-game não deve repetir sempre as mesmas frases, inventar informação ausente, tratar
> inferência como fato oficial, transformar `50` em ausência ou ausência em `50`, usar matchup
> pessoal como global, tratar buff/nerf como força no meta, produzir análise completa com draft
> parcial, dar instruções categóricas com sinais frágeis, nem fazer afirmações específicas sobre
> interações entre campeões sem modelo que as sustente.
>
> ## Princípio central
>
> O pré-game deve responder "o que os dados atuais permitem dizer sobre o campeão escolhido
> dentro deste draft?", não "qual é a estratégia perfeita para vencer esta partida?". A análise
> deve ser proporcional à evidência disponível.
>
> Aceitável: "Sua escolha adiciona wave clear e controle de espaço à composição. O time inimigo já
> revelou engage elevado, mas ainda há poucos campeões conhecidos para avaliar a resposta completa
> ao draft." Não aceitável sem modelo: "Nautilus, Rammus e Renekton necessariamente impedirão
> todas as entradas do Yasuo."
>
> ## Auditoria inicial obrigatória
>
> Localizar a rota atual, todas as frases estáticas, a orientação fixa do desktop, o contrato de
> `PreGameAnalysis`, seus produtores e consumidores; avaliar `analyzeTeamComposition`, quais
> dimensões calcula, quais dependem de `ChampionTag`, qualquer contagem duplicada do campeão do
> jogador; confirmar que o jogador continua fora de `draft.allies` e entra na composição uma única
> vez; identificar campos com valores fixos, fallback ou suposições não sustentadas. Registrar as
> conclusões antes de implementar. Não presumir que uma função existente é correta só porque
> existe. Não ampliar o escopo para reescrever o motor de recomendação.
>
> ## Contrato estruturado
>
> Substituir a resposta baseada em frases por um contrato estruturado com `status`,
> `dataCoverage`, `selectedChampion`, `summary`, seções (`laneContext`, `alliedComposition`,
> `enemyComposition`, `selectedChampionFit`, `knownRisks`), `unavailableSignals`, `generatedAt` e
> `algorithmVersion`. Cada sinal deve suportar `key`, `title`, `description`, `status`, `tone`,
> `strength`, `confidence`, `provenance`, `evidence` e `unavailableReason`. Não devolver só arrays
> de strings sem origem ou status.
>
> ## Geração de texto
>
> Determinística. Sem LLM, API de IA ou serviço externo. Fragmentos e templates são permitidos
> para transformar sinais reais em linguagem natural — diferente de retornar a mesma frase
> independentemente do draft. As frases devem ser geradas a partir de sinais calculados, informar
> limitações com draft incompleto, evitar certezas sem fonte, manter português claro, evitar
> jargão e aconselhamento genérico, e ser estáveis para o mesmo input.
>
> ## Fontes e proveniência
>
> Draft do LCU mantém origem observada; entradas manuais permanecem `USER_PROVIDED`. Sinais de
> `ChampionTag` devem ser identificados como derivados/inferidos conforme a origem real, nunca
> como estatística oficial da Riot; quando derivados da Data Dragon, informar a derivação, não
> atribuir confiança estatística inexistente, usar linguagem como "indica"/"sugere"/"apresenta
> perfil de" e evitar frases categóricas. Matchup pessoal disponível pode informar o desempenho
> pessoal no confronto com amostra e origem, nunca como tendência global; indisponível mostra o
> motivo sem frase neutra artificial. Matchup global e meta continuam indisponíveis, informados em
> detalhes complementares sem poluir o resumo.
>
> ## Análise do adversário direto
>
> Com adversário identificado: incluir o contexto do confronto, usar matchup pessoal só com
> amostra válida, informar quando não houver histórico pessoal, não afirmar favorabilidade global,
> não usar dados do jogador para preencher `GLOBAL_MATCHUP`. Sem adversário identificado: seção
> `UNAVAILABLE`/`PARTIAL` explicando que o oponente não foi revelado, sem escolher arbitrariamente
> um inimigo. Para jungle, usar o jungler inimigo só se a posição dele for realmente conhecida.
> Não inferir função global por classe da Data Dragon.
>
> ## Composição aliada
>
> Analisar somente aliados conhecidos mais o campeão selecionado, que entra exatamente uma vez.
> Pode descrever engage, peel, frontline, wave clear, pickoff, escalamento, perfil de dano,
> necessidades atendidas e ausentes. A linguagem deve considerar quantos aliados estão revelados.
> Não dizer que a composição "não possui" um recurso quando ainda há picks desconhecidos —
> preferir "ainda não foi identificado", "entre os campeões conhecidos", "o draft revelado até
> agora", "não há evidência suficiente neste momento".
>
> ## Composição inimiga
>
> Analisar apenas inimigos revelados: engage, frontline, pickoff, peel, escalamento, e alcance ou
> perfil de dano só se já houver dimensão estruturada que suporte. Não criar tabela manual de
> interações entre campeões nem inventar conceitos como hard CC lock, anti-dash, supressão,
> punição contra ataque físico ou contra corpo a corpo — exigem um modelo estruturado de
> habilidades ainda não implementado. Quando a modelagem atual não sustentar a conclusão, mantê-la
> indisponível.
>
> ## Encaixe do campeão selecionado
>
> Explicar o que o campeão acrescenta ao time conhecido: recursos que adiciona, necessidades que
> ajuda a atender, recursos ainda ausentes, dependências, riscos gerais e compatibilidade. Não
> transformar o score agregado em explicação genérica; usar os componentes individuais.
>
> ## Estado parcial e cobertura
>
> Cobertura objetiva, considerando sinais esperados e realmente disponíveis, sem ser chamada de
> confiança estatística: campeão conhecido, posição conhecida, aliados e inimigos revelados,
> adversário direto, tags disponíveis, matchup pessoal, métricas de composição. Documentar
> componentes e pesos. Independente da confiança de matchup ou desempenho pessoal. Não apresentar
> como probabilidade de vitória.
>
> ## Requisitos para executar
>
> Exige campeão selecionado válido e posição válida. Sem campeão: `SELECTED_CHAMPION_UNAVAILABLE`,
> HTTP `422`. Sem posição: `PLAYER_ROLE_UNAVAILABLE`, HTTP `422`. Sem aliados ou inimigos
> suficientes: não retornar erro, gerar análise parcial com limitações explícitas.
>
> ## API
>
> Validar payload, resolver campeões pelo catálogo real, carregar tags, carregar matchup pessoal
> quando aplicável, executar o motor puro do domínio, retornar contrato estruturado, sem frases
> estáticas, sem fonte externa nova, sem seed fictício e sem valores aleatórios. Manter a lógica
> em `packages/core`; a rota orquestra, não concentra regras.
>
> ## Compatibilidade
>
> Adapter central para resposta antiga, que não deve apresentar as frases estáticas como análise
> real — preferir "Análise contextual indisponível nesta versão da API". Campo legado, se
> necessário, gerado a partir da nova análise, sem manter dois motores. Não espalhar checagens
> pelos componentes.
>
> ## Interface
>
> Consumir o contrato estruturado, organizando resumo da escolha, encaixe com o time, ameaças
> conhecidas, contexto do confronto, sinais indisponíveis e cobertura. Cada seção mostra só o
> relevante, diferencia positivo/neutro/atenção, indica parcialidade, evita repetição e evita oito
> cards com o mesmo peso visual. Remover a orientação fixa atual — não manter simultaneamente
> análise real e orientação estática. Draft incompleto é estado natural, não erro técnico. Manter
> o design system.
>
> ## Persistência
>
> Não implementar nesta etapa. Não criar `DraftSession`/`PickRecommendation` só para armazenar.
>
> ## Fora do escopo
>
> Matchup global; Meta Intelligence; Patch Intelligence; API externa; builds ou runas; base manual
> de counters; modelo completo de habilidades; tipos específicos de CC; anti-dash/anti-melee;
> alterar `ChampionTag` campeão a campeão; recalibrar pesos; alterar o pool; cinco recomendações;
> refatorar o motor de recomendação; persistir drafts; alterar participação em objetivos; alterar
> o fluxo de posição; LLM; probabilidade de vitória; instruções durante a partida; automação no
> League Client.
>
> ## Testes mínimos
>
> 40 casos, cobrindo determinismo; erros estruturados sem campeão e sem posição; seções parciais
> sem aliados/inimigos; draft incompleto não descrito como completo; campeão do jogador contado
> uma vez; alterar aliado/inimigo muda os sinais; remover inimigo reduz cobertura; adversário
> direto conhecido/desconhecido; matchup pessoal com amostra, ausente, e nunca apresentado como
> global; matchup global e meta indisponíveis; `ChampionTag` derivado não é estatística oficial;
> campo ausente sem frase categórica; sinal parcial com linguagem de parcialidade; cobertura não
> chamada de confiança nem de chance de vitória; sem `NaN`/`Infinity`; nenhuma frase fixa antiga;
> a rota usa o motor de domínio e não consulta API nova; resposta antiga não vira análise real;
> desktop renderiza disponível/parcial/indisponível, não exibe a orientação antiga, e o estado
> vazio não quebra; resposta atrasada de draft anterior não substitui a atual; troca de campeão ou
> posição invalida a análise; etapas anteriores intactas; consumidores tipados.
>
> ## Validação real
>
> Usar somente conta real vinculada, catálogo real, tags atuais, histórico real persistido, draft
> do LCU quando disponível, e o modo manual com campeões reais sem inserir registros falsos.
> Validar no Electron real: campeão e posição com draft incompleto; alterar aliado e inimigo
> mudando a análise; adversário direto revelado e não revelado; matchup pessoal disponível e
> indisponível; troca de campeão e de posição invalidando a análise anterior; nenhum
> `NaN`/`Infinity`/`undefined`/texto técnico visível. Registrar a limitação caso o LCU real não
> esteja disponível; fixtures sintéticas só em teste automatizado.

## Auditoria (feita antes de implementar)

1. **A rota** (`apps/api/src/modules/drafts/routes.ts`) era
   `app.post("/drafts/pre-game-analysis", async () => ({ ... }))` — **sem `request`**, sem parse
   de payload, sem consulta. Quatro listas de frases fixas (`allyStrengths`, `allyWeaknesses`,
   `enemyThreats`) mais `winCondition` e `realtimeAssistance: false`. Idênticas em toda partida.
2. **Não existia nenhum tipo `PreGameAnalysis`** no repositório — nem em `domain.ts`, nem no
   desktop, nem em `docs/`. Nenhum produtor, nenhum consumidor tipado.
3. **`analyzeTeamComposition`** (`recommendation-engine.ts`) calcula `frontline`, `engage`,
   `peel`, `waveclear`, `pickoff`, `scaling`, `earlyPressure` e `damageBalance`, todos
   dependentes de `ChampionTag`. Achado que definiu o desenho: seu `average` devolve **`0`**
   quando `tags.length === 0`, e `damageBalance` vira `"LOW_DAMAGE"`. Ali o zero alimenta um
   score e nunca é exibido; num texto pré-game ele viraria "o time não tem linha de frente" com
   zero campeões conhecidos. **Decisão: não reusar essa função.** O motor novo usa
   `summarizeKnownComposition`, que deixa a dimensão **ausente** em vez de zero. Nenhuma linha
   do motor de recomendação foi alterada.
4. **Contagem do jogador**: confirmado que `deriveDraftSnapshot` (Fase 16) mantém o próprio
   jogador **fora** de `draft.allies`, e que `analyzeTeamComposition` injeta o candidato uma
   única vez (`candidate`). O motor novo segue a mesma regra: `[...allyNames, selectedChampionName]`.
5. **Desktop**: `PreGameScreen.tsx` tinha um `<Card tone="flat">` com "Orientação geral" /
   "Prioridades da partida" e três `SignalChip` fixos, mais uma frase explicando que a rota do
   backend era estática. O resto da tela (splash, vagas inimigas, barras de dano) já era real,
   derivado no cliente via `summarizeEnemyDamageLean`.

## Notas de implementação

### Bug real encontrado (pelo teste, não pela leitura)

`fit_fills_gap` ("necessidade atendida") comparava a média da composição **com** o jogador
contra a média **sem** ele. Matematicamente impossível de disparar: com um aliado em 0 e o
jogador em 100, a média é 50, abaixo do limiar de presença (55); com mais aliados, pior.
Passou a comparar a média sem o jogador com o **valor do próprio campeão**, que é a pergunta
real ("o time não tinha isso, minha escolha traz").

### Decisões de contrato

- `AnalysisSignal.strength` e `.confidence` são `number | null`. Sinal `UNAVAILABLE` sai com os
  dois em `null` e `unavailableReason` preenchido — o invariante "indisponível não tem número"
  vale aqui como já valia em `RecommendationMetric` (Etapa 2).
- Limiares: dimensão `>= 55` é presente, `<= 35` é ausente, faixa do meio **não gera frase**.
- Perfil de dano só com 3+ campeões com tag: com 1, "concentrada em dano físico" descreveria o
  próprio campeão, não a composição.
- Cobertura com pesos explícitos em `coverageBreakdown` (somam 1). Times entram
  proporcionalmente (2 de 4 aliados = metade do peso), adversário direto e matchup pessoal são
  tudo-ou-nada. Independente da confiança do matchup — testado.
- Campeão confirmado fora do catálogo real também responde `SELECTED_CHAMPION_UNAVAILABLE`:
  analisar exigiria inventar um nome, e o motor casa `ChampionTag` por nome.

### Compatibilidade

`fetchPreGameAnalysis` (desktop) detecta a resposta antiga por ausência de `algorithmVersion`/
`summary` e a **recusa** com `PreGameAnalysisIncompatibleError` ("Análise contextual indisponível
nesta versão da API"). O formato antigo não é traduzido para o novo — não existem dois motores.
`ApiError` ganhou `payload` pra o cliente ler o `code` estruturado do `422`.

### Testes

58 novos, 391 no total:

- `packages/core/src/draft/pre-game-analysis.test.ts` — 37: pré-requisitos, determinismo,
  ausência de `NaN`/`Infinity`, draft parcial vs completo, jogador contado uma vez, reação a
  troca de aliado/inimigo, cobertura, confronto direto (com/sem amostra, 50 calculado, nunca
  global), proveniência `DERIVED`, linguagem sem conceitos não modelados, ausência das frases
  estáticas antigas, encaixe e riscos.
- `apps/api/src/modules/drafts/routes.test.ts` — 8: autenticação, os dois `422` antes de
  qualquer consulta, campeão fora do catálogo, contrato estruturado sem os campos antigos,
  matchup pessoal consultado só com adversário direto, análise parcial em vez de erro.
- `apps/desktop/src/renderer/src/features/PreGameScreen.test.tsx` — 13: renderização de
  disponível/parcial/indisponível, ausência da orientação antiga, estado vazio, erro legível,
  resposta atrasada não exibida como atual, refazer a análise ao trocar campeão ou posição,
  nenhum `NaN`/`undefined` no DOM.

### Limites da validação

A validação real cobriu a API real e o app Electron real com a conta Zekerus#117 em modo
manual. **Não validado**: a análise disparada por um champion select de verdade em andamento —
depende do cliente do League aberto, mesmo limite das Fases 6c, 11, 16 e da Etapa 6. Os estados
que dependem de tags ausentes ou de amostra de matchup inexistente estão cobertos por teste.
