$ErrorActionPreference = "Stop"
corepack enable
corepack prepare pnpm@10.34.4 --activate
pnpm install
Copy-Item .env.example .env -ErrorAction SilentlyContinue
Write-Host "Setup concluído. Revise .env antes de usar Riot API."
