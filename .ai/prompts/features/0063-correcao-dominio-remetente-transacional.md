---
status: IMPLEMENTADA
solicitado_em: 2026-08-15 01:45
implementado_em: 2026-08-15 02:05
---

# Correção pontual — domínio do remetente transacional

## Pedido original

> CORREÇÃO PONTUAL — DOMÍNIO DO REMETENTE TRANSACIONAL. Aplique as regras permanentes registradas
> em `.ai/`. Contexto: a Etapa 31Q (autenticação de produção / e-mail transacional) documentou o
> remetente transacional como `contas@spartagg.com.br` em `.env.production.example`, mas o domínio
> verificado no Resend para produção é: mail.spartagg.com.br. Isso significa que o remetente real
> deveria ter sido configurado em um subdomínio verificado (ex.: contas@mail.spartagg.com.br), e
> não no domínio raiz. Ajuste apenas isso, sem alterar nada além do necessário: revise a
> implementação real do provider e ajuste a configuração/example/documentação para que o remetente
> transacional de produção utilize o domínio verificado (mail.spartagg.com.br) em vez do domínio
> raiz. Direção esperada: contas@mail.spartagg.com.br ou equivalente compatível com a
> implementação atual. Preserve EMAIL_PROVIDER_REPLY_TO=suporte@spartagg.com.br exatamente como
> está — esse é o e-mail humano real na Hostinger, não deve ser alterado. Não altere DNS. Não
> altere o provider (continua sendo Resend). Não crie nova caixa de e-mail. Não altere a API além
> do necessário para esse ajuste de remetente. Não faça redesign. Não altere infraestrutura.
> Verifique também se a confirmação de e-mail e a recuperação de senha utilizam o mesmo `from` ou
> se existe alguma outra configuração de remetente que também precise ser alinhada a
> mail.spartagg.com.br. Atualize todos os examples/docs/specs/changelog necessários pra refletir o
> domínio correto. Rode os testes/typecheck/lint/build aplicáveis. Faça commit e push na main.

## Notas de implementação

Correção isolada em configuração/documentação — nenhum arquivo de `apps/`/`packages/` fora de
`.env.production.example` e três documentos foi tocado.

- **`.env.production.example`**: `EMAIL_VERIFICATION_FROM` corrigido de `contas@spartagg.com.br`
  para `contas@mail.spartagg.com.br`; comentário acima da variável reescrito explicando o motivo
  (domínio verificado na Resend é o subdomínio, não o apex). `EMAIL_PROVIDER_REPLY_TO=suporte@
  spartagg.com.br` preservado sem nenhuma alteração. `EMAIL_VERIFICATION_URL_BASE`/
  `PASSWORD_RESET_URL_BASE` **não** foram tocadas — apontam pro apex `spartagg.com.br`
  (páginas públicas do site), um domínio diferente do domínio de envio de e-mail, que não precisa
  estar verificado na Resend.
- **Confirmado por leitura do código, não presumido**: `defaultEmailProviderForEnvironment`
  (`apps/api/src/modules/auth/email-provider.ts`) constrói uma única instância de
  `ResendTransactionalEmailProvider` a partir de `env.EMAIL_VERIFICATION_FROM`, e essa mesma
  instância atende `sendEmailVerification` e `sendPasswordReset` — não existe segunda variável de
  remetente nem lógica de `from` por fluxo em nenhum ponto do código. Corrigir a variável única
  corrige os dois fluxos simultaneamente; nenhuma mudança de código foi necessária.
- **Documentação atualizada**: `docs/password-recovery-and-transactional-email.md` (seção
  "Provider transacional: Resend", explicando o subdomínio verificado e o compartilhamento do
  `from` entre os dois fluxos) e `docs/desktop-pre-final-audit.md` (linha "Provider e template
  transacional" da matriz, reclassificando a ação necessária — domínio já verificado, falta só a
  API key) — os dois com espelho sincronizado byte a byte em `.ai/specs/`. `.ai/CLAUDE.md` ganhou
  uma nova subseção registrando a correção (hardlinked com `.claude/CLAUDE.md`, confirmado por
  `grep -c` nos dois arquivos depois da edição).
- **Testes**: nenhum ajuste necessário. Os fixtures de `resend-email-provider.test.ts`/
  `email-provider.test.ts` usam strings de exemplo arbitrárias (`contas@spartagg.com.br`,
  `access@example.com`) para testar o repasse do `from` recebido via construtor — comportamento
  testado (o provider usa exatamente o valor passado a ele) é independente do valor real
  documentado em `.env.production.example`, e continua correto sem alteração.
- **Validação**: `pnpm --filter @sparta/api typecheck`/`lint`/`test` (mudança não tocou
  `apps/api/src`) confirmados verdes; nenhuma migration, build de imagem ou QA Electron necessária
  — mudança não afeta runtime, schema nem UI.
- **Fora do escopo, conforme instrução explícita**: DNS não alterado, provider não trocado
  (continua Resend), nenhuma caixa de e-mail criada, nenhum redesign, nenhuma infraestrutura
  tocada.
