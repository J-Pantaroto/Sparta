import { ArrowLeft, Check, Download, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useAsyncData } from "../hooks/use-async-data";
import {
  championSplashUrl,
  communityDragonSplashUrl,
  fetchChampionSkins,
  type DataDragonChampionSummary,
  type DataDragonSkin
} from "../services/datadragon";
import {
  Badge,
  Button,
  Card,
  ChampionGrid,
  EmptyState,
  ErrorState,
  SectionHeader,
  SignalChip,
  SkeletonGrid
} from "../ui";
import { useFeaturedChampion } from "./featured-champion-context";
import { SkinSplash } from "./SkinSplash";
import "./ThemeGallery.css";

/**
 * Galeria de temas: escolher qualquer campeão e qualquer skin dele. Só
 * skins de verdade - os chromas são filtrados pela Community Dragon, que
 * os traz aninhados dentro de cada skin (o campo `chromas` da Data Dragon
 * significa "esta skin TEM chromas", não "isto é um chroma").
 *
 * Aplicar usa a CDN; baixar grava a arte no disco (via IPC) e devolve um
 * data URL, que é o que faz o tema continuar funcionando offline.
 */
export function ThemeGallery({ ddragonVersion }: { ddragonVersion: string }) {
  const { featuredChampion, setFeaturedChampion, splashUrl } = useFeaturedChampion();
  const [selectedChampion, setSelectedChampion] = useState<DataDragonChampionSummary | null>(null);
  const [focusedSkin, setFocusedSkin] = useState<DataDragonSkin | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const skins = useAsyncData<DataDragonSkin[]>(
    () =>
      selectedChampion
        ? fetchChampionSkins(selectedChampion.key, ddragonVersion, selectedChampion.id)
        : undefined,
    [selectedChampion?.key, ddragonVersion]
  );

  // Ao abrir um campeão, a prévia começa na skin que já é o tema (se for
  // dele) ou na skin base - nunca vazia.
  useEffect(() => {
    if (!skins.data || !selectedChampion) return;
    const applied =
      featuredChampion.key === selectedChampion.key
        ? skins.data.find((skin) => skin.num === featuredChampion.skinIndex)
        : undefined;
    setFocusedSkin(applied ?? skins.data[0] ?? null);
  }, [skins.data, selectedChampion, featuredChampion.key, featuredChampion.skinIndex]);

  function applySkin(champion: DataDragonChampionSummary, skin: DataDragonSkin) {
    // Aplicar sem baixar volta pra CDN (localSplashPath undefined): o tema
    // funciona online; "Baixar" é o que garante funcionar offline depois.
    setFeaturedChampion({ key: champion.key, name: champion.name, skinIndex: skin.num, skinName: skin.name });
  }

  async function downloadSkin(champion: DataDragonChampionSummary, skin: DataDragonSkin) {
    if (!window.sparta?.downloadSkin) {
      setDownloadError("Download disponível apenas no aplicativo desktop.");
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    const fileName = `${champion.key}_${skin.num}.jpg`;
    try {
      let localUrl: string;
      try {
        localUrl = await window.sparta.downloadSkin(championSplashUrl(champion.key, skin.num), fileName);
      } catch (primaryError) {
        // Data Dragon não tem essa arte (ou caiu) - tenta a Community
        // Dragon antes de reportar erro pro usuário.
        const fallbackUrl = await communityDragonSplashUrl(champion.id, skin.num);
        if (!fallbackUrl) throw primaryError;
        localUrl = await window.sparta.downloadSkin(fallbackUrl, fileName);
      }
      setFeaturedChampion({
        key: champion.key,
        name: champion.name,
        skinIndex: skin.num,
        skinName: skin.name,
        // Data URL devolvido pelo main - `file://` não carrega no renderer
        // por segurança do Electron.
        localSplashPath: localUrl
      });
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Não foi possível baixar a skin.");
    } finally {
      setDownloading(false);
    }
  }

  const offlineReady = Boolean(featuredChampion.localSplashPath);

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <Card>
        <SectionHeader
          eyebrow="Tema atual"
          title={featuredChampion.skinName}
          description="A arte escolhida aparece nos cabeçalhos, e a cor dominante dela vira a cor de destaque do app inteiro — bordas ativas, botões principais, o item selecionado na navegação e o brilho de fundo."
          actions={
            offlineReady ? (
              <Badge tone="positive" icon={<Check size={11} />}>
                Disponível offline
              </Badge>
            ) : (
              <Badge tone="neutral" icon={<WifiOff size={11} />}>
                Só online
              </Badge>
            )
          }
        />
        <div style={{ display: "flex", gap: "var(--space-5)", alignItems: "center", flexWrap: "wrap" }}>
          <img
            src={splashUrl}
            alt={featuredChampion.skinName}
            style={{
              width: 220,
              height: 82,
              objectFit: "cover",
              objectPosition: "center 22%",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)"
            }}
          />
          <div>
            <span style={{ display: "block", color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
              Cor extraída desta skin
            </span>
            <div className="sp-swatches" style={{ marginTop: "var(--space-2)" }}>
              <span className="sp-swatch" style={{ background: "var(--color-accent)" }} title="Destaque" />
              <span className="sp-swatch" style={{ background: "var(--color-accent-soft)" }} title="Destaque suave" />
              <span className="sp-swatch" style={{ background: "var(--color-accent-glow)" }} title="Brilho ambiente" />
            </div>
          </div>
        </div>
        {!offlineReady && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <SignalChip tone="info">
              Baixe a arte pra o tema continuar aparecendo mesmo sem internet. As cores já ficam salvas de qualquer
              forma.
            </SignalChip>
          </div>
        )}
      </Card>

      <Card>
        {!selectedChampion ? (
          <>
            <SectionHeader
              title="Escolher tema"
              description="Qualquer campeão, qualquer skin. Chromas ficam de fora — são variações de cor da mesma arte."
            />
            <ChampionGrid
              ddragonVersion={ddragonVersion}
              maxHeight="320px"
              onSelect={setSelectedChampion}
              isSelected={(champion) => champion.key === featuredChampion.key}
            />
          </>
        ) : (
          <>
            <SectionHeader
              title={selectedChampion.name}
              description={skins.data ? `${skins.data.length} skins disponíveis.` : undefined}
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArrowLeft size={14} />}
                  onClick={() => setSelectedChampion(null)}
                >
                  Todos os campeões
                </Button>
              }
            />

            {downloadError && (
              <div style={{ marginBottom: "var(--space-4)" }}>
                <SignalChip tone="negative">{downloadError}</SignalChip>
              </div>
            )}

            {skins.status === "loading" && <SkeletonGrid count={8} size={124} />}
            {skins.status === "error" && (
              <ErrorState
                inline
                title="Não foi possível carregar as skins"
                description="A CDN da Riot pode estar indisponível. O tema atual continua aplicado."
              />
            )}
            {skins.data && skins.data.length === 0 && <EmptyState inline title="Nenhuma skin encontrada" />}

            {focusedSkin && selectedChampion && (
              <div className="sp-theme">
                <div className="sp-theme__preview">
                  <SkinSplash
                    championKey={selectedChampion.key}
                    championId={selectedChampion.id}
                    skinNum={focusedSkin.num}
                    ddragonVersion={ddragonVersion}
                    alt={focusedSkin.name}
                  />
                  <div className="sp-theme__preview-scrim">
                    <div style={{ minWidth: 0 }}>
                      <strong className="sp-theme__preview-name">
                        {focusedSkin.num === 0 ? selectedChampion.name : focusedSkin.name}
                      </strong>
                      <span className="sp-theme__preview-champion">{selectedChampion.name}</span>
                    </div>
                    <div className="sp-theme__preview-actions">
                      <Button
                        variant="secondary"
                        icon={<Download size={15} />}
                        loading={downloading}
                        onClick={() => void downloadSkin(selectedChampion, focusedSkin)}
                      >
                        Baixar
                      </Button>
                      <Button
                        variant={
                          featuredChampion.key === selectedChampion.key &&
                          featuredChampion.skinIndex === focusedSkin.num
                            ? "confirmed"
                            : "primary"
                        }
                        onClick={() => applySkin(selectedChampion, focusedSkin)}
                      >
                        {featuredChampion.key === selectedChampion.key &&
                        featuredChampion.skinIndex === focusedSkin.num
                          ? "Tema aplicado"
                          : "Aplicar tema"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="sp-theme__grid">
                  {(skins.data ?? []).map((skin) => {
                    const applied =
                      featuredChampion.key === selectedChampion.key && featuredChampion.skinIndex === skin.num;
                    const focused = focusedSkin.num === skin.num;
                    return (
                      <button
                        key={skin.num}
                        type="button"
                        className={`sp-theme__option${focused ? " sp-theme__option--focused" : ""}${
                          applied ? " sp-theme__option--applied" : ""
                        }`}
                        aria-pressed={focused}
                        onClick={() => setFocusedSkin(skin)}
                        title={skin.name}
                      >
                        <SkinSplash
                          championKey={selectedChampion.key}
                          championId={selectedChampion.id}
                          skinNum={skin.num}
                          ddragonVersion={ddragonVersion}
                          alt={skin.name}
                        />
                        {applied && (
                          <span className="sp-theme__option-flag" title="Tema aplicado">
                            <Check size={12} />
                          </span>
                        )}
                        <span className="sp-theme__option-name">
                          {skin.num === 0 ? selectedChampion.name : skin.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
