---
status: IMPLEMENTADA
solicitado_em: 2026-07-26 09:10
implementado_em: 2026-07-26 11:55
---

# Ausência versus zero nas estatísticas

## Pedido original

> # ETAPA 4 — Corrigir ausência versus zero nas estatísticas
>
> ## Contexto
>
> As Etapas 2 e 3 criaram o contrato de proveniência e disponibilidade, removeram os valores
> neutros falsos de matchup e meta e passaram a normalizar pesos de métricas indisponíveis.
>
> A próxima inconsistência identificada na auditoria é a possibilidade de dados ausentes serem
> convertidos para `0`.
>
> O valor zero pode significar duas coisas completamente diferentes:
>
> 1. Um resultado real: zero mortes; zero abates; zero participação em objetivos; zero
>    diferença de ouro; zero wards; zero dano em uma categoria realmente observada.
> 2. Ausência de informação: campo não fornecido pela Riot; timeline indisponível; dado não
>    suportado em um patch antigo; denominador inexistente; nenhuma partida válida; cálculo
>    ainda não executado; amostra sem observações utilizáveis.
>
> Esses casos não podem ser semanticamente nem visualmente iguais.
>
> ## Objetivo
>
> Auditar e corrigir o fluxo completo de estatísticas para garantir que: zero legítimo continue
> sendo zero; informação ausente permaneça `null` ou `undefined`; nenhuma ausência seja
> silenciosamente convertida em zero; percentuais sem denominador válido sejam indisponíveis;
> agregações usem apenas observações válidas; agregações parcialmente preenchidas sejam
> identificadas como parciais; a API preserve a distinção; a interface mostre indisponibilidade
> em vez de `0`; os cálculos existentes que realmente produzem zero não sejam alterados
> indevidamente.
>
> Não faça uma substituição genérica de todos os zeros por `null`. Cada campo deve ser analisado
> conforme sua origem e significado.
>
> ## Auditoria obrigatória
>
> Antes de alterar o código, localize os pontos onde valores estatísticos são lidos dos payloads
> da Riot, mapeados para o domínio, calculados a partir da timeline, persistidos pelo Prisma,
> agregados em estatísticas do jogador, expostos pela API, consumidos pelo desktop, ou
> transformados por operadores equivalentes a `?? 0`, `|| 0`, `Number(value) || 0`, valores
> padrão em schemas, médias com coleção vazia, divisões com denominador zero, fallbacks
> numéricos em adapters.
>
> Documente no arquivo da feature os campos relevantes encontrados e a decisão tomada para cada
> um. Não trate todo uso de `?? 0` como bug automaticamente.
>
> ## Regras semânticas
>
> Zero legítimo: a fonte informou explicitamente zero; ou o cálculo foi realizado sobre entradas
> válidas e o resultado real foi zero.
>
> Dado indisponível: não está presente no payload; não existe no patch ou formato daquela
> partida; a timeline não foi obtida; a partida não possui dados suficientes; o cálculo depende
> de informações ausentes; a coleção não contém nenhuma observação válida; o denominador
> necessário é zero ou desconhecido; a métrica ainda não foi implementada.
>
> Percentuais: time com 10 abates e jogador com 0 participações → `0` real. Time com 0 abates →
> indisponível. Abates do time não disponíveis → indisponível. Kills e assists ausentes →
> indisponível. Não alterar a fórmula de KDA, exceto se houver conversão de ausência em zero
> antes da fórmula.
>
> Agregações: considerar apenas observações disponíveis; registrar quantas foram utilizadas; não
> dividir pelo total quando algumas partidas não possuem o campo; nenhuma observação válida →
> indisponível; parte com dado e parte sem → `PARTIAL` quando exposto por contrato que suporte
> disponibilidade. Quando aplicável, expor `sampleSize`, `availableSampleSize`, status e motivo
> da parcialidade. Não inventar confiança apenas com base nesses dois números.
>
> ## Escopo técnico
>
> DTOs e mappers de Match-V5 e timeline; `MatchParticipant`; `MatchTimelineSummary`; persistência
> Prisma; serviços de sincronização; agregações de perfil; `PlayerChampionStats`; matchup
> pessoal; pós-game; evolução do jogador; contratos e schemas da API; adapters de
> compatibilidade; componentes do desktop que apresentam estatísticas.
>
> ## Banco de dados
>
> Quando um campo puder ser honestamente ausente, preferir coluna nullable; não usar default `0`
> para representar ausência; não alterar dados antigos para `null` sem provar que os zeros eram
> artificiais; não apagar informações; não fazer migration por conveniência. Se não for possível
> distinguir zeros históricos legítimos de falsos, manter os registros e documentar a limitação.
>
> ## Contratos da API
>
> Schemas devem aceitar `null` nos campos realmente opcionais. Não normalizar `null` para zero
> antes de responder. Usar `UNAVAILABLE` sem observação, `PARTIAL` com parte da amostra,
> `AVAILABLE` para zero real. Não criar uma segunda estrutura concorrente de disponibilidade.
>
> ## Compatibilidade
>
> O adapter central não deve converter campo ausente em zero, `null` em zero, percentual sem
> denominador em zero, nem estatística antiga desconhecida em evidência disponível. Quando uma
> resposta antiga não permitir distinguir, tratar apenas os campos conhecidos por terem usado
> fallback artificial, centralizar a regra e documentar a limitação.
>
> ## Interface
>
> Zero real como `0`/`0%`; ausência como `Indisponível`; dado parcial indicando cobertura
> incompleta; sem barra zerada para indisponibilidade; sem `NaN`, `Infinity`, `undefined` ou
> texto vazio; sem alterar o design system nem redesenhar telas.
>
> ## Fora do escopo
>
> Matchup global; Meta Intelligence; Patch Intelligence; APIs novas; builds/runas/feitiços do
> `rawJson`; elegibilidade global de posição; fallback de posição desconhecida para MID;
> `ChampionTag`; recalibrar pesos ou thresholds; pool de candidatos; cinco recomendações;
> composição ou sinergia; persistência de drafts; reescrever o pré-game; dados retroativos sem
> fonte confiável.
>
> ## Testes mínimos
>
> 26 casos: zero explícito preservado; ausente permanece ausente; `null`/`undefined` não viram
> zero; coleção vazia não produz média zero; coleção sem observações válidas → indisponível;
> média só com observações disponíveis; agregação parcial informa amostra total e disponível;
> zero mortes continua zero; zero participação com denominador positivo continua `0%`;
> denominador zero/ausente → indisponível; diferença zero legítima permanece disponível; timeline
> ausente não zera estatísticas; payload antigo sem campo opcional não quebra o sync;
> persistência aceita ausência; API retorna `null`; interface mostra zero real, indisponibilidade
> sem barra e diferencia parcial; nenhum `NaN`/`Infinity`; adapter não recria falsos zeros;
> Etapa 3 continua funcionando; meta e matchup global continuam indisponíveis; recomendações e
> ordenação continuam funcionando; consumidores atuais não quebram.

## Notas de implementação

### Auditoria: campos e decisões

| Local | Operação encontrada | Decisão |
|---|---|---|
| `match-mapper.ts` | `killParticipation: challenges?.killParticipation` | **Já correto** - `undefined` sem `challenges` |
| `match-mapper.ts` | `objectiveParticipation` nunca mapeado | Mantido ausente; é a origem do falso zero |
| `match-mapper.ts` | `teamId: participant?.teamId ?? 0` | **Corrigido** - entrada descartada (Riot usa 100/200; o 0 criava time fantasma no cálculo de aliados/inimigos) |
| `timeline-mapper.ts` | `csAtFrame` → `return 0` sem frame | **Corrigido** - `undefined` |
| `timeline-mapper.ts` | `csAt10/15` sem checar se a partida chegou no minuto | **Corrigido** - guarda `reachedMinute`, igual à que `goldDiffAt15` já tinha |
| `timeline-mapper.ts` | `goldAtFrame` → `return 0` sem frame | **Corrigido** - só é chamada após confirmar o frame |
| `timeline-mapper.ts` | `deathsBefore10/15` | **Preservado** - contagem de eventos, `0` = não morreu |
| `player-champion-stats.ts` | `averageAvailable` → `0` sem observação | **Corrigido** - `null` + `StatCoverage` |
| `player-champion-stats.ts` | `killParticipation ?? 0` em `recentMatches` | **Corrigido** - passa `null` |
| `player-champion-stats.ts` | `average` → `0` com coleção vazia | **Corrigido** - a função devolve `null` antes disso |
| `player-insights.ts` | `killParticipation ?? 0` em `toRecentChampionMatch` | **Corrigido** - passa `null` |
| `player-insights.ts` | filtro `killParticipation > 0` | **Corrigido** - `!== null`; o `> 0` também descartava participação zero legítima |
| `player-insights.ts` | `deaths / stats.games` | **Corrigido** - piso de 1 contra Infinity |
| `champion-performance.ts` | `normalizeRatio(stats.objectiveParticipation, …)` | **Corrigido** - componente sai do cálculo, peso redistribuído |
| `champion-performance.ts` | `components[key] ?? 50` | **Corrigido** - peso do ausente já é 0 |
| `player-stats-repository.ts` | `row.killParticipation ?? 0` na leitura | **Corrigido** - atravessa `null` |
| `players/routes.ts` | `entry.killParticipation ?? 0` | **Corrigido** - atravessa `null` |
| `match-repository.ts` | `csAt10/15 ?? 0` | **Corrigido** - `undefined` |
| `ProfileScreen.tsx` | `Math.round(objectiveParticipation * 100)%` | **Corrigido** - "Indisponível" + motivo |
| `recommendation-engine.ts` | `metrics[key] ?? 0` | **Preservado** - o peso da métrica ausente já é 0 (Etapa 3) |
| `recommendation-engine.ts` | `tag?.blindSafety ?? 0.5` | **Fora de escopo** - é neutro de `ChampionTag`, não zero; a etapa proíbe alterar `ChampionTag` |
| `player-stats-repository.ts` | `gamesByRole.get(...) ?? 0` | **Preservado** - inicialização de acumulador |
| `match-repository.ts` | `durationSeconds ?? 9999` | **Preservado** - guarda de anomalia já documentada |

### Falso zero de maior impacto

`objectiveParticipation` nunca foi extraído de fonte nenhuma (medido: **0 de 220**
participantes no banco real). A agregação era obrigada a gravar `0`, e esse zero entrava no
score com **15% do peso** em JUNGLE e SUPPORT. Contra a conta real Zekerus#117:
Viego JUNGLE **52 → 61,4** e Vel'Koz SUPPORT **46 → 53,7**, ambos com `dataCoverage 0,85`.

### Banco

Migration `20260726120000_player_champion_stats_nullable_participation`: colunas de
participação viram nullable e nascem `killParticipationSamples`/`objectiveParticipationSamples`
(nullable = cobertura desconhecida). **Nenhum dado existente foi alterado** - as linhas são
recalculadas a cada sync.

### Achados extras

- **`round(dataCoverage)`**: `round` arredonda pra 1 casa (escala 0-100 dos scores) e esmagava
  uma cobertura de `0,85` pra `0,8`. Corrigido.
- **`globals: true` faltando no vitest do renderer**: sem isso o `@testing-library/react` nunca
  registrava o cleanup automático, e o DOM acumulava entre testes desde a Etapa 2 - uma
  asserção de ausência podia passar ou falhar por causa do render anterior. Corrigido.

### Testes

35 automatizados novos (264 no total): cobertura parcial/indisponível na agregação, zero medido
preservado, componente removido do score, ausência de NaN/Infinity, `csAt` sem o minuto
alcançado, timeline vazia, `teamId` ausente, contrato da API devolvendo `null`, adaptador de
compatibilidade e as três representações na interface.

### Validação real (Electron + API + Postgres reais, Zekerus#117)

- `GET /profile`: `objectiveParticipation: null` com `status: UNAVAILABLE` nos 11 campeões.
- `GET /champion-performance`: Viego 61,4 e Vel'Koz 53,7, `dataCoverage 0,85`, `objective`
  ausente da lista de componentes.
- Perfil no app: "Part. abates 47% · ref. 62%" ao lado de "Part. objetivos **Indisponível** ·
  O Sparta ainda não extrai participação em objetivos de nenhuma fonte."
- Pós-game com timeline real: 5 barras, relatório íntegro.
- Dashboard, Evolução, Pós-game e Perfil: nenhum `NaN`/`Infinity`/`undefined`, 0 imagens
  quebradas, nenhum erro de console.

**Não validado**: uma partida com timeline encerrada antes dos 10 minutos (remake) - não existe
nenhuma no banco real. Coberto por teste automatizado com fixture, não por observação.
