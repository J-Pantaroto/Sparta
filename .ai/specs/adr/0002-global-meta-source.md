# ADR 0002 — Fonte global de meta

- **Estado da decisão:** `SELF_AGGREGATION_CANDIDATE`
- **Data da pesquisa:** 2026-07-28
- **Contrato preparado:** `global-statistics-contract/1.0.0`
- **Adapter operacional atual:** `unavailable-global-statistics-provider/1.0.0`
- **Decisão de integração:** pendente de aprovação explícita

## Decisão

A candidata recomendada para o meta de partidas ranqueadas do Sparta é uma
**agregação própria sobre APIs oficiais da Riot**, depois de o produto e esse
uso específico serem aprovados para uma Production Key.

Essa é uma candidata, não uma autorização para coletar. A etapa não iniciou
coleta, não integrou fornecedor, não criou cache operacional e não adicionou
credenciais. Até as condições deste ADR serem aprovadas e cumpridas:

- `GLOBAL_MATCHUP` e `META_STRENGTH` continuam `UNAVAILABLE`;
- win, pick e ban rate globais continuam `UNAVAILABLE`;
- builds, runas e feitiços globais continuam `UNAVAILABLE`;
- elegibilidade global continua `status: UNAVAILABLE` e `eligible: null`;
- o provider padrão é `UnavailableGlobalStatisticsProvider`, sem I/O;
- ranking, score, pool, cobertura, risco, estratégia e snapshots não mudam.

“Global” não significa universal. Significa uma população observada e
identificada pelo contexto completo: patch, posição, fila, região, elo,
amostra, período, fornecedor e dataset.

## Requisitos do Sparta

Uma fonte só pode ser integrada se sustentar, no mínimo:

1. partidas de jogadores, não apenas partidas profissionais;
2. campeão e posição observada com regra documentada;
3. patch e fila explícitos;
4. população segmentável por elo e região, ou ausência desses filtros
   explicitamente declarada;
5. resultado, picks e bans para taxas globais;
6. pares de campeões na mesma posição para matchup;
7. inventário final, runas e feitiços observados;
8. amostra e janela de coleta auditáveis;
9. licença compatível com o produto e sua forma de apresentação;
10. origem preservada mesmo quando o resultado é agregado ou cacheado.

Uma fonte de esports pode ser válida para análise de esports e ainda ser
inválida para representar o meta ranqueado. Grande volume sem definição da
população também não satisfaz o contrato.

## Fontes oficiais consultadas

### Riot

- [Developer Portal e tipos de chave](https://developer.riotgames.com/docs/portal)
- [Referência oficial das APIs](https://developer.riotgames.com/apis)
- [Documentação e rotas de League of Legends](https://developer.riotgames.com/docs/lol)
- [Políticas gerais](https://developer.riotgames.com/policies/general)
- [Política específica de League of Legends](https://support-developer.riotgames.com/hc/en-us/articles/22698698001939-League-of-Legends)
- [Termos da API](https://support-developer.riotgames.com/hc/en-us/articles/22698917218323-API-Terms-and-Conditions)
- [Requisitos para Production Key](https://support-developer.riotgames.com/hc/en-us/articles/22801383038867-Production-Key-Applications)

### Provedores de esports

- [Riot Official Esports Data](https://riotesportsdata.com/en-us/product-overview/)
- [Acesso e planos GRID](https://grid.gg/get-access/)
- [Termos do GRID Open Data Platform](https://cdn.grid.gg/gridgg/GRID_Open_Data_Platform_Agreement_05.04.2022.pdf)
- [Documentação LoL da PandaScore](https://developers.pandascore.co/docs/league-of-legends)
- [Planos e endpoints PandaScore](https://developers.pandascore.co/docs/plan-reference)
- [Preços PandaScore](https://www.pandascore.co/pricing)
- [Termos PandaScore](https://www.pandascore.co/terms-and-condition)
- [Pacotes e cobertura Abios](https://abiosgaming.com/packaging)
- [Parceria oficial Abios/GRID](https://abiosgaming.com/press/abios-grid-official-data-partnership-extension/)

Links foram consultados em 2026-07-28. Políticas, preços, limites e cobertura
podem mudar; devem ser revistos antes de qualquer integração.

## Opção 1 — agregação própria pela Riot API

### APIs necessárias

Um coletor representativo precisaria, no desenho atual:

- `LEAGUE-V4` para formar uma amostra estratificada de jogadores por
  plataforma, fila, tier e divisão;
- `MATCH-V5 /matches/by-puuid/{puuid}/ids` para descobrir partidas;
- `MATCH-V5 /matches/{matchId}` para patch, fila, participantes, posição,
  campeão, resultado, itens finais, perks, feitiços e bans;
- `MATCH-V5 /matches/{matchId}/timeline` quando a métrica exigir estado
  temporal, como diferença de ouro aos 15 minutos;
- Data Dragon somente para resolver IDs e ativos estáticos, nunca para
  fabricar taxas ou elegibilidade.

`ACCOUNT-V1` e `SUMMONER-V4` podem ser necessários para fluxos de identidade,
mas não são uma fonte de meta. A lista exata deve ser confirmada contra a
referência vigente no momento do piloto.

### Chaves e rate limits

A documentação do portal distingue:

- development key: temporária e renovada a cada 24 horas;
- Personal Key: uso pessoal/pequeno, 20 requisições por segundo e 100 a cada
  dois minutos por região, sem aumento de limite;
- Production Key: produto público aprovado, com limite inicial documentado de
  500 requisições a cada 10 segundos e 30.000 a cada 10 minutos por região,
  sujeito também a limites de método, serviço e mudanças da Riot.

Uma Personal Key não é adequada nem autorizada para sustentar o agregador
global. Uma Production Key requer produto funcional, site, termos e política
de privacidade; o uso de agregação global precisa estar descrito e auditado.

### Viabilidade técnica

Os payloads oficiais comportam os fatos necessários, mas a Riot não entrega
as estatísticas globais já agregadas. O Sparta teria de:

1. definir uma população-alvo por plataforma, fila, elo e período;
2. sortear jogadores de modo estratificado;
3. buscar e deduplicar IDs de partidas;
4. validar patch, duração/remake, fila e posição;
5. persistir observações mínimas ou agregados reprodutíveis;
6. calcular denominadores, amostras e cobertura;
7. publicar somente grupos que cumpram uma política estatística aprovada.

O tempo para formar amostra, custo de banco/worker/tráfego e capacidade real
por método não podem ser afirmados sem um piloto autorizado. O custo da API
não é publicado como tarifa; isso não torna armazenamento, processamento,
observabilidade e operação gratuitos.

### Regiões

League usa rotas de plataforma e rotas regionais diferentes. Uma população
multirregional exige amostragem separada, roteamento correto, quotas e
monitoramento por região. Misturar BR1, NA1, KR ou qualquer outra plataforma
sem manter `region` no contexto é proibido.

O primeiro piloto deve usar uma única plataforma, fila e conjunto de tiers
explicitamente aprovados. Expansão só ocorre depois de medir viés, custo,
latência e cobertura; um piloto local não pode ser rotulado como global.

### Viés e qualidade

Riscos que o plano de coleta deve medir:

- viés de seed ao selecionar jogadores visíveis na ladder;
- sobreposição de partidas entre jogadores amostrados;
- tiers, plataformas e horários com pesos diferentes;
- posições ausentes ou ambíguas;
- mudanças de patch durante a janela;
- remakes e filas que alteram denominadores;
- campeões raros e matchups com amostra esparsa;
- sobrevivência de amostra entre períodos;
- indisponibilidade seletiva causada por rate limit.

Não haverá threshold de elegibilidade nesta etapa. Ele deve ser calibrado
depois do piloto usando tamanho de amostra, participação relativa por posição,
estabilidade em mais de um período, fila, elo e patch.

### Viabilidade jurídica

As políticas oficiais permitem produtos registrados e conteúdo
transformativo, mas a licença é revogável e condicionada ao uso aprovado. Os
termos:

- proíbem usar o produto como data broker;
- exigem proteção da API key e uma chave por produto;
- permitem à Riot alterar limites e acesso;
- exigem aprovação prévia para certos usos comerciais da informação;
- impõem obrigações relacionadas a dados pessoais e pedidos de exclusão;
- determinam cessação de uso e exclusão de Game Information ao término.

Antes do piloto é necessária confirmação, pelo canal do produto no Developer
Portal, de que a coleta amostral, retenção e exposição dos agregados propostos
estão cobertas. Este ADR não substitui análise jurídica.

## Opção 2 — GRID

Riot identifica GRID como distribuidor de dados oficiais de **LoL Esports**.
GRID oferece feed oficial, histórico e API, com acesso não comercial sujeito
a aprovação e acesso comercial sob orçamento.

Pontos positivos:

- origem oficial para competições cobertas;
- telemetria granular e histórico;
- licenciamento por finalidade;
- infraestrutura e formato padronizado.

Limites para o Sparta:

- população de competições profissionais, não ladder ranqueada;
- não oferece os cortes de elo, fila e plataforma requeridos para o meta de
  jogadores;
- preço comercial é sob consulta;
- licença depende da finalidade, do título e da continuidade dos direitos;
- os termos públicos de Open Data consultados são de 2022 e descrevem early
  access; condições atuais precisariam de contrato confirmado.

**Decisão:** não serve como fonte principal do meta ranqueado. Pode ser
reavaliado no futuro para um produto separado de esports, sem misturar suas
estatísticas com a população de jogadores.

## Opção 3 — PandaScore

PandaScore documenta API autenticada de esports, versionamento por patch,
partidas, dados pós-jogo e estatísticas de jogadores/equipes.

Em 2026-07-28, a página oficial informava:

- fixtures: gratuito, 1.000 requisições/hora;
- histórico/pós-jogo: a partir de EUR 400 por jogo/mês, 10.000
  requisições/hora;
- live básico: a partir de EUR 1.000 por jogo/mês;
- live pro: preço sob consulta.

Os termos permitem reprodução informativa no próprio site, proíbem
redistribuição do dado bruto, exigem atribuição “Source: PandaScore” e
reservam restrições específicas para produtos e planos.

Limites para o Sparta:

- cobertura é de esports, não da ladder ranqueada;
- estatísticas são orientadas a partidas, equipes e jogadores profissionais;
- não há granularidade documentada de tier/fila/plataforma da população de
  jogadores;
- matchup de campeões, pick/ban rate por posição e builds de ladder não são
  produtos confirmados;
- assinatura paga não corrige a incompatibilidade da população.

**Decisão:** rejeitada como fonte principal. O custo conhecido é registrável,
mas não justifica usar uma população inadequada.

## Opção 4 — Abios

Abios documenta REST/Push APIs de esports, resultados head-to-head, itens de
jogador, play-by-play e histórico de 180 ou 365 dias conforme o pacote. Os
limites públicos são 5 requisições/s no pacote Match e 10 requisições/s no
Play-by-Play; preços exigem contato comercial. Direitos de server data,
termos, disponibilidade e granularidade variam por torneio e detentor.

A parceria com GRID dá acesso oficial a determinados feeds de LoL Esports,
mas não transforma a cobertura em uma amostra da ladder.

**Decisão:** rejeitada como fonte principal. Licença, preço, redistribuição e
cobertura exata exigiriam proposta comercial; os cortes de meta ranqueado não
estão documentados.

## Opção 5 — scraping

Scraping foi avaliado apenas para ser rejeitado.

Dados visíveis em uma página não constituem API pública nem licença de
redistribuição. Sem contrato e documentação oficial não é possível provar:

- autorização de coleta e uso comercial;
- origem e população da amostra;
- estabilidade de campos e denominadores;
- direito de armazenar, transformar e redistribuir;
- SLA, histórico ou aviso de mudanças.

Também há riscos de termos de serviço, `robots`, bloqueios, mudanças de HTML,
anti-bot e resultados silenciosamente incompletos. O Sparta não implementará
scraping nem tratará endpoints privados do navegador como APIs públicas.

## Matriz comparativa

| Critério | Riot, agregação própria | GRID | PandaScore | Abios | Scraping |
|---|---|---|---|---|---|
| População ranqueada | Sim, a coletar | Não documentada; esports | Não; esports | Não; esports | Incerta |
| Origem/licença | Oficial, condicionada à aprovação | Oficial para competições cobertas | Contrato comercial do provider | Contrato e direitos por cobertura | Não demonstrada |
| Patch | Match-V5 | Conforme competição/feed | Versão por partida | Conforme cobertura | Incerto |
| Posição | Match-V5, com ausência preservada | Contexto de competição | Jogador profissional, não tier de ladder | Contexto de competição | Incerto |
| Elo | Amostragem via ladder | Não aplicável | Não aplicável | Não aplicável | Talvez exibido, sem contrato |
| Região/plataforma | Sim, coleta separada | Liga/competição | Liga/competição | Liga/competição | Incerto |
| Fila | `queueId` | Competição | Competição | Competição | Incerto |
| Matchup por campeão | Derivável | Possível em esports | Não confirmado como produto | Head-to-head de equipes; campeão não confirmado | Incerto |
| Win/pick/ban | Derivável | Em esports | Parcial/competição | Parcial/competição | Incerto |
| Builds/runas | Derivável do Match-V5 | Telemetria de esports | Itens/spells documentados em esports | Itens documentados em esports | Incerto |
| Amostra transparente | Sparta deve publicar | Depende do feed | Depende do plano | Depende do contrato | Geralmente opaca |
| Histórico | A formar e manter | Disponível conforme licença | Plano histórico | 180/365 dias publicados | Instável |
| Custo | Infra desconhecida; API sem preço publicado | Não comercial aprovado ou orçamento | Valores públicos iniciais | Sob consulta | Custo oculto e risco alto |
| Rate limit | Por chave/método/serviço/região | Por plano/contrato | 1k ou 10k/h | 5 ou 10/s publicados | Bloqueio imprevisível |
| Redistribuição | Somente dentro do uso Riot aprovado | Por finalidade/licença | Processado com restrições e atribuição | A confirmar em contrato | Não demonstrada |
| Operação | Alta | Média | Média | Média | Alta e frágil |
| Compatibilidade | Melhor candidata | População errada | População errada | População errada | Inaceitável |

## Contrato de domínio

Os tipos ficam em:

- `packages/core/src/global/global-statistics.ts`;
- `packages/core/src/global/global-statistics-provider.ts`.

O domínio não importa SDK, payload ou tipo próprio de Riot, GRID, PandaScore
ou Abios.

### Contexto obrigatório

`GlobalStatisticContext` contém:

- `patch`, `role` e `queueId`;
- `region` e `tier`, sempre presentes como valor ou `null`;
- `sampleSize`;
- `collectedAt`, `freshUntil` e `staleUntil`;
- `provider` e `providerDataset`;
- `adapterVersion`.

Uma métrica disponível deve ter coleta real e amostra interpretável. No
provider indisponível, `sampleSize` é `0` e datas/dataset são `null`; isso
descreve ausência, não uma estatística de valor zero.

`GlobalStatisticProvenance` repete fornecedor, dataset, adapter e filtros
aplicados em cada métrica. `cache`, quando existir no futuro, é metadado de
transporte e não altera fornecedor ou dataset.

### Recursos

O contrato comporta:

- `GlobalChampionRoleStatistics`: win, pick e ban rate;
- `GlobalMatchupStatistics`: jogos, win rate e diferença de ouro aos 15;
- `GlobalBuildStatistics`: conjuntos de itens, páginas de runas e pares de
  feitiços, com disponibilidade independente;
- `GlobalRoleEligibility`: decisão e evidências de jogos, participação por
  posição e estabilidade;
- `GlobalDatasetStatus`: disponibilidade do dataset pedido.

`GlobalStructuredMetric<T>` é uma união discriminada:

- `AVAILABLE`/`PARTIAL` exigem valor;
- `STALE` exige motivo;
- `UNAVAILABLE` força `value: null`.

Não existe construtor que converta ausência em `0` ou `50`.

### Interface do fornecedor

`GlobalStatisticsProvider` expõe:

```ts
getChampionRoleStatistics(query)
getMatchupStatistics(query)
getBuildStatistics(query)
getRoleEligibility(query)
getDatasetStatus(query)
```

`UnavailableGlobalStatisticsProvider` é a implementação operacional padrão.
Ela valida o contexto, devolve indisponibilidade estruturada, não lê ambiente,
não acessa rede, não consulta histórico pessoal e não usa fixtures.

## Elegibilidade global futura

Elegibilidade será uma decisão derivada, nunca a presença de um único jogo ou
`pickRate > 0`.

A política comporta:

- tamanho mínimo de amostra;
- participação relativa naquela posição;
- estabilidade por múltiplos períodos;
- patch, fila, elo e região.

Todos os thresholds ficam `null` e a política fica `NOT_CONFIGURED` nesta
etapa. Até calibração e aprovação:

```ts
status: "UNAVAILABLE"
eligible: null
```

Smite, histórico pessoal, `ChampionTag` e classes da Data Dragon não são
evidência de elegibilidade global.

## Separações epistemológicas

| Conceito | Fonte |
|---|---|
| Matchup pessoal | Partidas da conta vinculada |
| Matchup global | População definida por um dataset global |
| Meta Intelligence | Uso e resultado observados naquela população |
| Patch Intelligence | Mudança oficial publicada pela Riot |
| Impacto teórico | Interpretação calculada da mudança |
| Build pessoal | Configurações observadas da conta vinculada |
| Build global | Configurações agregadas da população global |

Buff, nerf, tag de campeão, classe, conhecimento embutido e dado pessoal não
provam força no meta.

## Cache e resiliência futuros

Nenhum destes caches foi implementado. São defaults propostos, sujeitos ao SLA
e ao ritmo da fonte aprovada:

| Recurso | Fresh | Stale máximo | Falha |
|---|---:|---:|---|
| Status do dataset | 5 min | 15 min | `UNAVAILABLE` sem cópia |
| Campeão/posição e elegibilidade | 6 h | 24 h | stale identificado |
| Matchup | 12 h | 48 h | stale identificado |
| Builds/runas/feitiços | 12 h | 48 h | stale identificado |

Chave de cache:

```txt
provider + dataset + adapterVersion + patch + queueId + region + tier
+ role + championId + opponentChampionId(quando aplicável)
```

Mudança de patch invalida o contexto corrente. O patch anterior pode existir
como histórico, mas nunca ser apresentado como atual.

A integração deve reutilizar a Etapa 9:

- timeout explícito;
- no máximo quatro tentativas apenas em leitura idempotente;
- retry somente em timeout, 429 e 502/503/504;
- respeito a `Retry-After`, backoff e jitter;
- erro sanitizado;
- stale somente dentro da janela;
- concorrência configurada por provider e chave, começando em `1` no piloto e
  aumentando apenas após medir os limites reais;
- 429 interrompe expansão de coleta, não gera loops agressivos.

## Segurança futura

Se a candidata for aprovada:

- segredo fica somente no backend/worker ou secret manager;
- Electron nunca recebe token do provider;
- desenvolvimento e produção usam credenciais e datasets separados;
- rotação revoga a credencial anterior;
- logs não contêm token, URL assinada, header, PUUID ou payload bruto;
- endpoints do Sparta consultam agregados, não disparam coleta por usuário;
- rate limit por usuário e proteção contra enumeração são obrigatórios;
- acesso interno ao dataset é mínimo e auditável.

Configuração futura, sem valores no repositório:

- `GLOBAL_STATS_PROVIDER`;
- `GLOBAL_STATS_DATASET`;
- `GLOBAL_STATS_MAX_CONCURRENCY`;
- segredo específico do provider em armazenamento seguro.

Para agregação Riot, deve-se avaliar reutilizar `RIOT_API_KEY` do produto ou
uma arquitetura autorizada pela Riot; não se cria uma segunda chave para
contornar limites.

## Condições para prosseguir

A integração só pode começar depois de aprovação explícita destes itens:

1. registro/atualização do Sparta no Developer Portal;
2. Production Key aprovada para o caso de agregação e exibição global;
3. confirmação de retenção, agregação, exclusão e uso comercial pretendidos;
4. população-alvo do piloto: plataforma, fila, tiers, período e exclusões;
5. orçamento de banco, worker, tráfego e observabilidade;
6. meta de amostra e método de avaliação de viés, definidos pelo piloto, não
   inventados antecipadamente;
7. revisão de privacidade e procedimento de exclusão;
8. aprovação do plano de cache, rate limit e operação.

Se a Riot não aprovar esse uso, a decisão volta para `BLOCKED`. GRID,
PandaScore ou Abios só podem ser reconsiderados mediante proposta que
comprove cobertura de partidas ranqueadas e direito de uso correspondente;
uma licença de esports não basta.

## Plano da etapa seguinte, ainda não autorizado

Depois das aprovações:

1. implementar um adapter Riot atrás de `GlobalStatisticsProvider`;
2. executar piloto pequeno e isolado, sem exposição ao ranking;
3. medir volume, custo, viés, latência e cobertura;
4. revisar denominadores e regras de posição;
5. calibrar política de elegibilidade sem usar win rate como atalho;
6. validar cache/resiliência e provenance end-to-end;
7. só então propor habilitação de Meta Intelligence.

Este plano não autoriza a etapa seguinte.

## Verificação da Etapa 18

Testes de contrato garantem:

- nenhuma métrica indisponível recebe zero ou 50;
- nenhuma chamada externa ou leitura de credencial ocorre;
- patch, posição, fila, região e elo não são combinados;
- matchup pessoal não satisfaz o contrato global;
- cache preserva fornecedor/dataset;
- builds globais ficam separadas do histórico pessoal;
- elegibilidade é nula e sem thresholds;
- mesmo input produz o mesmo resultado;
- ranking, score e cobertura permanecem invariantes.
