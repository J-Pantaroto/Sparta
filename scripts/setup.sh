#!/usr/bin/env bash
set -euo pipefail

corepack enable
corepack prepare pnpm@10.34.4 --activate
pnpm install
cp -n .env.example .env || true
echo "Setup concluído. Revise .env antes de usar Riot API."
