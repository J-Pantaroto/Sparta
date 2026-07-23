import { HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { championSquareUrl, fetchAllChampions } from "./datadragon";

interface ChampionIconProps {
  championId: number;
  ddragonVersion: string;
  // Slug da Data Dragon (DataDragonChampionSummary.key), quando quem chama
  // ja tem o catalogo em maos (Pos-game/Pre-game/seletor de inimigo) - usa
  // direto, sem round-trip nenhum. Quando omitido (Perfil/Champion
  // Select/Dashboard, que so tem championId/championName cru do Match-V5),
  // o componente resolve o slug sozinho via o catalogo abaixo.
  slug?: string;
  size?: "sm" | "md";
  alt: string;
}

function communityDragonIconUrl(championId: number): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;
}

// Cache module-level simples (championId -> slug real da Data Dragon) -
// evita refazer o fetch de ~170 campeoes toda vez que um ChampionIcon sem
// `slug` monta (varias linhas de Perfil, cards de Champion Select); o
// catalogo e o mesmo campeao->slug pra qualquer tela na mesma sessao.
let catalogPromise: Promise<Map<number, string>> | null = null;
function loadCatalog(version: string): Promise<Map<number, string>> {
  catalogPromise ??= fetchAllChampions(version).then((champions) => new Map(champions.map((c) => [c.id, c.key])));
  return catalogPromise;
}

/**
 * Icone de campeao com 3 estagios de fallback (nunca mostra o icone nativo
 * de imagem quebrada do navegador):
 * 1. Data Dragon, pelo slug real (passado ou resolvido pelo championId via
 *    o catalogo) - nunca confia em `championName` cru do Match-V5 pra
 *    montar a URL (causa raiz de icones quebrados: esse campo as vezes nao
 *    bate com o slug que a Data Dragon espera).
 * 2. Community Dragon, indexado por championId numerico - espelho publico
 *    dos assets da Riot que nao depende de nome/slug nenhum, entao nunca
 *    sofre do mesmo problema.
 * 3. Placeholder estilizado (circulo com icone de interrogacao), se as
 *    duas fontes falharem.
 */
export function ChampionIcon({ championId, ddragonVersion, slug, size = "md", alt }: ChampionIconProps) {
  const [resolvedSlug, setResolvedSlug] = useState<string | undefined>(slug);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setResolvedSlug(slug);
    setAttempt(0);
    if (slug) return;
    let cancelled = false;
    void loadCatalog(ddragonVersion).then((catalog) => {
      if (!cancelled) setResolvedSlug((current) => current ?? catalog.get(championId));
    });
    return () => {
      cancelled = true;
    };
  }, [championId, ddragonVersion, slug]);

  const className = `champion-icon${size === "sm" ? " sm" : ""}`;

  if (attempt >= 2) {
    return (
      <div className={`${className} champion-icon-fallback`} title={alt}>
        <HelpCircle size={size === "sm" ? 14 : 18} />
      </div>
    );
  }

  const src =
    attempt === 0 && resolvedSlug ? championSquareUrl(resolvedSlug, ddragonVersion) : communityDragonIconUrl(championId);

  return <img className={className} src={src} alt={alt} onError={() => setAttempt((current) => current + 1)} />;
}
