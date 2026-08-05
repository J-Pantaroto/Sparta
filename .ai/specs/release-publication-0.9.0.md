# Publicação controlada — Sparta 0.9.0

Espelho de `docs/release-publication-0.9.0.md`. A fonte de verdade é o arquivo em `docs/`.

## Estado

`BLOCKED` em 2026-08-05, antes de qualquer tag, GitHub Release, upload ou deploy externo.

## Motivos

1. O `app.asar` congelado contém quatro cópias de fixtures sintéticas de teste do próprio
   `@sparta/riot`, sob `src/mappers/__fixtures__` e `dist/mappers/__fixtures__`. Não há segredo nem
   dado real, mas são arquivos indevidos e impedem confirmar a ausência de fontes/testes.
2. `docs/release-candidate.md` e seu espelho estão divergentes do candidato `0.9.0` e ainda
   registram artefatos `0.1.0`.
3. Não existe registry, ambiente, servidor, domínio, backup ou rollback real configurado para a
   API. O deploy da API permanece bloqueado sem infraestrutura inventada.

Git, CI, hashes, assinatura, imagem local, migrations locais, release ativa e replay foram
auditados. Detalhes, hashes completos e decisão de prerelease estão na fonte de verdade.
