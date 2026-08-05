---
status: IMPLEMENTADA
solicitado_em: 2026-08-05 17:25
implementado_em: 2026-08-05 18:19
---

# Etapa 31 — Pós-release e monitoramento do Sparta Desktop 0.9.0

## Pedido original

> Revalidar a integridade da prerelease pública `v0.9.0`, exercitar o instalador baixado da
> GitHub Release como usuário final, documentar o comportamento sem API pública, preparar canal e
> template de suporte, auditar diagnóstico local, classificar incidentes e confirmar release
> operacional/replay. Produzir parecer objetivo entre `STABLE_PRERELEASE`, `HOTFIX_REQUIRED`,
> `WITHDRAWAL_REQUIRED` e `MONITORING_LIMITED_BY_MISSING_PUBLIC_API`. Não substituir anexos, mover
> tag, publicar API, coletar telemetria, recalibrar o motor, criar hotfix nem iniciar a Etapa 32.

## Notas de implementação

- Integridade remota e instalador público revalidados; instalação, inicialização, atualização
  sobre a mesma versão e desinstalação passaram, inclusive em caminho com espaços e acentos.
- Ausência real da API exercitada: timeout finito e mensagem legível, mas autenticação,
  recomendações, históricos e laboratório não são utilizáveis pelo público externo.
- Formulário de Issue e instruções de suporte/sanitização adicionados. O desktop não tem
  log persistente; a limitação foi documentada em vez de inventar um caminho.
- Release operacional e hashes permaneceram intactos; recomendação controlada repetiu os cinco
  candidatos e o replay foi `EXACT_REPLAY`, sem divergências ou dependências ausentes.
- Parecer: `WITHDRAWAL_REQUIRED` + `MONITORING_LIMITED_BY_MISSING_PUBLIC_API`. Nenhuma retirada,
  substituição de anexo, hotfix, telemetria, recalibração ou Etapa 32 foi executada.
- Não foi criado teste automatizado de produto: a mudança é operacional/documental e foi
  verificada contra o binário público real. O formulário YAML e a documentação são validados no
  fechamento, além das suítes existentes pertinentes.
