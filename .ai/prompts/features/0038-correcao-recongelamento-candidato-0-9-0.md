---
status: EM_ANDAMENTO
solicitado_em: 2026-08-05 15:40
implementado_em:
---

# Etapa 30A — Correção e recongelamento do candidato 0.9.0

## Pedido original

> Corrigir pela origem a inclusão de fixtures no `app.asar`, criar uma inspeção automática do
> pacote real, corrigir o gerador de inventário para rejeitar artefatos antigos ou ambíguos,
> regenerar do zero o candidato local `0.9.0` e revalidar instalador, operação e replay. Produzir
> parecer `READY_FOR_DESKTOP_PUBLICATION` somente se o único bloqueio restante for a ausência de
> infraestrutura real da API; caso contrário, manter `BLOCKED`. Não criar tag, GitHub Release,
> imagem remota nem iniciar a Etapa 31.

## Notas de implementação

Corrigida a cadeia de produção do `@sparta/riot`: o build agora limpa `dist` e exclui testes e
fixtures, enquanto o electron-builder exclui de forma geral fixtures, mocks, snapshots, testes,
fontes TypeScript e source maps inclusive dentro de dependências linkadas do workspace.

Adicionada inspeção do `app.asar` real e descoberta estrita de artefatos com validação de
metadados internos. Doze testes novos cobrem o pacote ASAR real, caminhos/conteúdos proibidos,
artefatos antigos ou ambíguos, metadados divergentes e separação entre saída gerada e fonte.

A regeneração limpa, os testes do instalador e a validação operacional ainda serão executados a
partir do commit desta correção.
