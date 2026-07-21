/**
 * Helpers de Data Dragon usados so no renderer (browser context). Ficam
 * separados de `@sparta/riot` porque aquele pacote tambem exporta o
 * cliente LCU, que usa modulos nativos do Node ("node:fs", "node:https")
 * incompativeis com o bundle do renderer (contextIsolation, sem
 * nodeIntegration). Mantenha os valores em sincronia manualmente se o
 * pacote compartilhado mudar.
 */

export const FALLBACK_DATA_DRAGON_VERSION = "14.14.1";

export async function fetchLatestDataDragonVersion(): Promise<string> {
  try {
    const response = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
    if (!response.ok) return FALLBACK_DATA_DRAGON_VERSION;
    const versions = (await response.json()) as string[];
    return versions[0] ?? FALLBACK_DATA_DRAGON_VERSION;
  } catch {
    return FALLBACK_DATA_DRAGON_VERSION;
  }
}

export function championSquareUrl(championKey: string, version = FALLBACK_DATA_DRAGON_VERSION): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championKey}.png`;
}

export function championSplashUrl(championKey: string, skinIndex = 0): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championKey}_${skinIndex}.png`;
}
