import { HelpCircle, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { HTTP_TIMEOUTS } from "@sparta/riot/http";
import { championSquareUrl, fetchAllChampions } from "../services/datadragon";
import "./ChampionAvatar.css";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const iconSize: Record<AvatarSize, number> = { xs: 12, sm: 14, md: 18, lg: 22, xl: 28 };

interface ChampionAvatarProps {
  championId: number;
  ddragonVersion: string;
  /**
   * Slug da Data Dragon, quando quem chama ja tem o catalogo em maos - usa
   * direto, sem round-trip. Omitido, o componente resolve pelo championId.
   */
  slug?: string;
  size?: AvatarSize;
  alt: string;
  /** Anel na cor do tema - campeao selecionado/confirmado. */
  ring?: boolean;
  /** Cinza + opaco - opcao indisponivel ou ainda nao revelada. */
  muted?: boolean;
  title?: string;
}

function communityDragonIconUrl(championId: number): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;
}

// Cache module-level (championId -> slug real da Data Dragon): o catalogo e
// o mesmo pra qualquer tela na sessao, e varios avatares montam ao mesmo
// tempo (linhas do Perfil, cards de recomendacao).
let catalogPromise: Promise<Map<number, string>> | null = null;
function loadCatalog(version: string): Promise<Map<number, string>> {
  catalogPromise ??= fetchAllChampions(version).then((champions) => new Map(champions.map((c) => [c.id, c.key])));
  return catalogPromise;
}

/**
 * Retrato de campeao com 3 estagios de fallback, nesta ordem:
 *
 * 1. Data Dragon pelo slug real (passado, ou resolvido pelo championId via
 *    catalogo) - nunca monta a URL com `championName` cru do Match-V5, que
 *    nem sempre bate com o slug esperado (causa raiz de icones quebrados).
 * 2. Community Dragon, indexado so por championId numerico - nao depende de
 *    nome nenhum, entao nao sofre do mesmo problema.
 * 3. Placeholder estilizado, nunca o icone nativo de imagem quebrada.
 */
export function ChampionAvatar({
  championId,
  ddragonVersion,
  slug,
  size = "md",
  alt,
  ring = false,
  muted = false,
  title
}: ChampionAvatarProps) {
  const [resolvedSlug, setResolvedSlug] = useState<string | undefined>(slug);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setResolvedSlug(slug);
    setAttempt(0);
    setLoaded(false);
    if (slug) return;
    let cancelled = false;
    void loadCatalog(ddragonVersion).then((catalog) => {
      if (!cancelled) setResolvedSlug((current) => current ?? catalog.get(championId));
    });
    return () => {
      cancelled = true;
    };
  }, [championId, ddragonVersion, slug]);

  useEffect(() => {
    if (attempt >= 2 || loaded) return;
    const timer = window.setTimeout(() => setAttempt((current) => current + 1), HTTP_TIMEOUTS.remoteAssetMs);
    return () => window.clearTimeout(timer);
  }, [attempt, loaded, resolvedSlug]);

  const className = [
    "sp-avatar",
    `sp-avatar--${size}`,
    ring ? "sp-avatar--ring" : "",
    muted ? "sp-avatar--muted" : ""
  ]
    .filter(Boolean)
    .join(" ");

  if (attempt >= 2) {
    return (
      <div className={`${className} sp-avatar--fallback`} title={title ?? alt} role="img" aria-label={alt}>
        <HelpCircle size={iconSize[size]} />
      </div>
    );
  }

  const src =
    attempt === 0 && resolvedSlug ? championSquareUrl(resolvedSlug, ddragonVersion) : communityDragonIconUrl(championId);

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      title={title ?? alt}
      onLoad={() => setLoaded(true)}
      onError={() => {
        setLoaded(false);
        setAttempt((current) => current + 1);
      }}
    />
  );
}

/** Slot vazio com a mesma medida do avatar - draft com inimigo desconhecido. */
export function EmptyAvatarSlot({ size = "md", label }: { size?: AvatarSize; label: string }) {
  return (
    <div className={`sp-avatar sp-avatar--${size} sp-avatar--empty`} title={label} role="img" aria-label={label}>
      <Plus size={iconSize[size]} />
    </div>
  );
}
