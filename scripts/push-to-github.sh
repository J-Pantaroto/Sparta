#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "git.txt" ]]; then
  echo "git.txt não encontrado na raiz do projeto."
  exit 1
fi

REMOTE_URL="$(grep -Eo '(https://github\.com/[^[:space:]]+\.git|git@github\.com:[^[:space:]]+\.git)' git.txt | head -n 1 || true)"
if [[ -z "$REMOTE_URL" ]]; then
  echo "Nenhuma URL GitHub válida encontrada em git.txt."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init
fi

git branch -M main

if git remote get-url origin >/dev/null 2>&1; then
  CURRENT_ORIGIN="$(git remote get-url origin)"
  if [[ "$CURRENT_ORIGIN" != "$REMOTE_URL" ]]; then
    echo "Atualizando origin: $CURRENT_ORIGIN -> $REMOTE_URL"
    git remote set-url origin "$REMOTE_URL"
  fi
else
  git remote add origin "$REMOTE_URL"
fi

git status --short --branch
git add .

if git diff --cached --quiet; then
  echo "Nenhuma alteração para commit."
else
  git commit -m "chore: scaffold Sparta monorepo"
fi

if ! git push -u origin main; then
  echo "Push falhou. Verifique autenticação com GitHub CLI, token HTTPS ou chave SSH. Nenhum force push foi executado."
  exit 1
fi
