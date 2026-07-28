# ChampionTag: origem, derivação e revisão

Arquivo versionado: `data/seeds/champion-tags.json`.
Derivação: `packages/core/src/draft/champion-tag-derivation.ts`.
Manifesto (leitura, montagem, validação): `packages/core/src/draft/champion-tag-manifest.ts`.
Contrato de proveniência: `packages/core/src/types/champion-tag-provenance.ts`.

## O que estas dimensões são — e o que não são

`ChampionTag` descreve nove dimensões de gameplay (`engage`, `peel`, `frontline`, `waveclear`,
`pickoff`, `scaling`, `earlyPressure`, `blindSafety`, `difficulty`) mais `damageProfile`, `tags`
e `roles`.

**A Riot não publica nenhuma dessas dimensões.** Elas são derivadas do único dado que a Data
Dragon expõe para todos os campeões: as `tags` de classe e as notas `info`
(attack/defense/magic/difficulty) do `champion.json`. Isso significa:

- Não são estatística global, nem winrate, nem percentil de nada.
- Não representam análise das habilidades concretas do campeão.
- Duas Marksman recebem o mesmo perfil; campeão fora do arquétipo (Senna, Pyke, Ivern) fica
  genérico.

Por isso toda proveniência sai como `DERIVED`, **nunca** `OFFICIAL` — inclusive para as entradas
revisadas à mão, que são julgamento de design, não publicação da Riot.

## Formato do arquivo

Um manifesto com metadados compartilhados:

```json
{
  "metadata": {
    "dataDragonVersion": "16.14.1",
    "locale": "pt_BR",
    "sourceResource": "champion.json",
    "algorithmVersion": "champion-tag-derivation/1.0.0",
    "generatedAt": "2026-07-27T21:23:48.208Z"
  },
  "champions": [ /* uma entrada por campeão */ ]
}
```

Os metadados valem para o arquivo inteiro. Repeti-los em 173 entradas encheria o diff de ruído a
cada regeração sem acrescentar informação.

Cada entrada guarda os **valores efetivos** — é isso que se quer ler num diff — e, em
`review.overrides`, **quais dimensões** foram revisadas à mão:

```json
{
  "championId": 103,
  "championName": "Ahri",
  "pickoff": 0.85,
  "review": {
    "overrides": {
      "pickoff": { "reason": "classe não descreve o kit", "reviewedAt": "2026-07-27" }
    }
  }
}
```

`reason` e `reviewedAt` são opcionais: o que não foi registrado fica ausente, não inventado.

## Estado de revisão

Derivado das chaves de `overrides`, nunca declarado à parte (assim não tem como divergir):

| Estado | Significado |
|---|---|
| `UNREVIEWED` | Tudo veio da derivação automática |
| `PARTIALLY_REVIEWED` | Pelo menos uma dimensão revisada, pelo menos uma ainda derivada |
| `REVIEWED` | Todas as dimensões revisadas |
| *(ausente)* | **Origem não informada** — registro anterior a esta etapa |

Ausência **não** é sinônimo de `UNREVIEWED`: "ninguém revisou" é uma afirmação, "não sabemos"
não é.

**Estado de revisão não é confiança estatística.** `REVIEWED` significa "alguém olhou este
campeão", não "este número está calibrado contra partidas reais" — o segundo não existe hoje.
Por isso `ChampionTagProvenance` não tem nenhum campo numérico de confiança.

## Curadoria por dimensão

A regeneração preserva **cada dimensão sobrescrita**, não a entrada inteira. Um campeão com
`pickoff` revisado mantém `pickoff` e recebe a derivação atualizada nas outras oito.

O formato anterior marcava a entrada toda com `"source": "manual"`, o que congelava dimensões que
ninguém tinha revisado — um campeão curado nunca receberia correção nenhuma, nem em dimensão
intocada.

**Editar um valor sem registrar o override faz a regeneração devolvê-lo ao valor derivado.** O
gerador avisa quando detecta isso, em vez de descartar a edição em silêncio.

## Gerador

```bash
pnpm --filter @sparta/api champion-tags:generate   # regenera o arquivo
pnpm --filter @sparta/api champion-tags:check      # só verifica, não escreve
```

O gerador registra a versão **real** da fonte (`fetchDataDragonVersions`) e do algoritmo, valida
as dimensões numéricas (finitas, 0-1), detecta campeões novos e campeões que sumiram, e preserva
overrides e estado de revisão.

`--check` compara o arquivo com a fonte atual e sai com código 1 quando ele está desatualizado —
serve pra saber se vale regenerar sem produzir um diff só pra descobrir. Arquivo sem metadados
conta como desatualizado: não dá pra afirmar de que versão ele veio.

**Determinismo funcional**: a lista de campeões é ordenada por nome e serializada com ordem de
chaves estável; `generatedAt` só é reescrito quando algo funcional muda. Rodar o gerador duas
vezes seguidas produz o arquivo byte a byte idêntico.

## Versão do algoritmo

`CHAMPION_TAG_DERIVATION_VERSION` (`champion-tag-derivation/1.0.0`). **Suba essa versão sempre
que `CLASS_PROFILE`, os pesos ou os limiares mudarem** — são eles que determinam o resultado, e
sem isso não há como detectar que o arquivo ficou pra trás.

## Persistência

`prisma:seed` lê o manifesto e grava dimensões **e** proveniência (`dataDragonVersion`, `locale`,
`sourceResource`, `algorithmVersion`, `generatedAt`, `reviewState`, `reviewedDimensions`). Todas
as colunas são nullable: linha gravada antes desta etapa fica com elas nulas, e o repositório a
serve **sem proveniência** — origem não informada.

O seed é idempotente de verdade: linha já igual não é reescrita (segunda execução reporta 0
gravações). Sua única fonte é o arquivo versionado; nada é inferido ou completado.

A versão do `Champion` criado pelo seed vem do manifesto. A versão anterior gravava a string fixa
`"seed"`, que não é versão de coisa nenhuma; sem metadados o campo fica **nulo**.

## Consumo

- **Motor de recomendação** — lê só os números das dimensões. Proveniência não entra em peso,
  score nem ordenação; mesmas dimensões produzem exatamente o mesmo resultado.
- **Pré-game** — os sinais declaram `DERIVED` e a versão da fonte **só quando todas as tags
  usadas concordam**; com perfis de versões diferentes na mesma composição, a versão fica
  ausente em vez de anunciar uma delas. `selectedChampion.profileProvenance` carrega a origem do
  perfil do campeão escolhido.
- **Interface** — uma linha discreta no rodapé do card "O que sua escolha adiciona", só ali:
  "Perfil derivado das classes da Data Dragon, sem revisão específica deste campeão. Fonte:
  champion.json 16.14.1." Repetir isso em cada frase transformaria a ressalva em ruído.

`ChampionTag.difficulty` continua pertencendo a este perfil
derivado/curável. A Etapa 13 não o promoveu a dado oficial: preservou
`info.difficulty` separadamente no catálogo `Champion` e o expõe como
`ChampionTag.officialDifficulty` para
produzir `CHAMPION_DIFFICULTY` e `EXECUTION_RISK`. Ver
`docs/champion-execution-risk.md`.

## Como revisar um campeão

1. Abra `data/seeds/champion-tags.json` e ache a entrada.
2. Ajuste o valor da dimensão.
3. Registre o override na mesma entrada, com o motivo:

```json
"review": { "overrides": { "pickoff": { "reason": "…", "reviewedAt": "2026-07-28" } } }
```

4. Rode `champion-tags:generate` (confirma que nada mais mudou) e `prisma:seed`.

Não é necessário — nem esperado — revisar os 173 campeões. A base derivada cobre todo mundo; a
curadoria cresce por cima dela, campeão a campeão, e agora fica registrada.
