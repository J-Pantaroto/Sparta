import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { extractAccentPalette, type AccentPalette } from "./accent-color";
import { championSplashUrl } from "./datadragon";

export interface FeaturedChampionOption {
  key: string;
  name: string;
  skinIndex: number;
  skinName: string;
  /** Data URL da skin ja baixada pro disco - preferido sobre a CDN quando presente. */
  localSplashPath?: string;
  /**
   * Paleta de destaque ja extraida dessa skin. Persistida junto pra a cor
   * aparecer no boot sem "flash" do vermelho padrao enquanto a imagem
   * carrega e e reprocessada.
   */
  accent?: AccentPalette;
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
      localSplashPath: parsed.localSplashPath?.startsWith("data:") ? parsed.localSplashPath : undefined,
      accent: parsed.accent
    };
  } catch {
    return DEFAULT_CHAMPION;
  }
}

/** Aplica (ou limpa, com `undefined`) a paleta de destaque no documento. */
function applyAccentPalette(palette: AccentPalette | undefined) {
  const root = document.documentElement.style;
  if (!palette) {
    root.removeProperty("--color-accent");
    root.removeProperty("--color-accent-soft");
    root.removeProperty("--color-accent-glow");
    return;
  }
  root.setProperty("--color-accent", palette.accent);
  root.setProperty("--color-accent-soft", palette.soft);
  root.setProperty("--color-accent-glow", palette.glow);
}

interface FeaturedChampionContextValue {
  featuredChampion: FeaturedChampionOption;
  setFeaturedChampion: (option: FeaturedChampionOption) => void;
  /** URL da splash do tema atual (local baixada, se houver; senao CDN). */
  splashUrl: string;
}

const FeaturedChampionContext = createContext<FeaturedChampionContextValue | null>(null);

/**
 * Tema visual do app - campeao/skin escolhidos livremente pelo usuario na
 * tela de Configuracoes (ChampionSkinPicker). Guardado por maquina
 * (localStorage), decisao deliberada - diferente de configuracoes que
 * afetam analise (essas ficam no servidor, por conta Riot).
 *
 * Alem da arte, o tema define a **cor de destaque do app inteiro**: a cor
 * dominante da splash e extraida e aplicada nos tokens `--color-accent*`,
 * que todos os usos de destaque do global.css ja consomem.
 */
export function FeaturedChampionProvider({ children }: { children: ReactNode }) {
  const [featuredChampion, setFeaturedChampion] = useState<FeaturedChampionOption>(loadStoredChampion);

  const splashUrl = useMemo(
    () => featuredChampion.localSplashPath ?? championSplashUrl(featuredChampion.key, featuredChampion.skinIndex),
    [featuredChampion.localSplashPath, featuredChampion.key, featuredChampion.skinIndex]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(featuredChampion));
  }, [featuredChampion]);

  // Aplica a cor ja conhecida na hora (sem esperar a imagem) e, quando ela
  // ainda nao existe pra essa skin, extrai e guarda no proprio estado - o
  // efeito acima persiste, entao a proxima abertura ja nasce colorida.
  useEffect(() => {
    applyAccentPalette(featuredChampion.accent);
    if (featuredChampion.accent) return;

    let cancelled = false;
    void extractAccentPalette(splashUrl).then((palette) => {
      if (cancelled || !palette) return;
      setFeaturedChampion((current) =>
        // Guarda contra a skin ter mudado enquanto a extracao rodava.
        current.key === featuredChampion.key && current.skinIndex === featuredChampion.skinIndex
          ? { ...current, accent: palette }
          : current
      );
    });
    return () => {
      cancelled = true;
    };
  }, [featuredChampion.accent, featuredChampion.key, featuredChampion.skinIndex, splashUrl]);

  const value = useMemo(
    () => ({ featuredChampion, setFeaturedChampion, splashUrl }),
    [featuredChampion, splashUrl]
  );

  return <FeaturedChampionContext.Provider value={value}>{children}</FeaturedChampionContext.Provider>;
}

export function useFeaturedChampion(): FeaturedChampionContextValue {
  const context = useContext(FeaturedChampionContext);
  if (!context) throw new Error("useFeaturedChampion precisa estar dentro de um FeaturedChampionProvider");
  return context;
}
