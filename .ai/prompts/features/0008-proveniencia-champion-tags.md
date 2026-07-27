---
status: IMPLEMENTADA
solicitado_em: 2026-07-27 15:10
implementado_em: 2026-07-27 18:40
---

# Proveniência das ChampionTag

## Pedido original

> # ETAPA 8 — Proveniência das ChampionTag
>
> ## Contexto
>
> As `ChampionTag` são usadas pelo motor de recomendação e pelo pré-game para representar
> dimensões como engage, peel, frontline, wave clear, pickoff e scaling. A maioria das entradas
> foi derivada automaticamente a partir de `tags` e `info` da Data Dragon. Essas dimensões não
> foram publicadas diretamente pela Riot, não são estatísticas globais e não representam
> necessariamente uma análise específica das habilidades de cada campeão.
>
> Atualmente falta rastrear de forma estruturada: versão real da Data Dragon utilizada; versão
> do algoritmo de derivação; data de geração; estado de revisão; campos derivados
> automaticamente; campos sobrescritos manualmente; proveniência de cada override.
>
> ## Objetivo
>
> Tornar a origem e o processo de geração das `ChampionTag` rastreáveis, sem alterar os valores
> atuais, scores, pesos ou ordenação das recomendações. Cada entrada deve permitir distinguir:
> perfil derivado automaticamente; perfil parcialmente revisado; perfil especificamente revisado;
> origem desconhecida em registros históricos; fonte ou algoritmo desatualizado; dimensão
> indisponível.
>
> ## Modelo
>
> Reutilize o contrato de proveniência existente. Represente, quando disponível: versão da Data
> Dragon; recurso de origem; locale; versão do algoritmo; data de geração; estado de revisão;
> dimensões revisadas; overrides manuais por campo; motivo do override; data da revisão.
>
> Estados de revisão equivalentes a `UNREVIEWED`, `PARTIALLY_REVIEWED`, `REVIEWED`. Não use o
> estado de revisão como confiança estatística. Não atribua confiança numérica sem metodologia
> comprovada.
>
> ## Arquivo versionado
>
> Mantenha o resultado revisável por diff. Prefira um manifesto com metadados compartilhados,
> evitando repetir a mesma versão em todas as entradas. Overrides manuais devem continuar
> identificáveis por campeão e por dimensão. A regeneração não pode sobrescrevê-los.
>
> ## Versão da fonte
>
> Remova qualquer fallback antigo fixo de versão. A versão deve vir do catálogo ou da fonte
> realmente utilizada pelo gerador. Quando não for possível determinar a versão de uma entrada
> histórica, mantenha-a ausente em vez de inventar.
>
> ## Gerador
>
> O gerador deve: registrar versão real da fonte; registrar versão do algoritmo; preservar
> overrides; preservar estado de revisão; validar dimensões; detectar campeões faltantes ou
> excedentes; produzir resultado funcional determinístico; possuir uma forma de verificar se o
> arquivo está desatualizado sem reescrevê-lo.
>
> ## Persistência
>
> Atualize o seed e o banco apenas no necessário para persistir a proveniência. Registros
> históricos sem metadados devem continuar funcionando e não podem ser classificados
> automaticamente como revisados. Qualquer backfill deve usar somente o arquivo versionado e ser
> idempotente.
>
> ## Consumo
>
> O motor de recomendação deve manter os mesmos resultados quando as dimensões não mudarem. O
> pré-game deve conseguir informar, em um local secundário da interface, se o perfil utilizado é:
> derivado das classes da Data Dragon; parcialmente revisado; especificamente revisado; de origem
> não informada. Não repetir essa informação em cada frase e não apresentá-la como estatística
> oficial.
>
> ## Restrições
>
> Não: revisar manualmente os 173 campeões; alterar valores das dimensões; alterar pesos, scores
> ou thresholds; preencher roles; derivar posição a partir da classe; criar confiança estatística;
> integrar fonte nova; implementar modelo de habilidades; implementar matchup ou meta global;
> reescrever o pré-game; alterar o commit anterior ou usar force-push.
>
> ## Casos críticos a testar
>
> Regeneração preserve overrides manuais; override de uma dimensão não mude a origem das demais;
> entrada derivada não seja chamada de oficial; entrada sem revisão não receba confiança
> inventada; versão ausente permaneça ausente; registros antigos continuem funcionando; scores
> permaneçam iguais para dimensões iguais; `roles` permaneça vazio sem fonte real; o pré-game
> continue determinístico.
>
> ## Critérios de aceite
>
> A fonte e a versão das tags rastreáveis quando conhecidas; versão do algoritmo explícita;
> derivação e curadoria distinguíveis; overrides preservados por campo; estado de revisão
> explícito; nenhuma confiança inventada; registros históricos compatíveis; motor mantendo os
> mesmos resultados; pré-game apresentando a origem honestamente.

## Auditoria (feita antes de implementar)

1. **Arquivo versionado** (`data/seeds/champion-tags.json`) — array plano de 173 entradas
   (`ChampionTag & { source: "manual" | "derived" }`). **Nenhum metadado**: sem versão da Data
   Dragon, sem versão do algoritmo, sem data de geração, sem estado de revisão. `source` é o
   único sinal de origem e é **por entrada inteira**, não por dimensão. 171 `derived`,
   2 `manual` (Ahri, Orianna).
2. **Gerador** (`generate-champion-tags-cli.ts`) — lê a versão real (`fetchDataDragonVersions`)
   e **a descarta**: só imprime no console, nunca grava. Preserva curadoria por entrada inteira
   (`entry.source === "manual"` mantém tudo), então um campeão curado nunca recebe correção
   nenhuma da derivação, mesmo em dimensões que ninguém revisou. Não valida dimensões, não
   detecta campeão faltante/excedente, não tem modo de verificação sem reescrita.
3. **Fallback fixo de versão encontrado** — `apps/api/prisma/seed.ts` cria `Champion` com
   `version: "seed"`, uma string inventada. Hoje o banco real mostra `16.14.1` em todos os 173
   porque `catalog:sync` sobrescreve no update, mas o caminho de criação grava a mentira.
   `Champion.version` já é nullable no schema.
4. **Banco** — `ChampionTag` tem só as 9 dimensões + `damageProfile`/`tags`. Nenhuma coluna de
   proveniência. `findAllChampionTags` devolve o `ChampionTag` do domínio, que também não tem.
5. **Consumo** — `pre-game-analysis.ts` declara um `championTagProvenance` **constante e
   hardcoded** (`DERIVED`/`sparta`/`ChampionTag`) com o `algorithmVersion` do **pré-game**, não
   o da derivação: a versão declarada hoje está errada por construção. O motor de recomendação
   lê só os números das dimensões — não toca em proveniência.
6. **Contrato existente** — `DataProvenance` (Etapa 2) cobre `patch`, `resource`, `sourceId`,
   `collectedAt`, `algorithmVersion`, `status`. Falta só `locale`. Reusá-lo é o caminho; criar
   um segundo vocabulário de origem seria repetir o problema que a Etapa 2 resolveu.

## Notas de implementação

### Decisões de modelo

- **Reuso, não vocabulário novo.** `DataProvenance` (Etapa 2) já cobre origem, recurso, patch,
  versão do algoritmo e data; ganhou **um** campo (`locale`). O que faltava era outro eixo:
  quanto do perfil é leitura de classe e quanto é curadoria. Um `sourceType` por entrada
  apagaria isso — daí `reviewState` + `reviewedDimensions` nomeadas uma a uma.
- **Nenhuma confiança numérica.** `ChampionTagProvenance` não tem campo de confiança. `REVIEWED`
  significa "alguém olhou este campeão", não "está calibrado contra partidas reais". O segundo
  não existe no Sparta e inventá-lo era exatamente o que a etapa proíbe.
- **Sempre `DERIVED`, nunca `OFFICIAL`** — inclusive na entrada revisada à mão: curadoria é
  julgamento de design, não publicação da Riot.
- **Ausência é um quarto estado.** Proveniência ausente = origem não informada, deliberadamente
  diferente de `UNREVIEWED`. Vale pro arquivo antigo (array plano) e pra linha do banco anterior
  à migration. `source: "manual"` do formato antigo **não** é promovido a revisado.
- **Estado derivado, não declarado.** `reviewState` sai das chaves de `review.overrides` (no
  arquivo) e de `reviewedDimensions` (no banco). Não existe campo que possa divergir da lista —
  um teste cobre justamente a coluna dizendo `REVIEWED` com uma dimensão só na lista.
- **Valores efetivos no arquivo, não valores derivados + patch.** É o que se quer ler num diff.
  O custo aceito: editar sem registrar o override faz a regeneração reverter o valor — por isso
  o gerador **avisa** nesse caso, em vez de descartar em silêncio.

### Migração do arquivo existente

Feita em dois passos, pra não alterar valor nenhum:

1. Conversão array → manifesto preservando os números exatos, com Ahri e Orianna (as duas
   entradas `source: "manual"`) recebendo override em todas as 12 dimensões, motivo "curada
   manualmente antes da Etapa 8" e **sem `reviewedAt`** — a data real não foi registrada e
   inventá-la seria mentir. Metadados deixados **ausentes** nesse passo: a versão da Data Dragon
   usada na geração original não é determinável.
2. Execução real do gerador, que preencheu os metadados com a versão medida (`16.14.1`) e
   re-derivou tudo que não é override.

Medido entre os dois passos: **173 campeões, 0 dimensões alteradas, 0 campeões novos ou
removidos**.

### Testes

54 novos, 450 no total:

- `packages/core/src/draft/champion-tag-manifest.test.ts` — 31: preservação de override,
  override de uma dimensão não congelando as outras nem alterando a origem delas, motivo/data
  sobrevivendo, edição não registrada avisada, os três estados de revisão, derivado nunca
  oficial, versão ausente permanecendo ausente, formato antigo lido sem proveniência,
  `source: "manual"` não promovido, campeão novo/sumido, validação 0-1, determinismo e
  ordenação, `generatedAt` estável sem mudança funcional, `roles` vazio sem fonte real.
- `packages/core/src/draft/pre-game-analysis.test.ts` — 9: proveniência exposta no contrato,
  ausente quando não há, versão declarada só com consenso, nada `OFFICIAL`, sem confiança
  inventada, determinismo preservado, e **os textos/números idênticos com e sem proveniência**.
- `packages/core/src/draft/recommendation-engine.test.ts` — 3: recomendações idênticas com e sem
  proveniência; estado de revisão e versão desatualizada não entram em métrica nem em score.
- `apps/api/src/modules/catalog/champion-repository.test.ts` — 5: linha histórica sem
  proveniência, linha nova completa, estado recalculado da lista, dimensão desconhecida
  descartada, sem confiança inventada.
- `apps/desktop/.../PreGameScreen.test.tsx` — 6: os quatro estados de origem renderizados, versão
  aparecendo só quando conhecida, e a nota aparecendo **uma vez só**.

### Limites da validação

Os estados `REVIEWED`/`PARTIALLY_REVIEWED` **na tela** não foram vistos no app real: o desktop só
confirma campeão a partir de um card de recomendação, e os dois campeões curados (Ahri, Orianna)
não estão no pool de Zekerus#117. Ambos foram validados contra a API real (Ahri respondendo
`REVIEWED` com 12 dimensões) e por teste de componente. O estado derivado (`UNREVIEWED`) e o de
origem não informada foram validados de ponta a ponta no Electron real.
