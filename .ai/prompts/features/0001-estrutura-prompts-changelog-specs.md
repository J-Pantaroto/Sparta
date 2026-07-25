---
status: IMPLEMENTADA
solicitado_em: 2026-07-25 11:49
implementado_em: 2026-07-25 12:05
---

# Estrutura de prompts/features, changelog automático e specs em `.ai/`

## Pedido original

> Crie uma estrutura de pastas dentro de `.ai` para prompts/features; Adicione um cabeçalho em
> cada nova feature solicitada contendo o status atual dela (PENDENTE/IMPLEMENTADA/IGNORADA/etc)
>
> Documente todas as features no CHANGELOG.md (dentro de `.ai`), sempre que uma feature for
> implementada, adicione um cabeçalho com a data/hora da execução de cada feature
> automaticamente;
>
> Leia as specs atuais do projeto e salve em uma pasta "specs" dentro de `.ai`;

> Adicione uma regra em `.ai` para sempre que necessário/possível criar e executar testes
> automatizados no projeto para cada nova feature/bug-fix implementado.

## Notas de implementação

- `.ai/prompts/features/README.md` — documenta a convenção (nome de arquivo, front matter de
  status, vocabulário de status, regra de quando criar/atualizar o arquivo e o CHANGELOG).
- `.ai/CHANGELOG.md` — criado do zero, populado retroativamente com todas as 31 features/fixes
  já mergeadas em `main` (uma entrada por PR, data/hora real extraída de `git log --merges`),
  mais a unificação de `.ai` via symlinks (commit `f21922f`) e esta própria feature.
- `.ai/specs/` — espelho de `docs/*.md` + `docs/adr/`, com um `README.md` próprio de índice
  explicando que `docs/` continua sendo a fonte de verdade (via de mão única).
- `.ai/CLAUDE.md` ganhou uma seção nova ("Convenções deste repositório") explicando essa
  convenção, pra qualquer agente futuro (Claude/Codex/Agents) seguir sem precisar reler este
  arquivo de prompt.
- Regra 11 nova em "Regras de implementação" do `.ai/CLAUDE.md`: criar e rodar testes
  automatizados por feature/bug-fix sempre que necessário/possível, cobrindo o comportamento
  novo (não só reexecutar a suíte existente); quando não for possível, documentar o motivo nas
  notas do prompt e na entrada do changelog. Refletido também em
  `.ai/prompts/features/README.md` (seção "Testes automatizados").
- Memória de workflow do usuário (`feedback_phase_completion_workflow`, fora do repositório)
  atualizada pra incluir a atualização do status da feature + entrada no CHANGELOG, e a criação
  de testes por feature/fix, como parte dos passos "implementar"/"atualizar os docs" de cada
  step.

Nenhum teste automatizado novo pra este item: é documentação/convenção de processo, sem código
executável envolvido.
