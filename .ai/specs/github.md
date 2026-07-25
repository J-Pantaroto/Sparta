# GitHub

O remote do projeto é lido de `git.txt`. O script aceita URLs HTTPS ou SSH do GitHub.

```bash
pnpm github:setup
bash scripts/push-to-github.sh
```

O script:

1. lê a primeira URL válida;
2. garante que a pasta é um repositório Git;
3. força o nome da branch local para `main`;
4. cria ou atualiza `origin`;
5. mostra `git status`;
6. cria commit se houver alterações;
7. tenta `git push -u origin main`.

Ele não commita `.env`, builds, logs ou dependências porque esses arquivos estão no `.gitignore`. Ele também não usa `--force`.
