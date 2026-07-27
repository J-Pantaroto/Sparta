export interface DataDragonChampion {
  key: string;
  id: string;
  name: string;
  title: string;
  tags: string[];
  /**
   * Notas de 0 a 10 publicadas pela propria Riot no `champion.json`. Sao a
   * unica leitura quantitativa disponivel pra TODOS os campeoes - usada
   * pra derivar o `ChampionTag` (ver champion-tag-derivation.ts em
   * @sparta/core). Opcional porque locales/versoes antigas do arquivo nem
   * sempre trazem o objeto.
   */
  info?: { attack: number; defense: number; magic: number; difficulty: number };
}

export async function fetchDataDragonVersions(): Promise<string[]> {
  return requestJson("https://ddragon.leagueoflegends.com/api/versions.json", {
    integration: "DATA_DRAGON",
    timeoutMs: HTTP_TIMEOUTS.dataDragonMs,
    validate: (payload): payload is string[] =>
      Array.isArray(payload) && payload.length > 0 && payload.every((version) => typeof version === "string")
  });
}

export async function fetchDataDragonChampions(version: string, locale = "pt_BR"): Promise<DataDragonChampion[]> {
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion.json`;
  const payload = await requestJson<{ data: Record<string, DataDragonChampion> }>(url, {
    integration: "DATA_DRAGON",
    timeoutMs: HTTP_TIMEOUTS.dataDragonMs,
    validate: isChampionCatalog
  });
  return Object.values(payload.data);
}

function isChampionCatalog(payload: unknown): payload is { data: Record<string, DataDragonChampion> } {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  const champions = Object.values(data);
  return (
    champions.length > 0 &&
    champions.every(
      (champion) =>
        typeof champion === "object" &&
        champion !== null &&
        typeof (champion as DataDragonChampion).key === "string" &&
        typeof (champion as DataDragonChampion).id === "string" &&
        typeof (champion as DataDragonChampion).name === "string" &&
        Array.isArray((champion as DataDragonChampion).tags)
    )
  );
}

/**
 * URL do icone quadrado do campeao. `championKey` e o id interno do Data
 * Dragon (ex.: "Orianna", "Ahri", "MonkeyKing" para Wukong), nao o nome
 * de exibicao.
 */
export function championSquareUrl(championKey: string, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championKey}.png`;
}

/**
 * URL da splash art oficial do campeao (nao versionada). `skinIndex` 0 e
 * sempre a skin base.
 */
export function championSplashUrl(championKey: string, skinIndex = 0): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championKey}_${skinIndex}.png`;
}
import { HTTP_TIMEOUTS, requestJson } from "../http/index.js";
