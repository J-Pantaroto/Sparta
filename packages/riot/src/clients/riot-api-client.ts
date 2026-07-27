import { requestWithRiotRateLimit } from "../rate-limit/riot-request.js";

function isStringRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload);
}

function isAccount(payload: unknown): payload is { puuid: string; gameName: string; tagLine: string } {
  return (
    isStringRecord(payload) &&
    typeof payload.puuid === "string" &&
    typeof payload.gameName === "string" &&
    typeof payload.tagLine === "string"
  );
}

function isStringArray(payload: unknown): payload is string[] {
  return Array.isArray(payload) && payload.every((item) => typeof item === "string");
}

export interface RiotApiClientOptions {
  apiKey: string;
  platformRegion: string;
  regionalRouting: string;
}

export class RiotApiClient {
  constructor(private readonly options: RiotApiClientOptions) {}

  async getAccountByRiotId(gameName: string, tagLine: string): Promise<{ puuid: string; gameName: string; tagLine: string }> {
    const url = `https://${this.options.regionalRouting}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      gameName
    )}/${encodeURIComponent(tagLine)}`;
    return requestWithRiotRateLimit(url, this.options.apiKey, { validate: isAccount });
  }

  async getMatchIdsByPuuid(puuid: string, count = 20): Promise<string[]> {
    const url = `https://${this.options.regionalRouting}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
    return requestWithRiotRateLimit(url, this.options.apiKey, { validate: isStringArray });
  }

  async getMatch(matchId: string): Promise<unknown> {
    const url = `https://${this.options.regionalRouting}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    return this.requestObject(url);
  }

  async getMatchTimeline(matchId: string): Promise<unknown> {
    const url = `https://${this.options.regionalRouting}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`;
    return this.requestObject(url);
  }

  private async requestObject(url: string): Promise<Record<string, unknown>> {
    return requestWithRiotRateLimit(url, this.options.apiKey, { validate: isStringRecord });
  }
}
