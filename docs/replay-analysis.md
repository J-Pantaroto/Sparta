# Replay Analysis

Parser completo de `.rofl` não faz parte do MVP.

Estrutura criada:

- `services/analyzer/app/replay/`;
- `apps/api/src/modules/replays/`;
- endpoints `POST /replays/import` e `GET /replays/:jobId`.

O comportamento inicial apenas valida extensão `.rofl`, registra metadados e retorna `not_implemented` ou `experimental`.

Qualquer evolução com vídeo, frames ou OpenCV dependerá de revisão técnica e compliance.
