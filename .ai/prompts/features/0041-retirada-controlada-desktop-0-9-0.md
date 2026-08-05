---
status: IMPLEMENTADA
solicitado_em: 2026-08-05 18:35
implementado_em: 2026-08-05 18:40
---

# Etapa 31A — Retirada controlada do Sparta Desktop 0.9.0

## Pedido original

> Interromper novos downloads do instalador público sem apagar a auditoria histórica da versão
> 0.9.0. Preservar a tag, editar título e notas para indicar a retirada, remover somente
> `Sparta-Setup-0.9.0-x64.exe`, manter os cinco documentos de auditoria, a prerelease e o estado
> interno. Registrar `WITHDRAWN_PENDING_PUBLIC_API` e parar sem criar 0.9.1, API ou infraestrutura.

## Notas de implementação

- O snapshot público anterior à mutação foi registrado em
  `docs/release-withdrawal-0.9.0.md`, incluindo IDs, datas, seis tamanhos/hashes e contadores
  brutos de download.
- Título e início das notas foram alterados para indicar claramente a retirada.
- Somente o asset ID `503041455`, `Sparta-Setup-0.9.0-x64.exe`, foi removido; sua URL passou a
  responder 404. Cinco documentos de auditoria permaneceram com os mesmos digests.
- Tag anotada, peeled commit, prerelease e estado não-latest foram preservados.
- `release-etapa27c-v1` continuou `ACTIVE`; o replay continuou `EXACT_REPLAY`, sem dependência
  ausente.
- Resultado: `WITHDRAWN_PENDING_PUBLIC_API`. Nenhuma versão, API, infraestrutura, dado global,
  peso ou release operacional foi criada ou modificada.
- Não há teste automatizado novo: a mudança é exclusivamente operacional/documental na GitHub
  Release e foi validada diretamente pela API pública, URL do asset, Git remoto, API local e replay.
