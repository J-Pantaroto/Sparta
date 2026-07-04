# API

Base local: `http://localhost:3333`.

Endpoints iniciais:

- `GET /health`
- `GET /players/:riotName/:tagLine/profile`
- `POST /players/sync`
- `GET /players/:puuid/recent-matches?limit=10`
- `GET /players/:puuid/champion-performance`
- `POST /drafts/recommendations`
- `POST /drafts/pre-game-analysis`
- `POST /postgame/analyze`
- `GET /postgame/:matchId`
- `POST /replays/import`
- `GET /replays/:jobId`

Swagger UI fica em `/docs`.

Integrações Riot planejadas:

- Account-V1 para Riot ID -> PUUID.
- Match-V5 para histórico, detalhes e timeline.
- Data Dragon para campeões, assets e versões.
- LCU local read-only para champion select futuro.
