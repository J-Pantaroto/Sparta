import { describe, expect, it } from "vitest";
import { decideDraftMatchLink, type DraftMatchLinkInput } from "./draft-match-link.js";

const base: DraftMatchLinkInput = {
  source: "LCU",
  lifecycleStatus: "IN_GAME",
  puuid: "player-1",
  platform: "BR1",
  role: "MID",
  queueId: 420,
  selectedChampionId: 103,
  knownDraft: {
    allies: [{ championId: 64, championName: "Lee Sin" }],
    enemies: [{ championId: 238, championName: "Zed" }],
    bannedChampionIds: [],
    banSideKnown: false,
    unknownAllyPicks: 3,
    unknownEnemyPicks: 4
  },
  startedAt: "2026-07-28T18:00:00.000Z",
  lockedInAt: "2026-07-28T18:04:00.000Z",
  updatedAt: "2026-07-28T18:04:00.000Z",
  candidates: []
};

const candidate = {
  matchId: "BR1_123456",
  gameId: "123456",
  platform: "BR1",
  puuid: "player-1",
  championId: 103,
  role: "MID" as const,
  queueId: 420,
  startedAt: "2026-07-28T18:08:00.000Z",
  participantChampionIds: [103, 64, 238, 22, 86, 12, 18, 53, 99, 120]
};

describe("decideDraftMatchLink", () => {
  it("prioriza o gameId oficial mesmo sem evidências secundárias", () => {
    const result = decideDraftMatchLink({
      ...base,
      externalGameId: "123456",
      candidates: [{ ...candidate, championId: 1, startedAt: undefined }]
    });
    expect(result).toMatchObject({
      status: "LINKED",
      strategy: "EXACT_GAME_ID",
      matchId: "BR1_123456"
    });
  });

  it("mantém pendente enquanto o gameId ainda não foi sincronizado", () => {
    expect(decideDraftMatchLink({ ...base, externalGameId: "123456" }).status).toBe("PENDING");
  });

  it("vincula por evidências fortes somente quando o candidato é único", () => {
    const result = decideDraftMatchLink({ ...base, candidates: [candidate] });
    expect(result).toMatchObject({
      status: "LINKED",
      strategy: "STRONG_EVIDENCE",
      candidateCount: 1
    });
  });

  it("não desempata dois candidatos plausíveis", () => {
    const result = decideDraftMatchLink({
      ...base,
      candidates: [candidate, { ...candidate, matchId: "BR1_999999", gameId: "999999" }]
    });
    expect(result).toMatchObject({ status: "AMBIGUOUS", candidateCount: 2 });
  });

  it("não vincula por campeão, fila e horário se o jogador divergir", () => {
    const result = decideDraftMatchLink({
      ...base,
      candidates: [{ ...candidate, puuid: "outro-jogador" }]
    });
    expect(result.status).toBe("PENDING");
  });

  it("marca dodge e sessão manual como não aplicáveis", () => {
    expect(decideDraftMatchLink({ ...base, lifecycleStatus: "ABANDONED" }).status).toBe(
      "NOT_APPLICABLE"
    );
    expect(decideDraftMatchLink({ ...base, source: "USER" }).status).toBe("NOT_APPLICABLE");
  });

  it("nunca substitui vínculo exato existente por heurística", () => {
    const result = decideDraftMatchLink({
      ...base,
      currentLink: {
        status: "LINKED",
        strategy: "EXACT_GAME_ID",
        matchId: "BR1_123456"
      },
      candidates: [{ ...candidate, matchId: "BR1_999999", gameId: "999999" }]
    });
    expect(result.matchId).toBe("BR1_123456");
    expect(result.strategy).toBe("EXACT_GAME_ID");
  });
});
