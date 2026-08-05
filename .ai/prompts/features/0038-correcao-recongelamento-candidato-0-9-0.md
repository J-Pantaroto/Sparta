---
status: IMPLEMENTADA
solicitado_em: 2026-08-05 15:40
implementado_em: 2026-08-05 16:19
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
metadados internos. Treze testes novos cobrem o pacote ASAR real, caminhos/conteúdos proibidos,
artefatos antigos ou ambíguos, metadados divergentes e separação entre saída gerada e fonte.

A regeneração limpa partiu do commit `18ea00544fcfdf8cffb884ad8d7524ffee04db2f` e aprovou o
`app.asar` real com 2.584 entradas e zero achados. O inventário passou a aceitar somente o conjunto
canônico `0.9.0`, com metadados internos coerentes; manifesto, checksums, SBOM e espelho foram
regenerados.

Instalação antiga, atualização pelo candidato novo, execução por `file:` sem Vite e desinstalação
foram exercitadas em caminho com espaços e acento. O pacote instalado teve 75/75 arquivos sem
excedentes, atalhos não duplicados e zero erro de renderer/preload. Na API local, o mesmo input e a
mesma sessão preservaram IDs e snapshot (`UNCHANGED`), os cinco candidatos, release ativa e hashes;
o replay foi `EXACT_REPLAY`, sem divergências, fallback ou erro de hash.

Parecer final: `READY_FOR_DESKTOP_PUBLICATION`. A API segue
`BLOCKED_BY_MISSING_INFRASTRUCTURE`. Nenhuma tag, GitHub Release, imagem remota, distribuição ou
Etapa 31 foi criada/iniciada.
