export interface DataDragonChampion {
  key: string;
  id: string;
  name: string;
  title: string;
  tags: string[];
}

/**
 * Ultima versao conhecida do Data Dragon usada como fallback quando o
 * desktop nao consegue consultar `fetchDataDragonVersions` (ex.: sem rede
 * no momento do build). Mantenha alinhada com o patch atual quando possivel.
 */
export const FALLBACK_DATA_DRAGON_VERSION = "14.14.1";

export async function fetchDataDragonVersions(): Promise<string[]> {
  const response = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  if (!response.ok) throw new Error(`Data Dragon versions request failed with ${response.status}`);
  return (await response.json()) as string[];
}

export async function fetchDataDragonChampions(version: string, locale = "pt_BR"): Promise<DataDragonChampion[]> {
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Data Dragon request failed with ${response.status}`);
  const payload = (await response.json()) as { data: Record<string, DataDragonChampion> };
  return Object.values(payload.data);
}

/**
 * URL do icone quadrado do campeao. `championKey` e o id interno do Data
 * Dragon (ex.: "Orianna", "Ahri", "MonkeyKing" para Wukong), nao o nome
 * de exibicao.
 */
export function championSquareUrl(championKey: string, version = FALLBACK_DATA_DRAGON_VERSION): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championKey}.png`;
}

/**
 * URL da splash art oficial do campeao (nao versionada). `skinIndex` 0 e
 * sempre a skin base.
 */
export function championSplashUrl(championKey: string, skinIndex = 0): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championKey}_${skinIndex}.png`;
}
