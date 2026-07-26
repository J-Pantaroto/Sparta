---
status: IMPLEMENTADA
solicitado_em: 2026-07-26 13:10
implementado_em: 2026-07-26 14:40
---

# Participação em objetivos a partir de dados reais já persistidos

## Pedido original

> # ETAPA 5 — Extrair participação em objetivos de dados reais já persistidos
>
> ## Contexto
>
> A Etapa 4 confirmou que `objectiveParticipation` nunca havia sido extraído de uma fonte real.
> O campo era persistido como `0`, embora 0 de 220 participantes no banco possuíssem uma
> observação real da métrica. Esse falso zero afetava 15% do score de Jungle e Support. A
> correção da Etapa 4 passou a representar a métrica como indisponível e a remover
> proporcionalmente seu peso do cálculo.
>
> A auditoria também identificou que os dados brutos já persistidos em `Match.rawJson` podem
> conter `challenges.dragonTakedowns`, `challenges.baronTakedowns`,
> `challenges.riftHeraldTakedowns` e os objetivos conquistados por cada time no objeto da
> partida.
>
> ## Objetivo
>
> Implementar uma métrica real de participação em objetivos neutros utilizando somente dados
> oficiais já presentes nos payloads Match-V5 persistidos: distinguir participação real igual a
> zero de dado ausente; calcular apenas quando numerador e denominador forem sustentados por
> dados reais; manter `UNAVAILABLE` quando os campos necessários não existirem; usar `PARTIAL`
> quando apenas parte da amostra agregada tiver o dado; registrar amostra e proveniência;
> reintroduzir o componente no score apenas para observações válidas; não inventar eventos;
> não integrar API nova; não reinterpretar outros campos como substitutos sem evidência.
>
> ## Auditoria inicial obrigatória
>
> Inspecionar amostras reais de `Match.rawJson` e confirmar: em quais partidas os campos de
> `challenges` existem; em quais patches estão ausentes; se os valores são numéricos e
> semanticamente utilizáveis; como os objetivos dos times estão representados; se o `teamId`
> permite associar participante e time; se remakes têm comportamento diferente; se há
> inconsistência entre a soma das participações e a quantidade de objetivos do time; se um
> participante pode ter mais participações que objetivos do próprio time; se o payload permite
> distinguir dragão, Barão e Arauto com segurança. Registrar quantidade de partidas
> inspecionadas, campos encontrados e ausentes, patches, inconsistências e a decisão
> metodológica final.
>
> ## Definição da métrica
>
> Participação em objetivos neutros principais: dragões, barões e arautos. Não incluir torres,
> inibidores, Atakhan, grubs, objetivos de modos alternativos nem outros não validados no
> payload real. Caso o payload forneça outros objetivos oficiais de forma clara, documentar como
> possibilidade futura sem ampliar o escopo.
>
> ## Numerador
>
> `personalObjectiveTakedowns = dragonTakedowns + baronTakedowns + riftHeraldTakedowns`, somente
> com campos reais validados. Campo presente com valor `0` é zero legítimo; campo ausente não é
> zero; não usar `?? 0` antes de determinar a disponibilidade do grupo; verificar se os três
> campos precisam estar presentes para a observação ser completa; classificar como `PARTIAL`
> apenas se a metodologia puder produzir valor honestamente interpretável, senão manter
> indisponível.
>
> ## Denominador
>
> `teamNeutralObjectives = teamDragons + teamBarons + teamRiftHeralds`, associando o participante
> ao time pelo `teamId` real. Não usar o total da partida, não misturar objetivos do inimigo, não
> usar vitória ou duração como proxy, não usar `0` quando o objeto de objetivos estiver ausente.
> Time com zero objetivos e dado disponível: percentual matematicamente indisponível por ausência
> de denominador, não `0%`. Preservar os valores absolutos separadamente.
>
> ## Cálculo
>
> `objectiveParticipation = personalObjectiveTakedowns / teamNeutralObjectives` quando ambos
> válidos e o denominador maior que zero. Não aplicar `Math.min(1, value)` silenciosamente. Se o
> numerador puder legitimamente ultrapassar o denominador pela semântica dos campos: não forçar o
> percentual, documentar a diferença semântica, reavaliar a fórmula e bloquear a implementação da
> porcentagem até existir interpretação correta. A hipótese deve ser validada nos dados reais,
> não presumida.
>
> ## Representação estruturada
>
> Usar os contratos das Etapas 2 a 4. A observação deve carregar valor, status, numerador,
> denominador, tipos considerados, patch, data da partida, fonte oficial observada, recurso
> Match-V5 e motivos de indisponibilidade/parcialidade. Não criar contrato paralelo de
> disponibilidade. A proveniência deve indicar que a fonte original é oficial, o dado bruto foi
> observado no Match-V5, o percentual foi calculado pelo Sparta, e registrar a versão do
> algoritmo. Se o contrato atual não comportar bem essa cadeia, fazer a menor extensão coerente e
> documentada, sem redesenhar toda a proveniência.
>
> ## Agregação por campeão
>
> Usar apenas partidas com observação válida; preservar zero legítimo; informar `sampleSize` e
> `availableSampleSize`; marcar `AVAILABLE`/`PARTIAL`/`UNAVAILABLE`; calcular a média usando
> apenas `availableSampleSize`; não dividir pelo total quando houver lacunas. A confiança
> estatística existente não deve ser substituída pela cobertura.
>
> ## Persistência
>
> Extrair durante o sync e persistir o resultado normalizado, mantendo o `rawJson` como fonte
> reprocessável. Considerar partidas novas, já existentes, reprocessamento seguro, idempotência,
> campos nullable, ausência de defaults artificiais e compatibilidade histórica. Não rebaixar
> novamente todas as partidas da Riot. Para registros com `rawJson`: reprocessar localmente, sem
> chamadas externas, sem apagar o `rawJson`, sem alterar registros cuja fonte não permita o
> cálculo. Migration segura para banco populado, sem converter ausência em zero nem destruir
> valores, com rollback e reprocessamento documentados.
>
> ## Backfill local
>
> Comando ou serviço idempotente que recalcula a partir dos `rawJson` armazenados: processa
> somente partidas existentes, não chama Riot API, repetível sem duplicação, informa partidas
> analisadas/atualizadas/sem dados suficientes/com inconsistência/erros, não imprime payloads
> completos, não expõe PUUID nem identificadores desnecessários, executável em produção de forma
> controlada. Não usar o seed operacional como mecanismo de backfill.
>
> ## Score
>
> Com observação válida, o componente pode voltar a participar do score com o peso original já
> documentado, preservando a normalização das Etapas 3 e 4. Não recalibrar peso, não alterar
> outros componentes, não transformar dado parcial em cobertura total, preservar `dataCoverage`.
> Indisponível: peso continua removido e redistribuído, sem zero. Disponível com valor real zero:
> participa como zero legítimo e a cobertura considera que o dado existe.
>
> ## Pós-game
>
> Pode apresentar participações pessoais, total de objetivos do time, percentual, tipos
> considerados, status e cobertura. Não transformar em recomendação estratégica avançada nem
> gerar frases como "Você ignorou objetivos" ou "Você perdeu a partida por não participar" —
> essas conclusões exigem contexto fora desta etapa. Apenas descrição factual e neutra.
>
> ## Interface
>
> Perfil: mostrar o percentual quando disponível, `0%` quando for zero real com denominador
> válido, `Indisponível` quando não houver observação, indicar parcialidade, permitir acesso a
> `availableSampleSize / sampleSize`, não criar barra zerada para ausência. Pós-game: mostrar
> valores absolutos e percentual quando disponíveis, sem `NaN`/`Infinity`, sem confundir ausência
> de objetivos do time com 0% de participação, sem redesenhar a tela. Manter o design system.
>
> ## Compatibilidade
>
> Respostas antigas com `objectiveParticipation: 0` não devem ser tratadas como evidência válida
> sem disponibilidade, denominador ou proveniência suficiente. Centralizar a adaptação, não
> espalhar heurísticas. Se não for possível distinguir zero legado legítimo de artificial,
> preferir indisponibilidade, documentar e permitir que sync ou backfill atualize.
>
> ## Fora do escopo
>
> Matchup global; Meta Intelligence; Patch Intelligence; API nova; builds ou runas; outras
> estatísticas do `rawJson` além das necessárias; elegibilidade global de posição; fallback de
> posição desconhecida para MID; `ChampionTag`; recalibrar scores ou pesos; pool de candidatos;
> cinco recomendações; composição ou sinergia; persistência de drafts; reescrita do pré-game;
> orientações estratégicas baseadas apenas no percentual; objetivos não validados.
>
> ## Testes mínimos
>
> 37 casos, cobrindo: percentual disponível com campos completos; `0%` disponível com denominador
> positivo; time com zero objetivos indisponível; objeto de objetivos ausente indisponível;
> `teamId` ausente indisponível; time não encontrado indisponível; challenge ausente não vira
> zero; todos os campos pessoais ausentes indisponível; campo parcialmente presente segue a
> metodologia documentada; soma correta dos tipos; objetivos do inimigo fora do denominador;
> numerador e denominador preservados; sem `NaN`; sem `Infinity`; inconsistência numerador maior
> que denominador tratada explicitamente; zero legítimo persistido como zero; ausência `null`;
> agregação só com observações disponíveis; agregação parcial informa as duas amostras; nenhuma
> observação válida `UNAVAILABLE`; todas válidas `AVAILABLE`; parte válida `PARTIAL`; score
> reintroduz o peso só quando disponível; score preserva normalização quando indisponível;
> `dataCoverage` aumenta; valor real zero participa do score e da cobertura; backfill idempotente;
> backfill não chama Riot API; backfill ignora partida sem `rawJson`; resposta antiga com zero sem
> proveniência permanece indisponível; API preserva `null`; Perfil mostra percentual, `0%` e
> indisponível sem barra; Pós-game não quebra sem a métrica; matchup e meta inalterados; nenhum
> consumidor quebra após reprocessamento.
>
> ## Validação real
>
> Usar somente dados reais já persistidos. Validar quantas partidas possuem os campos, quantas
> podem ser recalculadas, quantas permanecem indisponíveis, pelo menos um caso com participação
> maior que zero, pelo menos um com participação zero e denominador positivo, agregação real de
> um campeão, efeito em `dataCoverage`, efeito no score de Jungle ou Support, Perfil e Pós-game no
> Electron. Não fabricar partida operacional; fixture apenas em teste automatizado, com a
> limitação registrada.

## Notas de implementação

### Auditoria dos `rawJson` reais

**22 partidas / 220 participantes**, todas no patch **16.14** (único presente no banco).

| Verificação | Resultado |
|---|---|
| Partidas com `challenges` no participante | 22 de 22 |
| Partidas com `teams[].objectives` | 22 de 22 |
| Participantes sem `dragonTakedowns`/`baronTakedowns` | 0 |
| Participantes sem os objetivos do próprio time | 0 |
| `teamId` permite associar participante ao time | Sim, 100/200 em todos |
| Participação zero legítima (time com objetivos, jogador em nenhum) | 62 |
| Time sem nenhum dragão/barão (sem denominador) | 25 |
| **Numerador > denominador em dragão** | **0** |
| **Numerador > denominador em barão** | **0** |
| **Numerador > denominador em arauto** | **1** |

Objetivos disponíveis no payload: `dragon`, `baron`, `riftHerald`, `horde`, `atakhan`, `tower`,
`inhibitor`, `champion`. Só os dois primeiros entraram.

### Decisão metodológica: Arauto excluído

O único caso inconsistente é do Arauto, e ele é decisivo. Na partida `BR1_3263128214`,
**nenhum dos dois times** tem `riftHerald.kills > 0`, e mesmo assim um participante tem
`riftHeraldTakedowns: 1`; o `challenges.teamRiftHeraldKills` **dele** é `0`. O payload se
contradiz internamente, então `riftHeraldTakedowns` e `objectives.riftHerald.kills` não estão
na mesma base de contabilidade.

Incluir o Arauto exigiria aceitar numerador maior que denominador ou aplicar um clamp que
esconde a divergência. Dragão e barão sozinhos têm interpretação exata (0 inconsistências em
220 participantes), então a métrica entregue é **dragões + barões**, documentada como tal. A
fórmula do pedido foi reavaliada com base no dado real, não presumida.

### Numerador > denominador, se acontecer

Não é truncado. O valor sai como está e a observação vira `PARTIAL` com o motivo, pra a anomalia
aparecer em vez de ser mascarada por `Math.min`. Não ocorre com dragão e barão nos dados atuais;
está coberto por teste.

### Achado real: idempotência quebrada por comparação de float

A primeira versão do backfill comparava a razão persistida com a recalculada pra decidir se
havia mudança. Uma linha era reescrita **a cada execução**: `1/6` não faz round-trip exato pelo
`double precision` do Postgres (volta como `0.1666666666666667`, e o JS produz
`0.16666666666666666`). A comparação passou a usar os **inteiros** (numerador e denominador),
que são exatos e determinam a razão por completo. Confirmado no banco real: segunda e terceira
execuções com 0 atualizações. Teste de regressão com o valor medido.

### Efeito real medido (Zekerus#117)

| | Antes (Etapa 4) | Depois |
|---|---|---|
| Viego JUNGLE | score 61,4 · cobertura 0,85 | **score 67,2 · cobertura 1,0 · objective 100** |
| Vel'Koz SUPPORT | score 53,7 · cobertura 0,85 | score 53,7 · **cobertura 1,0 · objective 53,6** |
| Thresh SUPPORT | objetivos indisponível | **0% real** (participou de 0 do 1 objetivo do time) |

Backfill: 22 partidas analisadas, 220 participantes atualizados, 25 sem dado suficiente, 0
inconsistentes, 1 conta com agregado recalculado.

### Validação no Electron real (CDP)

- Perfil, Viego: "Part. objetivos **100% · parcial** · ref. 62% · **4 de 5 partidas**", e a
  barra "Participação em objetivos" voltou aos componentes do score.
- Perfil, Thresh: "Part. objetivos **0%**" — zero medido, não "Indisponível".
- Pós-game: "Participação em objetivos — **1 de 2 (50%) dos dragões e barões do seu time**",
  factual, sem leitura estratégica.
- Nenhum `NaN`/`Infinity`/`undefined` em nenhuma tela.

### Limitações registradas

- **Só o patch 16.14 existe no banco.** O caminho "payload antigo sem `challenges`" está
  coberto por teste com fixture, não por observação real.
- **`PARTIAL` por numerador > denominador** não foi observado no app real (0 casos com dragão e
  barão); coberto por teste.
- Void grubs, Atakhan, torres e inibidores existem no payload mas não foram validados.
