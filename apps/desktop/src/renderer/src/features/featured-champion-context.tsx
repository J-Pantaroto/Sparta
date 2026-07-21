import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface FeaturedChampionOption {
  key: string;
  name: string;
  skinIndex: number;
}

/**
 * Lista curada de campeoes pro seletor de tema visual (splash art do
 * login/dashboard). Placeholder ate a Fase 2 conectar o desktop ao campeao
 * mais jogado de verdade (GET /players/:puuid/champion-performance) - por
 * enquanto e so uma escolha estetica manual do usuario, sem relacao com
 * desempenho real. Os skinIndex diferentes de 0 foram conferidos contra o
 * Data Dragon 14.14.1 antes de entrar aqui (o endpoint que o desktop usa
 * hoje nao lista skins, entao nao da pra descobrir isso em runtime).
 */
export const FEATURED_CHAMPIONS: FeaturedChampionOption[] = [
  { key: "Yasuo", name: "Yasuo", skinIndex: 0 },
  { key: "Jinx", name: "Jinx", skinIndex: 20 },
  { key: "Ahri", name: "Ahri", skinIndex: 66 },
  { key: "LeeSin", name: "Lee Sin", skinIndex: 41 },
  { key: "Zed", name: "Zed", skinIndex: 15 },
  { key: "Lux", name: "Lux", skinIndex: 18 },
  { key: "Vayne", name: "Vayne", skinIndex: 32 },
  { key: "Thresh", name: "Thresh", skinIndex: 39 },
  { key: "MissFortune", name: "Miss Fortune", skinIndex: 21 },
  { key: "Orianna", name: "Orianna", skinIndex: 20 },
  { key: "Viego", name: "Viego", skinIndex: 21 },
  { key: "Vi", name: "Vi", skinIndex: 29 }
];

const STORAGE_KEY = "sparta:featured-champion";
const DEFAULT_CHAMPION = FEATURED_CHAMPIONS[0];

interface FeaturedChampionContextValue {
  featuredChampion: FeaturedChampionOption;
  setFeaturedChampionKey: (key: string) => void;
  options: FeaturedChampionOption[];
}

const FeaturedChampionContext = createContext<FeaturedChampionContextValue | null>(null);

export function FeaturedChampionProvider({ children }: { children: ReactNode }) {
  const [championKey, setChampionKey] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CHAMPION.key;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, championKey);
  }, [championKey]);

  const featuredChampion = useMemo(
    () => FEATURED_CHAMPIONS.find((option) => option.key === championKey) ?? DEFAULT_CHAMPION,
    [championKey]
  );

  const value = useMemo(
    () => ({ featuredChampion, setFeaturedChampionKey: setChampionKey, options: FEATURED_CHAMPIONS }),
    [featuredChampion]
  );

  return <FeaturedChampionContext.Provider value={value}>{children}</FeaturedChampionContext.Provider>;
}

export function useFeaturedChampion(): FeaturedChampionContextValue {
  const context = useContext(FeaturedChampionContext);
  if (!context) throw new Error("useFeaturedChampion precisa estar dentro de um FeaturedChampionProvider");
  return context;
}
