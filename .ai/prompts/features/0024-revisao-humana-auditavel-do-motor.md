---
status: IMPLEMENTADA
solicitado_em: 2026-07-30 09:15
implementado_em: 2026-07-30 16:40
---

# Revisão humana auditável do motor

## Pedido original

> # ETAPA 24 — Revisão humana auditável do motor
>
> ## Contexto
>
> A Etapa 23 criou observabilidade longitudinal descritiva sobre decisões históricas do motor.
> Antes de alterar pesos, fórmulas ou thresholds, o Sparta precisa permitir revisão humana
> estruturada dos casos reais, separando: qualidade da recomendação antes da partida; qualidade das
> explicações; honestidade sobre dados ausentes; resultado posterior da partida; possíveis
> problemas do motor que exigem investigação. **Vitória ou derrota não pode ser usada
> automaticamente como rótulo de recomendação correta ou incorreta.**
>
> ## Objetivo
>
> Criar um fluxo de revisão manual para sessões de draft vinculadas, usando snapshot original
> vigente no lock-in, recomendações e alternativas registradas, campeão escolhido, contexto
> disponível naquele momento, relatório pós-game e versões dos algoritmos. A revisão gera evidência
> humana auditável, **sem modificar o snapshot histórico e sem alterar o motor**.
>
> ## Revisão em duas fases
>
> **Pré-resultado**: avaliar coerência do ranking, encaixe estratégico, representação da
> experiência pessoal, tratamento do risco de execução, clareza das explicações, visibilidade das
> limitações, honestidade da cobertura e utilidade prática. Resultado, KDA e estatísticas
> posteriores permanecem ocultos.
>
> **Pós-resultado**: depois da avaliação inicial, revelar a partida e registrar correspondências
> observadas, limitações evidentes, dados posteriores que não poderiam ser conhecidos no draft,
> problemas de explicação e necessidade de investigação. A avaliação inicial permanece preservada.
>
> ## Contrato
>
> `DraftReview` com `id`, `playerId`, `draftSessionId`, `snapshotId`, `matchId | null`, `status`
> (`IN_PROGRESS`/`PRE_MATCH_REVIEWED`/`COMPLETED`/`NEEDS_INVESTIGATION`), `preMatchAssessment`,
> `postMatchAssessment`, `createdAt`, `completedAt`, `reviewVersion`. `PreMatchAssessment` com
> `rankingCoherence`, `strategicExplanation`, `personalContextRepresentation`,
> `executionRiskRepresentation`, `uncertaintyHonesty`, `practicalUsefulness`, `issueTags`, `notes?`
> e `submittedAt`.
>
> ## Escala
>
> `STRONG`, `ADEQUATE`, `WEAK`, `INSUFFICIENT_DATA`, `NOT_APPLICABLE`. **Não transformar em nota
> numérica geral.** Cada dimensão com definição documentada.
>
> ## Problemas registráveis
>
> `MISSING_DATA`, `WRONG_ROLE_CONTEXT`, `STALE_SOURCE`, `LOW_COVERAGE_NOT_CLEAR`,
> `PERSONAL_EVIDENCE_MISREPRESENTED`, `STRATEGIC_SIGNAL_MISREPRESENTED`,
> `EXECUTION_RISK_MISREPRESENTED`, `DUPLICATED_SIGNAL`, `CONTRADICTORY_EXPLANATION`,
> `RANKING_SURPRISE`, `POOL_LIMITATION`, `MATCHUP_CONTEXT_MISSING`, `OTHER`. Uma tag representa um
> item para investigação, não uma correção confirmada. Comentários livres opcionais e sanitizados.
>
> ## Imutabilidade e revisões
>
> Não alterar sessão histórica, snapshot, ranking, score, métricas nem relatório pós-game. Revisões
> armazenadas separadamente. Correção preserva a versão anterior, cria nova revisão, registra data
> e motivo, não sobrescreve em silêncio. Várias revisões por sessão, mas **apenas uma revisão atual
> por revisor e versão do formulário**.
>
> ## Controle de viés retrospectivo
>
> A fase pré-resultado não recebe dados da partida; a API não envia resultado nem estatísticas
> enquanto a revisão estiver cega; revelar é ação explícita; a avaliação prévia permanece imutável
> depois da revelação. **O modo cego deve ser garantido pelo backend, não somente escondido por
> CSS.**
>
> ## Avaliação do ranking
>
> Não permitir: recalcular candidatos com o algoritmo atual; adicionar score retroativo a escolha
> fora do snapshot; simular resultado de campeão não escolhido; rotular automaticamente o primeiro
> colocado como correto; rotular escolha fora do snapshot como erro. `RANKING_SURPRISE` significa
> apenas que o caso merece investigação.
>
> ## Resultado da partida
>
> A avaliação pós-resultado registra fatos (posição observada divergente, ameaça prevista que
> apareceu, risco de execução com dificuldades observadas, informação indisponível, explicação
> pouco útil). **Não permitir conclusões automáticas de causalidade.** Não usar o resultado para
> alterar a avaliação prévia.
>
> ## API
>
> `POST /draft-sessions/:sessionId/reviews`, `GET /draft-sessions/:sessionId/reviews`,
> `POST /draft-reviews/:reviewId/pre-match`, `POST /draft-reviews/:reviewId/reveal-result`,
> `POST /draft-reviews/:reviewId/post-match`, `GET /players/:playerId/draft-review-summary`.
> Isolamento por conta. O backend controla estado, dados permitidos antes da revelação, transições
> válidas, revisões históricas e acesso ao resultado.
>
> ## Interface
>
> Ação `Revisar este draft` no Histórico do Motor. Fluxo: snapshot e contexto original → avaliar
> dimensões → registrar problemas → finalizar fase cega → revelar partida → avaliar
> correspondências → salvar. Mostrar `Resultado ainda oculto`, `Avaliação pré-partida concluída`,
> `Resultado revelado`, `Caso marcado para investigação`. Não transformar em ferramenta de ajuste
> de pesos.
>
> ## Resumo
>
> Agregados descritivos: casos revisados; distribuição por dimensão; tags mais frequentes; casos
> pendentes de investigação; versões representadas; revisões com dados insuficientes. Sempre com
> contagens e denominadores. Não produzir nota geral, percentual de acerto, versão vencedora, peso
> recomendado nem ajuste automático.
>
> ## Restrições
>
> Não: alterar pesos, fórmulas, thresholds ou ranking; recalcular snapshots; criar contrafactuais;
> usar vitória como rótulo; gerar recomendações de calibração; iniciar ML; criar A/B; comparar
> versões sem contexto compatível; permitir edição da avaliação cega após revelar; expor dados de
> outro jogador; misturar com Dependabot.
>
> ## Casos críticos
>
> Fase cega sem nenhum dado posterior; resultado só após ação explícita; avaliação prévia não
> editável depois; snapshot imutável; escolha fora do snapshot sem score; vitória não gera avaliação
> positiva automática; derrota não gera negativa; revisão corrigida preserva a anterior; usuário não
> acessa revisão de outra conta; sessão sem snapshot não recebe avaliação de ranking; sessão sem
> partida recebe apenas revisão pré-resultado; tags não alteram o motor; agregados com numerador e
> denominador; mesma revisão não contada duas vezes.

## Auditoria (feita antes de implementar)

1. **Nada de revisão humana existe hoje.** Busca por `DraftReview`/`draftReview`/`reviewRating` em
   `apps/` e `packages/` (fora de `dist`) retorna **zero** ocorrências, e o schema não tem nenhuma
   tabela de avaliação. É construção nova, sem modelo antigo a reaproveitar ou substituir.
2. **O snapshot vigente no lock-in já tem seletor pronto.** `selectSnapshotAtLockIn`
   (`apps/api/src/modules/observability/recommendation-observability-repository.ts`) escolhe o
   snapshot com `createdAt <= lockedInAt` e `supersededAt` nulo ou posterior ao lock-in. É
   exatamente a regra que esta etapa precisa; será reusada em vez de reimplementada.
3. **A sessão já carrega tudo que a fase cega precisa** — `knownDraftJson`, `role`, `roleSource`,
   `source`, `selectedChampionId`, `lockedInAt` — e o snapshot carrega ranking, grupo, métricas,
   pesos efetivos, motivos, limitações e `algorithmVersionsJson` (Etapa 16). Nenhum recálculo é
   necessário para exibir o contexto original.
4. **O resultado da partida vive fora da sessão**: `PostgameReport` (por `matchId`+`puuid`) e
   `Match`/`MatchParticipant`. `DraftSession.linkedMatchId` só é preenchido com vínculo confiável
   (Etapa 21), e `matchLinkStatus` distingue `PENDING`/`LINKED`/`AMBIGUOUS`/`UNLINKABLE`/
   `NOT_APPLICABLE`. Isso torna o modo cego implementável no backend: basta **não consultar** essas
   fontes enquanto a revisão não foi revelada.
5. **Sessão sem partida é caso real e comum** — a maioria das sessões locais está `PENDING`. O
   fluxo precisa aceitar revisão só-pré-resultado sem inventar desfecho.
6. **A tela do Histórico do Motor existe** (`features/MotorHistoryScreen.tsx`) e é onde a ação
   `Revisar este draft` deve entrar.

## Notas de implementação

### Decisões

- **Modo cego por tipo, não por convenção.** `BlindReviewContext` não tem campo de resultado.
  Não é disciplina do desenvolvedor lembrar de não enviar: para vazar, alguém precisa acrescentar
  o campo ao tipo, e isso aparece no diff e quebra o teste que fixa as chaves permitidas.
- **`NEEDS_INVESTIGATION` é terminal paralelo a `COMPLETED`**, não um estado intermediário. A
  revisão está pronta; o que muda é o revisor ter sinalizado que o caso merece ser olhado.
- **Correção nasce como revisão nova.** Sobrescrever apagaria a evidência de que a opinião mudou,
  que é justamente o que uma revisão auditável precisa preservar.
- **`sanitizeReviewNotes` não escapa HTML.** O destino é banco + React (que já escapa); escapar
  aqui gravaria `&lt;` e corromperia o texto do revisor. Remove controle, normaliza espaço, corta.
- **Ranking sem snapshot é recusado**, não tolerado com valor neutro: sem snapshot não existe
  ordem a julgar, e aceitar `STRONG` ali seria registrar opinião sobre nada.
- **O agregado só conta revisões atuais.** Somar a corrigida e a corretora contaria o mesmo caso
  duas vezes e inflaria toda distribuição.

### Desvio consciente na interface

O pedido diz para colocar `Revisar este draft` no **Histórico do Motor**. Aquela tela (Etapa 23) é
**agregada** — distribuições, faixas, versões — e **não tem linha por sessão**, então não há de
onde tirar um `draftSessionId`. A ação foi colocada no **Histórico de drafts**, que é a tela com
sessões individuais; o comportamento pedido é o mesmo, só o ponto de entrada muda. Construir uma
lista de casos dentro do Histórico do Motor seria trabalho novo além do escopo desta etapa.

### Testes

47 novos, 780 no total: 31 em `draft-review.test.ts` (definições publicadas para escala,
dimensões e tags; ciclo de vida; fase cega não reabre; ranking sem snapshot; sanitização;
agregado com denominador; **ausência de nota geral, percentual de acerto e de qualquer campo de
vitória/derrota**; contrato do contexto cego travado por chaves) e 16 em `reviews/routes.test.ts`
(autenticação, isolamento por conta, 404 para sessão de outro, contexto sem dado da partida,
revelar antes/depois, fase cega imutável, pós sem revelar, escala e tags inválidas recusadas pelo
schema, resumo sem nota geral).

### Validação real (API + Postgres, conta Zekerus#117)

| Passo | Resultado |
|---|---|
| Abrir revisão | Contexto com 11 chaves, **nenhum** dado de partida (`won`/`kills`/`postgame` ausentes) |
| Revelar antes da fase cega | `409` |
| Submeter fase cega | `PRE_MATCH_REVIEWED`, tags `RANKING_SURPRISE` + `MISSING_DATA` |
| Reescrever a fase cega | `409` |
| Pós-partida sem revelar | `409` |
| Revelar (ação explícita) | `resultRevealedAt` gravado; sem partida vinculada → motivo honesto, `match: null` |
| Pós-partida com investigação | `NEEDS_INVESTIGATION`; pré-match preservado (`WEAK` intacto) |
| Correção | Revisão nova apontando para a anterior; a antiga com `supersededAt` e conteúdo intacto |
| Resumo | Conta **1** revisão atual (não 2), com denominador; sem nota geral |

### Limite da validação

O painel de revisão foi validado por typecheck, lint, build e pelos caminhos reais da API que ele
consome, **mas não foi aberto no Electron real nesta etapa**.
