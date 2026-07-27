import { useEffect, useState } from "react";
import { HTTP_TIMEOUTS } from "@sparta/riot/http";
import { championSplashUrl, championSquareUrl, communityDragonSplashUrl } from "../services/datadragon";

interface SkinSplashProps {
  championKey: string;
  championId: number;
  skinNum: number;
  ddragonVersion: string;
  alt: string;
  onClick?: () => void;
  className?: string;
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
export function SkinSplash({
  championKey,
  championId,
  skinNum,
  ddragonVersion,
  alt,
  onClick,
  className
}: SkinSplashProps) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [fallbackUrl, setFallbackUrl] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setStage(0);
    setFallbackUrl(undefined);
    setLoaded(false);
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

  useEffect(() => {
    if (loaded) return;
    const timer = window.setTimeout(
      () => setStage((current) => (current === 0 ? 1 : 2)),
      HTTP_TIMEOUTS.remoteAssetMs
    );
    return () => window.clearTimeout(timer);
  }, [src, loaded]);

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      onClick={onClick}
      onLoad={() => setLoaded(true)}
      onError={() => {
        setLoaded(false);
        setStage((current) => (current === 0 ? 1 : 2));
      }}
    />
  );
}
