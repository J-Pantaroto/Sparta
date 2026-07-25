# Prompts de feature

Um arquivo por feature solicitada pelo usuário. Serve pra rastrear o que foi pedido, o status
atual e, quando implementada, apontar pra entrada correspondente em `.ai/CHANGELOG.md`.

## Convenção de nome

```txt
NNNN-slug-curto.md
```

`NNNN` é sequencial (`0001`, `0002`, ...), zero-padded a 4 dígitos. `slug-curto` é um resumo
em kebab-case da feature. Exemplo: `0002-cache-de-matchups.md`.

## Formato do arquivo

Front matter obrigatório no topo, seguido do conteúdo livre:

```markdown
---
status: PENDENTE
solicitado_em: 2026-07-25 12:00
implementado_em:
---

# Título curto da feature

## Pedido original

> Cole aqui o pedido do usuário, o mais próximo do literal possível.

## Notas de implementação

(preenchido durante/depois da implementação — decisões, arquivos tocados, testes adicionados,
o que ficou de fora)
```

## Testes automatizados

Sempre que necessário/possível, toda feature ou bug-fix implementado por esta convenção ganha
teste automatizado cobrindo o comportamento novo (unitário em `packages/core`, integração na
API, etc.) — não só rodar a suíte já existente. Registrar isso nas "Notas de implementação" do
arquivo (quais testes, onde) e, quando não for possível testar automaticamente (ex.: depende do
League Client real aberto), explicar o motivo ali mesmo. Ver regra 11 em "Regras de
implementação" no `.ai/CLAUDE.md`.

## Valores válidos de `status`

| Status | Significado |
|---|---|
| `PENDENTE` | Pedido recebido, ainda não iniciado. |
| `EM_ANDAMENTO` | Implementação em progresso na sessão atual. |
| `IMPLEMENTADA` | Concluída, testada e enviada (commit + push pra `main`). |
| `BLOQUEADA` | Não dá pra avançar agora (falta credencial, decisão do usuário, dependência externa). Explicar o motivo nas notas. |
| `IGNORADA` | Decidido explicitamente não fazer (fora de escopo, redundante, etc.), com o motivo registrado. |
| `CANCELADA` | Pedida e depois cancelada pelo próprio usuário antes de ser implementada. |

## Regra de execução

Ao **receber** um novo pedido de feature: criar o arquivo aqui com `status: PENDENTE` antes de
começar a implementar.

Ao **concluir** (ou mudar de status por qualquer motivo): atualizar o campo `status` (e
`implementado_em` quando virar `IMPLEMENTADA`, com data e hora reais da execução — não a data
do pedido) e adicionar uma entrada nova no topo de `.ai/CHANGELOG.md` apontando pra este
arquivo. Ver `.ai/CHANGELOG.md` pro formato da entrada.
