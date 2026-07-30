# Revisão humana auditável do motor

Domínio: `packages/core/src/review/draft-review.ts` (puro).
Persistência: `apps/api/src/modules/reviews/draft-review-repository.ts`.
Rotas: `apps/api/src/modules/reviews/routes.ts`.
Migration: `20260730100000_draft_review`.

## Para que serve

A Etapa 23 tornou as decisões históricas observáveis. Antes de mexer em peso, fórmula ou
threshold, é preciso saber **o que um humano acha dos casos reais** — e isso não existia.

## O que este fluxo deliberadamente NÃO faz

- **Não usa vitória ou derrota como rótulo.** Uma recomendação boa pode perder e uma ruim pode
  ganhar. Nenhuma avaliação é derivada do resultado; o revisor é quem avalia.
- **Não produz nota geral, percentual de acerto nem versão vencedora.** A escala é qualitativa e
  permanece qualitativa: `STRONG` não é 4 e `WEAK` não é 1, e somar dimensões diferentes daria uma
  média sem significado.
- **Não sugere calibração.** As tags são itens de investigação, não correções confirmadas, e nada
  aqui realimenta o motor.
- **Não toca no que já foi gravado.** Sessão, snapshot, ranking, métricas e relatório pós-game são
  lidos e nunca escritos.

## Duas fases

### Fase cega

O revisor avalia seis dimensões — coerência do ranking, encaixe estratégico, representação da
experiência pessoal, tratamento do risco de execução, honestidade sobre limitações e utilidade
prática — e registra problemas percebidos.

**O modo cego é garantido pelo backend.** Enquanto `resultRevealedAt` for nulo, o repositório
**não consulta** partida, relatório pós-game nem estatística. O contexto devolvido é do tipo
`BlindReviewContext`, que não tem campo de resultado: para vazar dado posterior alguém teria que
mudar o tipo, e a mudança aparece no diff. Não é CSS escondendo nada — o dado não sai do servidor.

Medido contra a API real: revelar antes de submeter a fase cega responde `409`; reescrever a fase
cega depois de submetida responde `409`.

### Fase pós-resultado

Revelar é ação explícita (`POST /draft-reviews/:id/reveal-result`) e acontece uma vez só. Depois
dela o revisor avalia correspondência observada, utilidade das explicações, informação que faltava
e clareza do relatório, e pode marcar o caso para investigação.

**A avaliação prévia permanece imutável**: o `update` da fase pós não inclui `preMatchJson`, e a
máquina de estados não aceita voltar para `PRE_MATCH_REVIEWED`.

## Escala

| Nível | Critério |
|---|---|
| `STRONG` | A conclusão é diretamente sustentada pelos sinais disponíveis no snapshot |
| `ADEQUATE` | A conclusão é útil, mas tem limitações claras |
| `WEAK` | A conclusão não representa bem as evidências disponíveis |
| `INSUFFICIENT_DATA` | O snapshot não permite avaliar esta dimensão |
| `NOT_APPLICABLE` | A dimensão não se aplica a este caso |

Cada dimensão e cada tag também têm definição publicada em `GET /draft-reviews/form`.

## Ciclo de vida

`IN_PROGRESS` → `PRE_MATCH_REVIEWED` → `COMPLETED` **ou** `NEEDS_INVESTIGATION`.

Os dois últimos são terminais: uma revisão finalizada não volta atrás. Corrigir cria uma **revisão
nova** apontando para a anterior (`supersedesReviewId` + `correctionReason`); a antiga recebe
`supersededAt` e **o conteúdo dela permanece intacto**.

## Casos sem snapshot ou sem partida

- **Sem snapshot vigente no lock-in**: `rankingCoherence` só aceita `INSUFFICIENT_DATA` ou
  `NOT_APPLICABLE`. Qualquer outro valor responde `422 RANKING_NOT_ASSESSABLE` — não há ordem a
  julgar.
- **Sem partida vinculada**: revelar devolve `match: null` com o motivo. A revisão continua válida
  como revisão só-pré-resultado; não se inventa desfecho.

## Agregado

`GET /players/draft-review-summary` devolve contagens **sempre com denominador**: revisões
consideradas, concluídas, ainda cegas, marcadas para investigação, com dados insuficientes,
distribuição por dimensão, frequência de tags (inclusive as com zero), e versões de motor e de
formulário representadas.

Só entram revisões **atuais** (`supersededAt` nulo) — contar a corrigida e a corretora contaria o
mesmo caso duas vezes.

## Segurança

Toda operação filtra por `riotAccountId`. Revisão ou sessão de outra conta responde `404`, nunca o
conteúdo. Anotações livres são sanitizadas (controle removido, espaços normalizados, corte em
2000 caracteres) e permanecem opcionais; ausência de nota é ausência, não string vazia.

## Onde fica na interface

A ação **"Revisar este draft"** vive no **Histórico de drafts**, que é a tela com sessões
individuais. O Histórico do Motor (Etapa 23) é agregado e não tem linha por sessão — colocar a
ação lá exigiria construir uma lista de casos que aquela tela não tem.

A tela mostra `Resultado ainda oculto`, `Avaliação pré-partida concluída`, `Resultado revelado` e
`Caso marcado para investigação`, e **não** é ferramenta de ajuste de pesos.
