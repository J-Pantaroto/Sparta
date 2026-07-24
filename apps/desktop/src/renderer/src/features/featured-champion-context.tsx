import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface FeaturedChampionOption {
  key: string;
  name: string;
  skinIndex: number;
  skinName: string;
  /** Caminho local (file://) se a skin ja foi baixada pro disco - preferido sobre a CDN quando presente. */
  localSplashPath?: string;
}

const STORAGE_KEY = "sparta:featured-champion";

const DEFAULT_CHAMPION: FeaturedChampionOption = {
  key: "Ahri",
  name: "Ahri",
  skinIndex: 0,
  skinName: "Ahri"
};

function loadStoredChampion(): FeaturedChampionOption {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_CHAMPION;
  try {
    const parsed = JSON.parse(raw) as Partial<FeaturedChampionOption>;
    if (!parsed.key || typeof parsed.skinIndex !== "number") return DEFAULT_CHAMPION;
    return {
      key: parsed.key,
      name: parsed.name ?? parsed.key,
      skinIndex: parsed.skinIndex,
      skinName: parsed.skinName ?? parsed.name ?? parsed.key,
      // Versoes antigas gravavam um `file://` aqui, que o renderer nunca
      // conseguiu carregar (bloqueio de seguranca do Electron) - descarta e
      // volta pra CDN em vez de deixar o tema quebrado pra sempre. Hoje o
      // main devolve um data URL, que carrega em qualquer origem.
      localSplashPath: parsed.localSplashPath?.startsWith("data:") ? parsed.localSplashPath : undefined
    };
  } catch {
    return DEFAULT_CHAMPION;
  }
}

interface FeaturedChampionContextValue {
  featuredChampion: FeaturedChampionOption;
  setFeaturedChampion: (option: FeaturedChampionOption) => void;
}

const FeaturedChampionContext = createContext<FeaturedChampionContextValue | null>(null);

/**
 * Tema visual (splash art do login/dashboard) - campeao/skin escolhidos
 * livremente pelo usuario na tela de Configuracoes (ChampionSkinPicker),
 * nao mais uma lista curada fixa. Guardado por maquina (localStorage),
 * decisao deliberada - diferente de configuracoes que afetam analise
 * (essas ficam persistidas no servidor, por conta Riot).
 */
export function FeaturedChampionProvider({ children }: { children: ReactNode }) {
  const [featuredChampion, setFeaturedChampion] = useState<FeaturedChampionOption>(loadStoredChampion);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(featuredChampion));
  }, [featuredChampion]);

  const value = useMemo(() => ({ featuredChampion, setFeaturedChampion }), [featuredChampion]);

  return <FeaturedChampionContext.Provider value={value}>{children}</FeaturedChampionContext.Provider>;
}

export function useFeaturedChampion(): FeaturedChampionContextValue {
  const context = useContext(FeaturedChampionContext);
  if (!context) throw new Error("useFeaturedChampion precisa estar dentro de um FeaturedChampionProvider");
  return context;
}
