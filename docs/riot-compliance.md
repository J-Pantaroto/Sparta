# Riot Compliance

Princípios do Sparta:

- Registrar o app no Riot Developer Portal antes de uso público.
- Manter `RIOT_API_KEY` apenas no backend.
- Respeitar rate limits e políticas da Riot.
- Usar Data Dragon e APIs oficiais sempre que possível.
- Sugerir picks sem executar decisões automaticamente.
- Não automatizar pick, ban, troca de campeão, runas ou ações no cliente.
- Não oferecer assistência durante a partida.
- Não rastrear cooldowns inimigos, summoner spells inimigos ou dados não disponíveis legitimamente.
- Tratar LCU como integração local e read-only no MVP.
- Documentar qualquer endpoint LCU antes de habilitar uso real.

## Endpoints LCU em uso

Implementados em `packages/riot/src/lcu/read-only-client.ts` (`LcuReadOnlyClient`), consumidos apenas pelo processo `main` do Electron (`apps/desktop/src/main/index.ts`), nunca pelo backend nem por integrações remotas:

- `GET /lol-gameflow/v1/gameflow-phase` — poll a cada 2.5s so para saber a fase atual (ex.: `ChampSelect`) e trocar a aba da UI do Sparta automaticamente. Nenhuma escrita, nenhuma automação.
- `GET /lol-champ-select/v1/session` — leitura da sessão de champion select (times, ações, banimentos) exposta via `getChampionSelectSession`; ainda não consumida pela UI (ver próximos passos no `CLAUDE.md`), mas já documentada aqui antes de habilitar o uso real.

Autenticação: lockfile local (`Riot Games/League of Legends/lockfile` ou `LEAGUE_CLIENT_PATH`), Basic Auth `riot:<password>` contra `127.0.0.1`, certificado autoassinado do próprio cliente.

Referências oficiais:

- https://developer.riotgames.com/
- https://developer.riotgames.com/docs/lol
- https://developer.riotgames.com/apis
- https://developer.riotgames.com/policies/general
