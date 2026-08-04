---
status: EM_ANDAMENTO
solicitado_em: 2026-08-04 17:10
implementado_em:
---

# Etapa 29 — Preparação e congelamento da release final

## Pedido original

> Transformar o estado atual de `main` em um release candidate formal, reproduzível e pronto para
> publicação controlada: definir a versão oficial (sem presumir `1.0.0`), congelar as referências
> técnicas num manifesto gerado de dados reais, regerar os artefatos finais a partir de árvore limpa,
> preparar documentação de usuário e operação (release notes, runbook de publicação, runbook de
> rollback), validar instalação/atualização/desinstalação e smoke test com os artefatos congelados,
> registrar limitações classificadas, e produzir um parecer único `READY_FOR_PUBLICATION` ou
> `BLOCKED`.
>
> Restrições explícitas: não publicar artefato, não criar GitHub Release, não enviar imagem para
> registry, não alterar a release ativa, não recalibrar pesos, não modificar o motor, não incluir
> Production Key, não assinar artificialmente o instalador, não esconder limitações, não iniciar
> monitoramento pós-release. Não declarar reprodutibilidade bit a bit se a ferramenta insere
> metadado variável. Não reduzir bloqueador a limitação para concluir a etapa.

## Notas de implementação

(em andamento)
