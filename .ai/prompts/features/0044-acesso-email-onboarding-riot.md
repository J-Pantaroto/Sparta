---
status: IMPLEMENTADA
solicitado_em: 2026-08-06 16:18
implementado_em: 2026-08-06 17:09
---

# Etapa 31D — Acesso obrigatório, confirmação de e-mail e onboarding Riot

## Pedido original

> Remover integralmente o acesso sem conta; exigir confirmação real de e-mail e vínculo Riot no
> onboarding; calcular o estado no backend; aplicar gating uniforme na API e no desktop; criar
> provider de e-mail desacoplado; modernizar somente acesso, onboarding, menu e conta; preservar
> usuários, release, hashes e replay. Não provisionar serviço externo, domínio, infraestrutura,
> perfil analítico nem redesign completo do aplicativo.

## Notas de implementação

Execução limitada à Etapa 31D. Acesso anônimo removido; confirmação de email e onboarding
calculado no backend; gate uniforme; sessão protegida pelo sistema; fluxo Riot fail-closed;
migration sem backfill; recomendação e replay preservados. Produção continua honestamente bloqueada
por provider transacional real e aprovação RSO.
