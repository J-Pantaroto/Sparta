import { recommendBuild, type ChampionClassProfile, type DraftState, type ItemSummary, type RecommendedItem } from "@sparta/core";
import { useMemo } from "react";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchChampionClassProfiles, fetchItemCatalog, itemIconUrl } from "../services/datadragon";
import { Card, Loading, SectionHeader, SignalChip, SignalChipList } from "../ui";
import "./BuildPanel.css";

interface BuildPanelProps {
  confirmedChampion: { championId: number; championName: string };
  enemies: DraftState["enemies"];
  ddragonVersion: string;
}

/**
 * Build sugerida pro campeao confirmado, adaptada ao time inimigo ja
 * revelado. Roda 100% no cliente (`recommendBuild` e puro, de
 * `@sparta/core`) sobre as tags reais do item.json - sem rota nova no
 * backend e sem persistencia: e uma decisao da sessao de draft.
 */
export function BuildPanel({ confirmedChampion, enemies, ddragonVersion }: BuildPanelProps) {
  const classProfiles = useAsyncData<ChampionClassProfile[]>(
    () => fetchChampionClassProfiles(ddragonVersion),
    [ddragonVersion]
  );
  const itemCatalog = useAsyncData<ItemSummary[]>(() => fetchItemCatalog(ddragonVersion), [ddragonVersion]);

  const build = useMemo(() => {
    if (!classProfiles.data || !itemCatalog.data) return undefined;
    const ownChampion = classProfiles.data.find((champion) => champion.championId === confirmedChampion.championId);
    const enemyChampions = enemies
      .map((enemy) => classProfiles.data?.find((champion) => champion.championId === enemy.championId))
      .filter((champion): champion is ChampionClassProfile => champion !== undefined);
    return recommendBuild({ ownChampion, enemyChampions, items: itemCatalog.data });
  }, [classProfiles.data, itemCatalog.data, confirmedChampion.championId, enemies]);

  const loading = classProfiles.status === "loading" || itemCatalog.status === "loading";

  return (
    <Card>
      <SectionHeader
        eyebrow="Build sugerida"
        title={confirmedChampion.championName}
        description="Ajustada ao que já foi revelado do time inimigo."
      />
      {loading && <Loading block label="Carregando itens..." />}
      {build && (
        <div className="sp-build">
          {build.boots && <BuildSlot label="Botas" items={[build.boots]} ddragonVersion={ddragonVersion} />}
          <BuildSlot label="Itens core" items={build.coreItems} ddragonVersion={ddragonVersion} />
          {build.situationalItems.length > 0 && (
            <BuildSlot label="Situacional" items={build.situationalItems} ddragonVersion={ddragonVersion} />
          )}
          <SignalChipList stacked>
            {build.reasons.map((reason) => (
              <SignalChip key={reason.code} tone="positive">
                {reason.detail}
              </SignalChip>
            ))}
            {build.warnings.map((warning) => (
              <SignalChip key={warning.code} tone="negative">
                {warning.detail}
              </SignalChip>
            ))}
          </SignalChipList>
        </div>
      )}
    </Card>
  );
}

function BuildSlot({
  label,
  items,
  ddragonVersion
}: {
  label: string;
  items: RecommendedItem[];
  ddragonVersion: string;
}) {
  return (
    <div className="sp-build__slot">
      <span className="sp-build__slot-label">{label}</span>
      <div className="sp-build__items">
        {items.map((item) => (
          <span className="sp-item" key={item.itemId} title={item.reason}>
            <img className="sp-item__icon" src={itemIconUrl(item.itemId, ddragonVersion)} alt="" />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}
