---
status: IMPLEMENTADA
solicitado_em: 2026-08-05 17:09
implementado_em: 2026-08-05 17:15
---

# Etapa 30B — Publicação parcial do Sparta Desktop 0.9.0

## Pedido original

> Publicar somente a tag anotada `v0.9.0`, uma GitHub Release como prerelease, o instalador
> Windows aprovado, checksums, manifesto, SBOM e notas da versão. A tag deve apontar exatamente
> para `aa2366b3e5bb4b3e5227dcdec43eaf8c6977ba77`. Validar novamente o candidato antes da
> publicação e baixar o instalador da própria release depois do upload para confirmar SHA-256 e
> `NotSigned`. Manter a API como `BLOCKED_BY_MISSING_INFRASTRUCTURE`, não publicar imagem, não
> inventar infraestrutura e não iniciar a Etapa 31. Resultado esperado: `PARTIALLY_PUBLISHED`.

## Notas de implementação

A publicação exige `HEAD` exatamente no commit aprovado e árvore limpa. Por isso este registro foi
criado somente depois de tag, release e anexos terem passado pela validação remota; criá-lo antes
mudaria o checkpoint que a própria etapa mandou preservar.

Tag, GitHub Release, anexos, download de confirmação e estado operacional foram aprovados. A tag
remota aponta para o commit exigido; a release é prerelease, não latest, e contém somente seis
anexos permitidos. Todos os anexos foram baixados e comparados byte a byte; o instalador confirmou
o SHA-256 esperado, versão `0.9.0` e `NotSigned`, sem segredo detectado.

Resultado: `PARTIALLY_PUBLISHED`. A API permanece
`BLOCKED_BY_MISSING_INFRASTRUCTURE`; nenhuma imagem, registry, migration externa ou simulação de
deploy foi criada. Release operacional e replay permaneceram intactos, e a Etapa 31 não foi
iniciada. Não há teste automatizado novo porque esta etapa só executa e audita a publicação
externa de um candidato já testado; as verificações foram feitas contra a tag, a API do GitHub e os
arquivos efetivamente baixados da release.
