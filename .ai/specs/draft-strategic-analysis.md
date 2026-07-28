# Análise estratégica do draft 5×5

A Etapa 15 introduz um único motor puro e determinístico:

```txt
analyzeDraftStrategy(input) -> DraftStrategicAnalysis
```

Ele é chamado uma vez por candidato no ranking e pelo campeão confirmado no
pré-game. Os dois consumidores recebem o mesmo objeto, os mesmos sinais e os
mesmos scores estratégicos.

## Escopo

O motor substitui somente:

- `TEAM_COMPOSITION`;
- `ENEMY_COMPOSITION_ANSWER`.

Os pesos gerais de `selectWeights` não mudaram. Desempenho pessoal, experiência,
forma recente, matchup pessoal, blind safety, sinergia genérica, dificuldade,
risco pessoal de execução e meta continuam componentes separados.

Não há regras por campeão, tipos de dano, resistências, anti-heal, anti-shield,
imunidades, interações específicas entre habilidades ou matchup global.

## Contrato

`DraftStrategicAnalysis` contém:

- status e cobertura;
- perfil conhecido de aliados e inimigos;
- contribuição do candidato;
- relações ameaça–resposta;
- métricas estruturadas de composição e resposta inimiga;
- forças, lacunas, riscos e sinais indisponíveis;
- adversário direto separado;
- versões do motor e do modelo de relações.

Cada `StrategicSignal` preserva:

- dimensão;
- disponibilidade;
- descrição;
- campeões e capacidades envolvidos;
- evidências;
- proveniências;
- motivo de indisponibilidade, quando aplicável.

As frases exibidas são derivadas desses sinais. Elas não são a evidência
primária.

## Formação das equipes

```txt
aliados = aliados conhecidos sem o jogador + candidato
inimigos = inimigos conhecidos
```

O candidato entra exatamente uma vez. Entradas marcadas como jogador, entradas
com o mesmo `championId` do candidato e duplicatas por ID são removidas antes
da agregação.

Bans, adversário direto e picks desconhecidos não são injetados nas equipes.
O adversário direto aparece em `directOpponent` e só entra na equipe inimiga se
também estiver realmente revelado em `draft.enemies`.

## Dimensões

O motor acompanha:

```txt
ENGAGE, DISENGAGE, PEEL, PROTECTION, FRONTLINE,
HARD_CC, AREA_CC, TARGETED_CC, DISPLACEMENT,
MOBILITY, DASH, ANTI_MOBILITY, PICKOFF,
WAVECLEAR, POKE, BURST, SUSTAINED_DAMAGE,
SCALING, RANGE_PROFILE
```

Para cada dimensão da equipe são preservados:

- campeões com evidência positiva;
- campeões com fallback negativo explícito;
- quantidade de evidências;
- campeões avaliados e indisponíveis;
- picks desconhecidos;
- cobertura;
- qualidade da origem;
- evidências positivas e negativas.

Uma capacidade indisponível nunca é convertida em ausência.

## Ordem das fontes

1. `ChampionCapabilityProfile` específico;
2. fallback genérico de `ChampionTag`, quando suportado;
3. indisponível.

Os fallbacks permitidos são apenas as dimensões que o produto já mantinha:

```txt
ENGAGE, PEEL, FRONTLINE, PICKOFF, WAVECLEAR, SCALING
```

Uma `ChampionTag` é positiva em `>= 0,55`, negativa em `<= 0,35` e
indisponível entre esses limites. Esses limiares são julgamento de design e
permanecem derivados, nunca oficiais.

Quando a capacidade específica está disponível, a tag não entra no score.
Se a tag aponta baixa presença e a evidência específica aponta presença, o
conflito vira um sinal `PARTIAL`; a evidência específica prevalece sem apagar
o conflito.

`RANGE_PROFILE` preserva o valor oficial de `stats.attackrange`. O algoritmo
classifica como perfil à distância apenas valores `>= 450`; valores menores
são evidência numérica avaliada, mas não contribuição positiva de alcance.

## Contribuição do candidato

O motor compara os aliados conhecidos antes e depois do candidato.

Uma dimensão pode ser:

- `filledKnownGaps`: todos os aliados revelados tinham avaliação suficiente,
  nenhum sustentava o recurso e o candidato passa a sustentá-lo;
- `addedCapabilities`: o candidato adiciona evidência, mas a equipe anterior
  não tinha informação suficiente para chamar aquilo de lacuna;
- `reinforcedCapabilities`: já havia evidência positiva antes do candidato;
- `remainingKnownGaps`: aliados e candidato foram avaliados por fallback
  explícito e o recurso continua sem evidência positiva;
- `newlyEnabledResponses`: o candidato passa a habilitar uma resposta contra
  ameaça inimiga conhecida.

“Preencher lacuna” nunca é sinônimo de “reforçar recurso”.

## Relações ameaça–resposta

Modelo: `threat-response/1.0.0`.

| Ameaça conhecida | Respostas gerais possíveis | Justificativa |
|---|---|---|
| Engage | Disengage, peel, frontline | Podem interromper ou absorver parte da iniciação. |
| Burst | Proteção, peel | Podem reduzir a janela de execução. |
| Mobilidade | Anti-mobilidade, CC direcionado, hard CC | Podem limitar alvos móveis. |
| Dash | Anti-mobilidade, CC direcionado, hard CC | Podem limitar investidas sem presumir interação específica. |
| Pickoff | Peel, proteção | Podem ajudar um aliado isolado. |
| Poke | Engage, proteção | Podem reduzir exposição ou amortecer parte do poke. |
| Frontline | Dano sustentado | É uma resposta geral a alvos duráveis, sem inferir tipo de dano. |
| Hard CC | Alcance `>= 450`, proteção | Podem reduzir exposição ou consequências; não removem o controle. |

As relações admitem resposta parcial. O texto usa “ajuda a responder”, nunca
“countera completamente”.

Se uma ameaça tem evidência mas as respostas não podem ser avaliadas, a relação
fica `UNAVAILABLE`. Se todas as respostas suportadas foram avaliadas por
evidência/fallback negativo, o motor pode registrar “não há evidência conhecida
entre os campeões avaliados”, sempre qualificado pelos picks desconhecidos.

## Scores

### TEAM_COMPOSITION

Somente dimensões avaliáveis do candidato entram:

```txt
lacuna conhecida preenchida = 90
novo recurso com equipe anterior parcial = 75
recurso conhecido reforçado = 60
lacuna conhecida que permanece = 35
```

O resultado é a média dos itens disponíveis, na escala 0–100. Dimensão
indisponível é removida; não recebe `0` nem `50`.

Sem aliado revelado, a métrica fica `UNAVAILABLE`: o candidato isolado não é
apresentado como “composição”.

### ENEMY_COMPOSITION_ANSWER

Cada relação com ameaça conhecida e resposta avaliável produz:

```txt
base com resposta conhecida = 70
até +15 por diversidade de campeões respondendo
+10 quando o candidato habilita a resposta
limite = 95
```

Quando todas as respostas possíveis foram avaliadas e nenhuma tem evidência
positiva, a relação usa `30`, com linguagem parcial. Relações indisponíveis
não entram na média.

Sem inimigo revelado ou sem ameaça sustentada pelo modelo, a métrica fica
`UNAVAILABLE`.

## Cobertura

Cobertura não é confiança, chance de vitória nem qualidade do pick.

Cada equipe combina:

```txt
60% proporção de picks conhecidos
40% proporção de slots campeão × dimensão avaliados
```

A cobertura geral é a média das coberturas aliada e inimiga. As métricas ainda
expõem a cobertura específica das dimensões que participaram de cada score.

Remover um campeão revelado reduz cobertura. Picks desconhecidos não recebem
perfil neutro e não reduzem o score calculado sobre sinais disponíveis.

## Ranking, pré-game e interface

`recommendPicks` e `recommendFromPersonalPool` anexam uma análise independente
a cada principal e alternativa. A ordem dos candidatos não participa do
cálculo individual.

`generatePreGameAnalysis` recebe o mesmo catálogo e chama
`analyzeDraftStrategy`. As seções de recursos da equipe, ameaças, contribuição,
respostas e lacunas são projeções do objeto estratégico.

Nos cards da champion select aparece um resumo curto. O detalhe mostra:

- cobertura e campeões conhecidos;
- contribuição;
- forças, lacunas e riscos;
- evidência da origem;
- sinais indisponíveis.

Dificuldade e risco pessoal permanecem no bloco de métricas próprio.

## Compatibilidade

O campo `strategicAnalysis` é opcional no transporte para aceitar respostas
anteriores.

- API atual: sempre carrega o manifesto e usa o motor novo, mesmo quando o
  manifesto está vazio.
- chamadas internas anteriores sem `capabilityProfiles`: preservam o cálculo
  antigo explicitamente fornecido, sem declarar que a análise nova rodou;
- resposta estruturada antiga sem `TEAM_COMPOSITION` ou
  `ENEMY_COMPOSITION_ANSWER`: o adaptador adiciona as métricas como
  `UNAVAILABLE`;
- resposta antiga com valores numéricos explícitos em `metrics`: os valores
  são preservados como dados legados informados, nunca substituídos por um
  novo `50`.

Não há migration ou persistência de sessão de draft.
