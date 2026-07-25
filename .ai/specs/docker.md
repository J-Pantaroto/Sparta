# Docker

`docker-compose.yml` sobe:

- `postgres`: banco principal persistente.
- `redis`: cache/fila para syncs futuros.
- `api`: backend Fastify.
- `analyzer`: serviço Python FastAPI.

Comandos:

```bash
docker compose up -d
docker compose ps
docker compose logs -f api
docker compose down
```

O desktop Electron roda fora do Docker em desenvolvimento porque precisa abrir janela nativa.
