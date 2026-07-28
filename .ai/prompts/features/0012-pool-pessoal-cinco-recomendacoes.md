---
status: IMPLEMENTADA
solicitado_em: 2026-07-27 23:06
implementado_em: 2026-07-27 23:38
---

# Pool pessoal por posição e cinco recomendações

## Pedido original

> Criar um pool pessoal explícito por posição, formado pela união de
> observações Match-V5 normalizadas e inclusões manuais do usuário. Retornar
> até cinco recomendações principais e três alternativas reais, com origem,
> amostra e cobertura independentes, informando pool insuficiente sem
> inferência global ou preenchimento artificial.

## Notas de implementação

Implementado no commit `de5738f`, enviado para `origin/main`.

- Novo `PlayerChampionPoolEntry`, único por conta Riot/campeão/posição, com
  origem observada ou manual, estado e timestamps. A parte observada é
  materializada idempotentemente somente de `MatchObservation` normalizada.
- API autenticada para consultar, adicionar e desabilitar entradas manuais;
  origem é definida no servidor, observações não podem ser removidas como
  manuais e `PATCH` foi incluído no CORS.
- Motor puro `recommendFromPersonalPool`: cinco principais e até três
  alternativas, sem duplicatas, com score/cobertura/pesos/proveniência
  independentes e desempate determinístico. Ausência pessoal ou estratégica
  permanece `null`/`UNAVAILABLE`, sem `0` de desempenho ou `50` artificial.
- Desktop com gerenciamento compacto do pool, contagem por posição, origens,
  amostra, insuficiência estruturada e seção de alternativas. Adapter único
  mantém leitura de API antiga sem inventar candidatos ou origem.
- 22 testes novos no core, repositório/API/CORS e renderer/adapter. Bateria
  final: 527 testes, typecheck, lint e build de produção aprovados.
- Migration aplicada ao Postgres local. Validação com `Zekerus#117`
  materializou 11 entradas observadas (6 Jungle, 1 Mid, 4 Suporte);
  reexecução idempotente e Jungle retornando 5 principais + 1 alternativa,
  todas únicas.

Fora de escopo preservado: nenhuma elegibilidade global, preenchimento de
`ChampionTag.roles`, inferência por classe/tag/Smite, recalibração de scoring,
persistência de draft/ranking ou recomendação de build/runa.
