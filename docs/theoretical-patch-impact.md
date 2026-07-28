# Impacto teórico das mudanças do patch

## Escopo e separação

`TheoreticalPatchImpact` transforma a evidência oficial importada pela Etapa
19 em hipóteses descritivas sobre dimensões que podem ter sido afetadas. A
origem do resultado é `DERIVED`: a mudança continua `OFFICIAL`, enquanto a
relação entre mudança e dimensão é julgamento determinístico e versionado do
Sparta.

Os três conceitos permanecem independentes:

1. `PATCH_OFFICIAL_CHANGE`: o que a Riot publicou;
2. `THEORETICAL_PATCH_IMPACT`: o que a mudança pode afetar pelas regras deste
   algoritmo;
3. `META_STRENGTH`: o que uma população real de partidas demonstrou depois do
   patch — continua `UNAVAILABLE`.

O módulo não produz força geral, tier, chance de vitória,
`patchPowerScore`, recomendação de campeão, build ou runa. Ele não participa
de score, pesos, ranking, pool, risco de execução, matchup, elegibilidade ou
snapshots.

## Contrato

O contrato `theoretical-patch-impact/1.0.0` vive em
`packages/core/src/patch/theoretical-patch-impact.ts`. Cada análise preserva:

- patch, revisão e hash exatos da fonte;
- campeão e IDs únicos das mudanças oficiais;
- status e cobertura;
- sinais disponíveis e sinais indisponíveis em coleções separadas;
- dimensão, direção, magnitude opcional, explicação e evidências;
- valores anterior/novo, componente e índice da unidade estruturada;
- capacidade da Etapa 14 quando ela sustenta a relação;
- versão do algoritmo e versão do extrator de capacidades.

As dimensões suportadas são dano inicial, dano sustentado, burst, poke, wave
clear, mobilidade, engage, disengage, peel, proteção, controle, alcance,
resistência, sustain, custo de recursos, cooldown, scaling, força no início,
meio e fim, consistência e tolerância a erro. `UNCLASSIFIED` é somente o
recipiente explícito de uma unidade que não pôde receber dimensão segura; não
representa uma dimensão estratégica real.

Direções possíveis: `POSITIVE`, `NEGATIVE`, `MIXED`, `NEUTRAL` e `UNKNOWN`.
`NEUTRAL` exige dois escalares comparáveis e iguais. Ausência nunca é
convertida em neutro.

## Entradas permitidas

O algoritmo puro usa somente:

- `PatchChange` e `StructuredPatchDelta` da revisão oficial;
- componente, resumo e detalhes oficiais já preservados;
- valores anterior e novo quando a Etapa 19 publicou escalares comparáveis;
- `ChampionCapabilityProfile` da Etapa 14.

Não lê estatísticas globais, win rate, histórico pessoal, nome de campeão
como regra, opinião externa, classe genérica ou `changeType` como direção. Um
registro marcado `BUFF` pode produzir impacto negativo numa dimensão, e um
`NERF` pode produzir impacto positivo, se a relação numérica específica
sustentar isso.

## Regras conservadoras

As relações diretas reconhecem vocabulário explícito no rótulo da unidade,
como tempo de recarga, custo de mana/energia, velocidade de movimento,
controle, alcance, resistência e crescimento por nível. Regras sobre dano
genérico exigem uma capacidade rastreável da mesma habilidade para escolher
burst, poke, wave clear ou dano sustentado.

A ligação à habilidade é genérica: o nome oficial da fonte da capacidade
precisa aparecer no componente afetado normalizado. Não existe tabela por
campeão nem aproximação textual. Ausência da capacidade mantém a interpretação
indisponível e não cria uma capacidade nova.

Correções de bug ficam `UNKNOWN` na versão 1.0.0, mesmo quando contêm números.
Isso evita transformar restauração de comportamento em buff ou nerf
automático. Mudanças textuais, séries, faixas e fórmulas preservam os valores,
mas não recebem direção ou magnitude numérica.

## Direção, compensações e magnitude

Direção é calculada pela relação semântica da dimensão:

- cooldown menor é positivo para frequência de uso;
- redução de cooldown maior também é positiva;
- custo de recurso maior é negativo para repetição;
- movimento, controle, alcance, resistência e escalares de dano explícitos
  seguem a direção do efeito;
- efeitos positivos e negativos na mesma dimensão agregam como `MIXED`.

Mudanças em dimensões diferentes continuam separadas. Dano maior com cooldown
maior, por exemplo, preserva um sinal positivo de dano e um sinal negativo de
cooldown. O ID da mudança aparece uma vez no agregado, ainda que sustente mais
de uma evidência.

Magnitude só existe para um único escalar anterior/novo, na mesma unidade,
sem compensação:

```txt
variação relativa = abs(novo - anterior) / abs(anterior)

< 10%        → MINOR
10% a 25%    → MODERATE
> 25%        → MAJOR
```

As bandas são uma convenção explícita da versão 1.0.0, não calibração de
impacto em partidas. Valor anterior zero, séries, fórmulas, texto, múltiplas
evidências agregadas ou direção mista deixam `magnitude: null`. Unidades
diferentes nunca são comparadas.

## Cobertura e disponibilidade

Uma unidade de análise é cada `StructuredPatchDelta`; mudança sem delta
estruturado conta como uma unidade textual. Cobertura é:

```txt
unidades com ao menos um sinal seguro ÷ total de unidades oficiais do campeão
```

- todas interpretadas: `AVAILABLE`;
- parte interpretada: `PARTIAL`;
- mudança oficial presente sem interpretação segura: `UNAVAILABLE`;
- release stale: `STALE`;
- campeão sem mudança no release válido: `entityChanged: false`, status
  disponível e listas vazias — ausência legítima, sem sinal neutro;
- patch não importado: a API mantém `PATCH_NOT_IMPORTED`.

Cobertura não é confiança, força, chance de vitória nem qualidade da mudança.

## Agregação, determinismo e histórico

Sinais são agregados por campeão e dimensão. IDs e evidências são
deduplicados, compensações permanecem visíveis e a ordenação é estável. O
algoritmo não usa relógio, rede ou estado global: mesmo release, revisão,
hash e perfil de capacidades produzem a mesma resposta.

Nesta etapa o resultado é derivado sob demanda, não persistido. Portanto não
há análise histórica gravada que possa ser sobrescrita. Revisão, hash, versão
do algoritmo e versão das capacidades acompanham toda resposta; uma futura
versão deve publicar outra versão explícita e não reetiquetar um resultado
persistido anterior.

## API e interface

Consultas:

- `GET /patches/:patch/impacts?locale=pt_BR`;
- `GET /patches/:patch/champions/:championId?locale=pt_BR` inclui
  `theoreticalImpact`.

O resumo do patch informa quantos campeões e dimensões foram analisados. O
pool pessoal informa apenas quantos de seus campeões receberam mudanças
oficiais. No detalhe secundário do Champion Select aparecem dimensão,
direção, magnitude quando disponível, evidência, limitações e o aviso de que
dados globais pós-patch continuam indisponíveis.

Essas consultas são feitas fora de `POST /drafts/recommendations`; o texto
teórico não entra em “Por que este pick”.
