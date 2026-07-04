# Setup

Requisitos:

- Node.js 20.
- Corepack habilitado.
- pnpm 10.34.4.
- Docker Desktop.
- Python 3.11 ou superior para o analyzer.

Instalação:

```bash
corepack enable
corepack prepare pnpm@10.34.4 --activate
pnpm install
cp .env.example .env
```

No Windows:

```powershell
.\scripts\setup.ps1
```

Edite `.env` e defina `RIOT_API_KEY` somente quando for testar chamadas reais. Sem chave, o projeto continua útil com mocks e seeds.
