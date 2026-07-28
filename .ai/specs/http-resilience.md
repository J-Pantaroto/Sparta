# Resiliência HTTP e cache

Fonte de verdade: `docs/http-resilience.md`.

Todas as integrações ativas usam a política central em `packages/riot/src/http/`: Riot API
(10 s e retry limitado de GET para timeout/429/502/503/504), Data Dragon (8 s), Community
Dragon/assets/API local (10 s) e LCU (1,5 s). POST/PUT não têm retry automático.

Erros externos têm código estável e causa sanitizada. Cache declara `MISS`, `FRESH`, `STALE` ou
`EXPIRED`, com datas reais e sem preencher datas históricas ausentes. Stale é por recurso,
preserva a origem oficial e nunca vale para autenticação, credenciais, LCU ou draft atual.

O LCU distingue cliente fechado, lockfile ausente/inválido, credencial local inválida, conexão
recusada, timeout, endpoint indisponível, fora do champion select e payload inválido. Perder a
observação limpa o draft.

`UnavailableGlobalStatisticsProvider` é o provider global padrão e não faz
HTTP, não lê credencial e não usa cache. TTL, stale, concorrência, retry e
invalidação futuros estão definidos no ADR
`docs/adr/0002-global-meta-source.md`, mas continuam inativos.

Ver o inventário, a matriz completa e o contrato da API em `docs/http-resilience.md`.
