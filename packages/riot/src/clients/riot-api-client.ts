import { retryWithBackoff } from "../rate-limit/backoff";

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
    return this.request(url);
  }

  async getMatchIdsByPuuid(puuid: string, count = 20): Promise<string[]> {
    const url = `https://${this.options.regionalRouting}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
    return this.request(url);
  }

  async getMatch(matchId: string): Promise<unknown> {
    const url = `https://${this.options.regionalRouting}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    return this.request(url);
  }

  private async request<T>(url: string): Promise<T> {
    return retryWithBackoff(async () => {
      const response = await fetch(url, { headers: { "X-Riot-Token": this.options.apiKey } });
      if (!response.ok) {
        throw new Error(`Riot API request failed with ${response.status}`);
      }
      return (await response.json()) as T;
    });
  }
}
