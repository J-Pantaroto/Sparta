/**
 * Helpers de Data Dragon usados so no renderer (browser context). Ficam
 * separados de `@sparta/riot` porque aquele pacote tambem exporta o
 * cliente LCU, que usa modulos nativos do Node ("node:fs", "node:https")
 * incompativeis com o bundle do renderer (contextIsolation, sem
 * nodeIntegration). Mantenha os valores em sincronia manualmente se o
 * pacote compartilhado mudar.
 */

import type { ChampionClassProfile, ItemSummary } from "@sparta/core";

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

export interface DataDragonChampionSummary {
  key: string;
  id: number;
  name: string;
}

/**
 * Lista completa de campeoes (nao so os que o jogador ja jogou) - usada pro
 * primeiro passo do seletor de tema (escolher qualquer campeao). Vem direto
 * do resumo publico da Data Dragon, sem passar pelo backend Sparta.
 */
export async function fetchAllChampions(version = FALLBACK_DATA_DRAGON_VERSION): Promise<DataDragonChampionSummary[]> {
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion.json`);
  if (!response.ok) return [];
  // A Data Dragon inverte o nome dos campos: "id" e a string usada nas URLs
  // (ex. "Aatrox"), "key" e o id numerico como string (ex. "266").
  const payload = (await response.json()) as { data: Record<string, { id: string; key: string; name: string }> };
  return Object.values(payload.data).map((champion) => ({
    key: champion.id,
    id: Number(champion.key),
    name: champion.name
  }));
}

/**
 * Perfil de classe direto da Data Dragon (tags/info do champion.json) -
 * usado pelo motor de build (`@sparta/core`, `recommendBuild`) em vez da
 * tabela curada `ChampionTag` (so 2 campeoes seedados hoje). Real, publico,
 * cobre os ~170 campeoes.
 */
export async function fetchChampionClassProfiles(version = FALLBACK_DATA_DRAGON_VERSION): Promise<ChampionClassProfile[]> {
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion.json`);
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    data: Record<string, { key: string; name: string; tags: string[]; info: { attack: number; defense: number; magic: number; difficulty: number } }>;
  };
  return Object.values(payload.data).map((champion) => ({
    championId: Number(champion.key),
    championName: champion.name,
    tags: champion.tags,
    attack: champion.info.attack,
    defense: champion.info.defense,
    magic: champion.info.magic,
    difficulty: champion.info.difficulty
  }));
}

const ITEM_MAP_SUMMONERS_RIFT = "11";

/**
 * Catalogo de itens compraveis na Summoner's Rift, direto do item.json da
 * Data Dragon - mesmo padrao client-side sem rota nova no backend usado
 * pelos campeoes/skins (Fase 6a). Descarta consumiveis/trinkets/itens de
 * outros modos de jogo.
 */
export async function fetchItemCatalog(version = FALLBACK_DATA_DRAGON_VERSION): Promise<ItemSummary[]> {
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/item.json`);
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    data: Record<
      string,
      {
        name: string;
        tags?: string[];
        gold: { total: number; purchasable: boolean };
        maps: Record<string, boolean>;
        depth?: number;
        into?: string[];
      }
    >;
  };
  return Object.entries(payload.data)
    .filter(([, item]) => item.gold.purchasable && item.maps[ITEM_MAP_SUMMONERS_RIFT])
    .map(([itemId, item]) => ({
      itemId: Number(itemId),
      name: item.name,
      tags: item.tags ?? [],
      goldTotal: item.gold.total,
      depth: item.depth,
      into: item.into
    }));
}

export function itemIconUrl(itemId: number, version = FALLBACK_DATA_DRAGON_VERSION): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

export interface DataDragonSkin {
  num: number;
  name: string;
  chromas: boolean;
}

/**
 * Skins de um campeao especifico - endpoint de detalhe por campeao da Data
 * Dragon, nao usado em lugar nenhum do desktop ate agora (so o resumo
 * champion.json, sem skins). `num: 0` e sempre a skin padrao/base.
 */
export async function fetchChampionSkins(championKey: string, version = FALLBACK_DATA_DRAGON_VERSION): Promise<DataDragonSkin[]> {
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion/${championKey}.json`);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data: Record<string, { skins: DataDragonSkin[] }> };
  return payload.data[championKey]?.skins ?? [];
}
