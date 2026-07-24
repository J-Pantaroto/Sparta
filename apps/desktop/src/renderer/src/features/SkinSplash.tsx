import { useEffect, useState } from "react";
import { championSplashUrl, championSquareUrl, communityDragonSplashUrl } from "./datadragon";

interface SkinSplashProps {
  championKey: string;
  championId: number;
  skinNum: number;
  ddragonVersion: string;
  alt: string;
  onClick?: () => void;
}

/**
 * Splash art de uma skin com a mesma politica de fallback do ChampionIcon:
 * 1. Data Dragon (`.jpg` - a CDN devolve 403 pra `.png`);
 * 2. Community Dragon (espelho publico, indexado por championId numerico) -
 *    cobre skins que a Data Dragon nao publica e serve de rede quando a
 *    CDN principal esta fora;
 * 3. icone quadrado do campeao, sempre confiavel, em vez do icone nativo de
 *    imagem quebrada do navegador.
 */
export function SkinSplash({ championKey, championId, skinNum, ddragonVersion, alt, onClick }: SkinSplashProps) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [fallbackUrl, setFallbackUrl] = useState<string | undefined>();

  useEffect(() => {
    setStage(0);
    setFallbackUrl(undefined);
  }, [championKey, skinNum]);

  // Busca a URL da Community Dragon so quando a Data Dragon de fato falhou.
  useEffect(() => {
    if (stage !== 1) return;
    let cancelled = false;
    void communityDragonSplashUrl(championId, skinNum).then((url) => {
      if (cancelled) return;
      if (url) setFallbackUrl(url);
      else setStage(2);
    });
    return () => {
      cancelled = true;
    };
  }, [stage, championId, skinNum]);

  const src =
    stage === 0
      ? championSplashUrl(championKey, skinNum)
      : stage === 1 && fallbackUrl
        ? fallbackUrl
        : championSquareUrl(championKey, ddragonVersion);

  return (
    <img
      src={src}
      alt={alt}
      onClick={onClick}
      onError={() => setStage((current) => (current === 0 ? 1 : 2))}
    />
  );
}
