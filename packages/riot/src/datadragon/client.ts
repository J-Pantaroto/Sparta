export interface DataDragonChampion {
  key: string;
  id: string;
  name: string;
  title: string;
  tags: string[];
}

export async function fetchDataDragonChampions(version: string, locale = "pt_BR"): Promise<DataDragonChampion[]> {
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Data Dragon request failed with ${response.status}`);
  const payload = (await response.json()) as { data: Record<string, DataDragonChampion> };
  return Object.values(payload.data);
}
