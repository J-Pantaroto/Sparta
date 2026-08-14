---
status: IMPLEMENTADA
solicitado_em: 2026-08-14 18:00
implementado_em: 2026-08-14 18:30
---

# Etapa 31P — Triagem e correção do Dependabot high #44 (extract-zip)

## Pedido original

> ETAPA — TRIAGEM E CORREÇÃO DO DEPENDABOT HIGH #44. Aplique as regras permanentes registradas
> em `.ai/`. Existe 1 novo alerta Dependabot de severidade HIGH identificado como #44 após o
> commit 7b8118f. Objetivo: investigar especificamente esse alerta e corrigi-lo com a menor
> mudança segura possível. Antes de alterar: identificar o pacote vulnerável, versão atual,
> advisory/CVE/GHSA, caminho de dependência, se é dependência direta ou transitiva, quais
> workspaces são afetados, se está presente em runtime/build-time/desenvolvimento, versão
> mínima corrigida, breaking changes possíveis. Não fazer upgrade geral de dependências. Não
> alterar pacotes não relacionados. Se a correção puder ser feita só atualizando a dependência
> vulnerável ou o lockfile, preferir isso. Se o alerta for exclusivamente build/dev-time,
> registrar explicitamente, mas corrigir mesmo assim se houver versão segura compatível. Validar
> install/frozen lock quando aplicável, tests, typecheck, lint, build, comportamento dos
> workspaces impactados. Confirmar que o alerta #44 foi efetivamente resolvido, nenhum novo
> alerta relevante foi introduzido, nenhuma regressão ocorreu. Atualizar documentação/changelog.
> Commit/push em main. Relatar advisory, pacote, versão vulnerável, versão corrigida, natureza
> runtime/build/dev, arquivos alterados, impacto, validações, estado final do Dependabot.

## Notas de implementação

Relatório técnico completo em `docs/dependabot-extract-zip-2026-08.md` (espelhado em
`.ai/specs/`). Resumo:

- Alerta #44 = `extract-zip@2.0.1`, transitivo via `electron@39.8.10` (devDependency de
  `apps/desktop`), GHSA-jmr9-qjv8-65gv / CVE-2026-56876 — symlink com alvo não validado (path
  traversal). `first_patched_version: null` no advisory e confirmado no npm: não existe versão
  corrigida publicada (`extract-zip` sem release desde 2020-06-10).
- Exposição real: `BUILD_TIME_ONLY` — só executa no `pnpm install` (postinstall do próprio pacote
  `electron`, descompactando o binário oficial do Electron via `@electron/get`). Nunca chega ao
  `app.asar` (devDependency, excluída do empacotamento desde a Etapa 30A) nem processa zip
  controlado por terceiro/usuário.
- Sem versão corrigida pra atualizar, a correção foi um **patch local via `pnpm patch`**
  (`patches/extract-zip@2.0.1.patch`, registrado em `package.json` →
  `pnpm.patchedDependencies` e no lockfile) que valida o alvo resolvido de cada entrada symlink
  contra o diretório de extração — mesma lógica de contenção que o pacote já usa pra `destDir`,
  agora também aplicada ao destino do link. Nenhuma outra dependência tocada.
- Teste novo: `scripts/extract-zip-patch.test.ts` (3 testes — symlink relativo que escapa,
  symlink absoluto, symlink legítimo continua funcionando), montando um `.zip` mínimo cru sem
  precisar de nenhuma lib de escrita de zip nova. `extract-zip` entrou como devDependency
  explícita da raiz só pra esse teste conseguir importar o pacote.
- `pnpm install`/typecheck/lint/build/test completos e verdes nos 5 pacotes TypeScript — 1343
  testes no total (raiz 18, eram 15). `pnpm audit` continua reportando `extract-zip` como high
  (esperado e documentado: audit lê a versão declarada, `2.0.1`, não o conteúdo patchado — não
  existe hoje ferramenta de auditoria que entenda `pnpm.patchedDependencies` como remediação).
- **Erro cometido e corrigido na própria sessão**: a primeira versão declarou `extract-zip` como
  `devDependency` direta da raiz só pro teste importar — isso criou um segundo alerta Dependabot
  duplicado (#45, `manifest_path: "package.json"`). Corrigido removendo a declaração e resolvendo
  o pacote via `createRequire` ancorado no `package.json` real do `electron` (mesmo caminho que o
  próprio Electron usa em produção), sem declarar nada novo em manifesto nenhum.
- **Estado final confirmado via `gh api`**: `#44` dispensado (`dismissed_reason: tolerable_risk`,
  já que não existe versão corrigida upstream pra fazer o alerta fechar sozinho); `#45` fechado
  automaticamente (`state: fixed`) assim que a declaração que o gerou deixou de existir; **0
  alertas abertos** no repositório.
