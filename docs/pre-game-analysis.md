# Análise pré-game

Motor: `packages/core/src/draft/pre-game-analysis.ts` (`generatePreGameAnalysis`, puro).
Rota: `POST /drafts/pre-game-analysis` (autenticada). Tela: `features/PreGameScreen.tsx`.

Versão do algoritmo: `PRE_GAME_ANALYSIS_VERSION`, exposta em `algorithmVersion` na resposta.

## Etapa 15 — motor estratégico compartilhado

A composição e a resposta a ameaças agora vêm de `analyzeDraftStrategy`, o
mesmo motor usado no ranking. `ChampionCapabilityProfile` é a fonte principal;
`ChampionTag` fica restrita aos fallbacks genéricos explicitamente suportados.
As seções desta resposta são projeções dos sinais estruturados em
`strategicAnalysis`; não existe um segundo cálculo de composição no fluxo
atual da API. A descrição completa, relações versionadas e fórmulas estão em
`docs/draft-strategic-analysis.md`.

O restante deste documento descreve também a borda compatível usada apenas
quando um chamador anterior não fornece `championCapabilityProfiles`.

## O que a análise responde

> O que os dados atuais permitem dizer sobre o campeão escolhido dentro deste draft?

Ela **não** responde "qual é a estratégia perfeita pra vencer esta partida". Toda afirmação é
proporcional à evidência disponível: com dois inimigos revelados, a leitura diz o que dá pra ler
de dois inimigos — e diz que são dois.

## Fontes e proveniência

| Sinal | Origem | Proveniência declarada |
|---|---|---|
| Aliados, inimigos, banimentos, campeão escolhido | Sessão do champion select (LCU) ou escolha manual | `OBSERVED` / `USER_PROVIDED` conforme `draft.playerRoleSource` |
| Dimensões de composição (frontline, engage, peel, wave clear, pickoff, escalamento, pressão inicial) e perfil de dano | Tabela `ChampionTag`, gerada por `champion-tags:generate` a partir das classes e notas da Data Dragon | `DERIVED` |
| Desempenho pessoal no confronto | `MatchParticipant` do próprio jogador, agregado por `aggregateMatchupData` | `CALCULATED`, com `sampleSize` |
| Nomes de campeão | Catálogo `Champion` (Data Dragon) | — (resolução, não sinal) |

`ChampionTag` **nunca** é apresentada como estatística oficial da Riot. O texto usa "indica",
"sugere", "apresenta perfil de"; nunca afirmação categórica.

## Dimensões avaliadas

`frontline`, `engage`, `peel`, `waveclear`, `pickoff`, `scaling`, `earlyPressure`, mais o perfil
de dano (AD/AP/equilibrado/pouco dano identificado).

Uma dimensão só vira sinal quando cruza um limiar: `>= 55` é tratada como presente entre os
campeões conhecidos, `<= 35` como ausente. A faixa do meio não gera frase — descrever "45 de
100 de iniciação" não diria nada ao jogador.

O perfil de dano só é classificado com **3 ou mais** campeões com tag: com um campeão conhecido,
"concentrada em dano físico" seria só a descrição dele mesmo.

## Composição aliada: o jogador entra uma vez

`draft.allies` **não** inclui o próprio jogador (contrato da Fase 16). O motor monta a
composição aliada como `allies + campeão selecionado`, exatamente uma vez, e mantém uma segunda
leitura **sem** o jogador pra poder dizer o que a escolha dele acrescenta.

"Necessidade atendida" compara a média **sem** o jogador com o valor do **próprio campeão** — não
com a média incluindo ele. Comparar as duas médias tornaria esse sinal impossível: com um aliado
em 0 e o jogador em 100, a média é 50, abaixo do limiar de presença.

## Draft parcial

Draft incompleto é estado natural, não erro. A linguagem muda conforme a cobertura:

- Time completo: "A composição apresenta pouca linha de frente."
- Time incompleto: "Linha de frente ainda não foi identificada entre 2 dos 5 campeões conhecidos."

O status do sinal é `PARTIAL` enquanto o time não fechou, e `AVAILABLE` quando fechou. Nenhuma
seção afirma que a composição "não possui" um recurso com picks ainda desconhecidos.

Quando nenhum campeão do lado analisado tem tag, a seção inteira fica `UNAVAILABLE` com o motivo —
não `0` em toda dimensão. É a diferença explícita entre `analyzeTeamComposition` (motor de
recomendação, onde o zero alimenta um score e nunca é exibido) e este motor, onde o zero viraria
uma frase falsa.

## Confronto direto

Só existe quando o adversário da posição foi identificado (`draft.enemyLaneChampionId`). Nenhum
inimigo é escolhido arbitrariamente como oponente de rota.

- Com histórico pessoal: valor, tamanho da amostra, confiança e proveniência `CALCULATED`. O texto
  diz "nas **suas** partidas" — nunca é apresentado como tendência global.
- Sem histórico pessoal: `UNAVAILABLE` com o motivo, sem valor neutro artificial. Um `50` só
  aparece quando foi **calculado** a partir de amostra real.

## Cobertura dos dados

`dataCoverage` é a fração dos sinais esperados que existem de fato. **Não é confiança estatística
nem probabilidade de vitória** — é quanto do draft e das tabelas o Sparta conseguiu ler.

| Componente | Peso | Como entra |
|---|---|---|
| `campeaoSelecionado` | 0,10 | Pré-requisito, sempre presente quando a análise roda |
| `posicao` | 0,10 | Pré-requisito, sempre presente |
| `perfilDoCampeao` | 0,10 | Tudo ou nada: existe `ChampionTag` do campeão escolhido |
| `aliadosRevelados` | 0,20 | Proporcional aos 4 companheiros |
| `inimigosRevelados` | 0,20 | Proporcional aos 5 inimigos |
| `adversarioDireto` | 0,20 | Tudo ou nada: habilita a seção de confronto inteira |
| `matchupPessoal` | 0,10 | Tudo ou nada: existe amostra do jogador neste confronto |

É **independente** da confiança do matchup pessoal: uma amostra de 2 partidas e uma de 40 produzem
a mesma cobertura, porque cobertura é sobre existir dado, não sobre quanto ele vale.

## Pré-requisitos e erros

| Situação | Resposta |
|---|---|
| Posição não identificada | `422` `PLAYER_ROLE_UNAVAILABLE` |
| Nenhum campeão confirmado | `422` `SELECTED_CHAMPION_UNAVAILABLE` |
| Campeão confirmado fora do catálogo real | `422` `SELECTED_CHAMPION_UNAVAILABLE` |
| Poucos aliados/inimigos revelados | `200` com análise parcial e limitações explícitas |

Os dois primeiros são avaliados **antes** de qualquer consulta ao banco.

## Geração de texto

Determinística: fragmentos e templates sobre sinais calculados. Sem LLM, sem API de IA, sem
serviço externo, sem aleatoriedade. `now` entra como parâmetro justamente pra o mesmo input
produzir exatamente a mesma saída.

## O que fica deliberadamente fora do modelo

Estes sinais aparecem em `unavailableSignals`, com o motivo, sempre:

- `GLOBAL_MATCHUP` — o Sparta não tem fonte global de matchup. O histórico do jogador **não** é
  usado pra preencher isso.
- `META_STRENGTH` — não há Meta Intelligence observada para o patch.
- `CHAMPION_INTERACTIONS` — interações concretas entre habilidades (travar investida, encadear
  controle de grupo, punir determinado tipo de campeão) exigiriam um modelo estruturado de
  habilidades que não existe. Enquanto não existir, a conclusão fica indisponível em vez de virar
  texto convincente.

## Limitações conhecidas da `ChampionTag`

A tabela cobre os 173 campeões desde a Fase 15, mas é **derivada** das classes e notas da Data
Dragon: duas Marksman recebem o mesmo perfil, e campeão fora do arquétipo (Senna, Pyke, Ivern)
fica genérico. Entradas refinadas à mão são marcadas `"source": "manual"` em
`data/seeds/champion-tags.json` e sobrevivem à regeneração.

## Compatibilidade com API anterior

Desktop e API são implantados separadamente. Uma API anterior a esta etapa responde as quatro
listas de frases fixas antigas (`allyStrengths`, `winCondition`…). O cliente reconhece esse
formato num único lugar (`fetchPreGameAnalysis`, em `services/api-client.ts`) e o **recusa**:
a tela mostra "Análise contextual indisponível nesta versão da API". Apresentar aquelas frases
seria exibir texto genérico como se fosse análise do draft atual. Não existem dois motores — o
formato antigo não é traduzido, é rejeitado.
