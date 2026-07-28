# Patch Intelligence

## Escopo

Patch Intelligence registra somente mudanças publicadas nas notas oficiais da
Riot. O módulo responde o que mudou e qual foi a classificação editorial; ele
não mede impacto teórico, força no meta, taxa de vitória/escolha/banimento,
matchup ou elegibilidade global.

O contrato `patch-intelligence/1.0.0` fica em
`packages/core/src/patch/patch-intelligence.ts`. Releases e mudanças carregam
proveniência `OFFICIAL`, URL, patch, locale, datas, hash, versão do parser e
estado de disponibilidade.

Desde a Etapa 20, uma interpretação `DERIVED` opcional consome este contrato
factual sem modificá-lo. Ela permanece documentada separadamente em
`docs/theoretical-patch-impact.md`.

## Fonte e coleta

O coletor aceita somente HTTPS nos hosts `www.leagueoflegends.com` e
`leagueoflegends.com`, dentro de `/{locale}/news/game-updates/*-notes`.
Produção suporta `pt_BR` e `en_US`; não existe parâmetro operacional para
apontar a um site arbitrário.

As requisições usam a política compartilhada da Etapa 9:

- timeout de recurso remoto;
- retry idempotente com backoff e jitter;
- cache persistido em `ApiCacheEntry`;
- uma hora de conteúdo `FRESH`;
- até sete dias adicionais de fallback `STALE`.

O cache preserva a URL e o instante original de coleta. Uma falha sem cache
válido cria somente uma tentativa `PAGE_UNAVAILABLE`; nunca cria um release
com `changes: []`. Um fallback stale fica marcado como `STALE` e não altera
artificialmente `collectedAt`.

Não existe polling. Os únicos gatilhos são os comandos controlados:

```bash
pnpm --filter @sparta/api patches:check --patch=26.14 --locale=pt_BR
pnpm --filter @sparta/api patches:import --patch=26.14 --locale=pt_BR
```

`check` coleta/valida e compara o hash sem criar revisão, tentativa ou cache
operacional. `import` persiste. A saída é JSON resumido com contagens, estado
do conteúdo, revisão e cache; HTML nunca é impresso.

## Parser

`riot-patch-notes-parser/1.0.0` é isolado em
`packages/riot/src/patch-notes/parser.ts`. Ele lê somente o HTML recebido pelo
coletor e não importa fixtures em produção.

Regras:

- cabeçalhos editoriais explícitos têm precedência;
- intenção explícita no resumo oficial pode sustentar `BUFF`, `NERF` ou
  `ADJUSTMENT`;
- compensação ou sinais simultâneos de fortalecimento/enfraquecimento ficam
  `ADJUSTMENT`;
- correção explícita permanece `BUGFIX`;
- `NOVO` e `REMOVIDO` precisam estar escritos;
- direção numérica, sozinha, nunca classifica;
- ambiguidade fica `UNCLASSIFIED`;
- escalares simples explícitos podem gerar valores numéricos;
- séries, fórmulas, faixas e texto continuam preservados textualmente, sem
  conversão numérica arriscada.

O hash SHA-256 usa somente o conteúdo semântico canônico: identidade da fonte,
título, publicação e mudanças estruturadas. Horário de coleta, whitespace,
atributos visuais e IDs gerados pela página não entram no hash.

## Catálogo

Campeões usam comparação exata depois de uma normalização genérica e
testável: Unicode sem diacríticos e remoção de pontuação/espaços. Não há
regra por campeão nem aproximação por distância textual. Colisão é ambígua e
fica sem `entityId`.

O schema atual não possui catálogo global de itens ou runas. Essas entidades
preservam o nome e toda a evidência oficial, ficam com resolução
`UNRESOLVED` e motivo explícito. Sistemas e outras entidades usam
`NOT_APPLICABLE`.

## Persistência e revisão

Migration `20260728163000_patch_intelligence` cria:

- `PatchRelease`: identidade única `patch + locale + sourceUrl`;
- `PatchReleaseRevision`: conteúdo imutável, único por hash e número de
  revisão;
- `PatchImportAttempt`: sucesso, fallback stale ou falha sanitizada.

Reimportar o mesmo hash retorna `UNCHANGED`. Um hash novo cria a próxima
revisão e mantém as anteriores. Falha de rede ou parser só acrescenta uma
tentativa; não atualiza nem apaga a última revisão válida.

## API

Consultas públicas e factuais:

- `GET /patches?locale=pt_BR`;
- `GET /patches/current?locale=pt_BR`;
- `GET /patches/:patch?locale=pt_BR`;
- `GET /patches/:patch/champions/:championId?locale=pt_BR`.

Estados válidos são `AVAILABLE`, `PARTIAL` e `STALE`. Ausência usa
`UNAVAILABLE` com código estável:

- `PATCH_NOT_IMPORTED`;
- `PATCH_PAGE_UNAVAILABLE`;
- `PATCH_PARSER_INCOMPATIBLE`.

Na consulta por campeão, `changes: []` só aparece ao lado de um release válido
e de `entityChanged: false`.

A Etapa 20 acrescenta `GET /patches/:patch/impacts?locale=pt_BR` e inclui
`theoreticalImpact` na consulta por campeão. O release oficial continua
inalterado e separado dessa interpretação.

## Interface e invariantes

O Champion Select converte a versão técnica `16.x` do cliente de 2026 para a
numeração editorial `26.x` antes da consulta. O resumo apresenta publicação,
revisão, contagens, itens/runas e link oficial. Candidatos alterados recebem
somente o indicador secundário permitido e um detalhe auditável.

O aviso “Mudança oficial não representa força observada no meta” acompanha a
evidência. A chamada ocorre fora do motor de recomendação: nenhum campo de
Patch Intelligence entra em `DraftState`, métricas, pesos, score, pool, risco
de execução, `META_STRENGTH` ou ordem dos candidatos.
