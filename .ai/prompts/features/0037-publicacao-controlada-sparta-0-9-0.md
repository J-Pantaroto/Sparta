---
status: BLOQUEADA
solicitado_em: 2026-08-05 15:20
implementado_em:
---

# Etapa 30 — Publicação controlada do Sparta 0.9.0

## Pedido original

> Publicar o candidato congelado do Sparta 0.9.0 de forma controlada, auditável e reversível,
> trabalhando sobre `main` e respeitando checkpoints explícitos: auditar Git, CI, artefatos,
> checksums, segurança, infraestrutura de API, backup e rollback antes de qualquer mutação externa;
> publicar a API somente se existir destino real configurado; criar a tag anotada `v0.9.0` no
> commit aprovado; criar a GitHub Release com o instalador não assinado, manifesto, SBOM,
> checksums e notas; baixar novamente o instalador publicado e validar seu SHA-256; registrar o
> resultado final como `PUBLISHED` ou `PARTIALLY_PUBLISHED`. Não inventar registry, servidor,
> domínio, backup ou credenciais, não mover tag, não usar force push e não iniciar a Etapa 31.

## Notas de implementação

Checkpoint concluído e documentado em `docs/release-publication-0.9.0.md`. Nenhuma mutação externa
foi executada.

Dois bloqueadores impedem publicar o candidato congelado: o `app.asar` inclui quatro cópias de
fixtures sintéticas de teste do próprio `@sparta/riot`, e o inventário obrigatório ainda registra
artefatos `0.1.0`, divergindo do manifesto/SBOM/checksums de `0.9.0`. Além disso, o deploy da API
permanece bloqueado porque não há registry, ambiente, servidor, domínio, backup ou rollback real
configurado.

Git, CI, checksums, assinatura, metadados do instalador, imagem local, migrations locais, release
ativa e replay foram auditados. Tag, GitHub Release, instalador remoto e imagem remota não foram
criados. Corrigir o empacotamento exige novo artefato, revalidação e aprovação de um novo commit
candidato; não foi permitido atribuir uma mudança não versionada ao candidato aprovado
`c3b5c6f`.
