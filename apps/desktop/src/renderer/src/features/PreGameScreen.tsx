import type {
  AnalysisSection,
  AnalysisSignal,
  ChampionClassProfile,
  DraftState,
  PreGameAnalysis
} from "@sparta/core";
import { summarizeEnemyDamageLean } from "@sparta/core";
import { Shield } from "lucide-react";
import { roleLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchPreGameAnalysis } from "../services/api-client";
import {
  championSplashUrl,
  fetchAllChampions,
  fetchChampionClassProfiles,
  type DataDragonChampionSummary
} from "../services/datadragon";
import {
  Badge,
  Card,
  ChampionAvatar,
  Columns,
  EmptyAvatarSlot,
  EmptyState,
  InlineStat,
  InlineStats,
  Loading,
  PageHero,
  PageLayout,
  SectionHeader,
  SignalChip,
  SignalChipList
} from "../ui";
import { BuildPanel } from "./BuildPanel";

const MAX_ENEMIES = 5;

/**
 * Análise pré-game real: tudo que aparece aqui vem do contrato estruturado
 * de `POST /drafts/pre-game-analysis`, derivado do draft atual.
 *
 * Não existe mais orientação fixa nesta tela. Ou o dado sustenta a frase, ou
 * o bloco aparece como indisponível com o motivo - manter as duas coisas
 * lado a lado fazia o texto padrão parecer análise personalizada.
 */
export function PreGameScreen({
  draft,
  ddragonVersion,
  sessionToken
}: {
  draft: DraftState;
  ddragonVersion: string;
  sessionToken: string | null;
}) {
  const catalog = useAsyncData<DataDragonChampionSummary[]>(
    () => fetchAllChampions(ddragonVersion),
    [ddragonVersion]
  );
  const classProfiles = useAsyncData<ChampionClassProfile[]>(
    () => fetchChampionClassProfiles(ddragonVersion),
    [ddragonVersion]
  );

  // A análise é refeita a cada mudança relevante do draft. O `deps` inclui
  // campeão e posição de propósito: trocar qualquer um dos dois invalida a
  // leitura anterior por completo.
  const analysis = useAsyncData<PreGameAnalysis>(
    () => {
      if (!sessionToken || !draft.playerRole || draft.selectedChampionId === undefined) return undefined;
      return fetchPreGameAnalysis(sessionToken, draft);
    },
    [
      sessionToken,
      draft.playerRole,
      draft.selectedChampionId,
      draft.enemyLaneChampionId,
      draft.allies.map((pick) => pick.championId).join(","),
      draft.enemies.map((pick) => pick.championId).join(",")
    ]
  );

  const ownChampion = catalog.data?.find((champion) => champion.id === draft.selectedChampionId);
  const enemyChampions = draft.enemies
    .map((enemy) => catalog.data?.find((champion) => champion.id === enemy.championId))
    .filter((champion): champion is DataDragonChampionSummary => champion !== undefined);
  const enemyProfiles = draft.enemies
    .map((enemy) => classProfiles.data?.find((profile) => profile.championId === enemy.championId))
    .filter((profile): profile is ChampionClassProfile => profile !== undefined);
  const enemyLean = classProfiles.data ? summarizeEnemyDamageLean(enemyProfiles) : undefined;
  const heroSplash = ownChampion ? championSplashUrl(ownChampion.key, 0) : undefined;

  if (!ownChampion) {
    return (
      <PageLayout>
        <PageHero eyebrow="Pré-game" title="Análise pré-game" />
        <Card>
          <EmptyState
            icon={<Shield size={22} />}
            title="Nenhum campeão confirmado"
            description="Confirme seu campeão no Champion Select pra ver aqui a análise do draft atual e a build sugerida."
          />
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHero
        variant="feature"
        eyebrow="Pré-game"
        title={ownChampion.name}
        subtitle={
          draft.playerRole ? `Preparação pro confronto em ${roleLabels[draft.playerRole]}.` : "Preparação pro confronto."
        }
        artUrl={heroSplash}
        aside={
          <ChampionAvatar
            championId={ownChampion.id}
            slug={ownChampion.key}
            ddragonVersion={ddragonVersion}
            size="xl"
            alt={ownChampion.name}
            ring
          />
        }
        meta={
          <InlineStats>
            <InlineStat label="Posição" value={draft.playerRole ? roleLabels[draft.playerRole] : "Não identificada"} />
            <InlineStat label="Inimigos revelados" value={`${enemyChampions.length}/${MAX_ENEMIES}`} />
            <InlineStat
              label="Cobertura dos dados"
              value={analysis.data ? `${Math.round(analysis.data.dataCoverage * 100)}%` : "—"}
              muted={!analysis.data}
            />
          </InlineStats>
        }
      />

      <Columns
        asideWidth="360px"
        main={
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <AnalysisBody state={analysis} />

            <Card>
              <SectionHeader
                title="Composição inimiga revelada"
                description="Só o que já apareceu no draft — a leitura muda conforme os picks são revelados."
                actions={
                  enemyLean &&
                  enemyLean.lean !== "BALANCED" && (
                    <Badge tone="accent">{enemyLean.lean === "MAGIC" ? "Foco mágico" : "Foco físico"}</Badge>
                  )
                }
              />
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                {Array.from({ length: MAX_ENEMIES }, (_, index) => {
                  const champion = enemyChampions[index];
                  if (!champion) {
                    return <EmptyAvatarSlot key={`empty-${index}`} size="lg" label="Inimigo ainda não revelado" />;
                  }
                  return (
                    <div key={champion.id} style={{ textAlign: "center", minWidth: 0 }}>
                      <ChampionAvatar
                        championId={champion.id}
                        slug={champion.key}
                        ddragonVersion={ddragonVersion}
                        size="lg"
                        alt={champion.name}
                      />
                      <span
                        className="sp-truncate"
                        style={{
                          display: "block",
                          marginTop: "var(--space-2)",
                          maxWidth: 56,
                          color: "var(--text-secondary)",
                          fontSize: "var(--text-xs)"
                        }}
                      >
                        {champion.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        }
        aside={
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            {analysis.status === "success" && analysis.data && <SectionCard section={analysis.data.laneContext} />}
            <BuildPanel
              confirmedChampion={{ championId: ownChampion.id, championName: ownChampion.name }}
              enemies={draft.enemies}
              ddragonVersion={ddragonVersion}
            />
          </div>
        }
      />
    </PageLayout>
  );
}

/**
 * O corpo da análise. Enquanto carrega, **nada** da leitura anterior é
 * mostrado: com o draft mudando ao vivo, exibir o resultado do draft antigo
 * como atual é pior que mostrar um spinner.
 */
function AnalysisBody({
  state
}: {
  state: { data: PreGameAnalysis | null; status: string; error: string | null };
}) {
  if (state.status === "idle") {
    return (
      <Card>
        <EmptyState
          title="Análise ainda não disponível"
          description="A análise pré-game precisa de um campeão confirmado e da sua posição identificada."
        />
      </Card>
    );
  }

  if (state.status === "loading") {
    return (
      <Card>
        <Loading label="Analisando o draft atual..." />
      </Card>
    );
  }

  if (state.status === "error" || !state.data) {
    return (
      <Card>
        <EmptyState title="Não foi possível analisar este draft" description={state.error ?? "Erro desconhecido."} />
      </Card>
    );
  }

  const analysis = state.data;

  return (
    <>
      <Card tone="feature">
        <SectionHeader
          eyebrow="Resumo da escolha"
          title={analysis.summary.description}
          actions={analysis.status === "PARTIAL" ? <Badge tone="warning">Draft incompleto</Badge> : undefined}
        />
        {analysis.summary.evidence && analysis.summary.evidence.length > 0 && (
          <SignalChipList>
            {analysis.summary.evidence.map((item) => (
              <SignalChip key={item} tone="info" pill>
                {item}
              </SignalChip>
            ))}
          </SignalChipList>
        )}
        <p style={{ marginTop: "var(--space-4)", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
          Cobertura dos dados: {Math.round(analysis.dataCoverage * 100)}% dos sinais esperados estavam disponíveis. Não é
          confiança estatística nem chance de vitória — é quanto do draft e das tabelas o Sparta conseguiu ler.
        </p>
      </Card>

      <SectionCard section={analysis.selectedChampionFit} />
      <SectionCard section={analysis.knownRisks} />
      <SectionCard section={analysis.alliedComposition} />
      <SectionCard section={analysis.enemyComposition} />

      <Card tone="flat">
        <SectionHeader
          title="Sinais ainda indisponíveis"
          description="O Sparta reconhece estes conceitos mas não tem fonte pra eles hoje. Ficam listados aqui pra você saber o que a análise acima não cobre."
        />
        <SignalChipList stacked>
          {analysis.unavailableSignals.map((signal) => (
            <SignalChip key={signal.key} tone="info" title={signal.description}>
              <strong>{signal.title}:</strong> {signal.unavailableReason}
            </SignalChip>
          ))}
        </SignalChipList>
      </Card>
    </>
  );
}

/** Uma seção do contrato. Indisponível não vira card vazio: vira o motivo. */
function SectionCard({ section }: { section: AnalysisSection }) {
  const partial = section.status === "PARTIAL";
  // Seção sem leitura recua visualmente: com o draft ainda abrindo, três
  // cards de "ainda sem dado" com o mesmo peso afogariam o que já dá pra ler.
  const vazia = section.status === "UNAVAILABLE" || section.signals.length === 0;

  return (
    <Card tone={vazia ? "flat" : "default"}>
      <SectionHeader
        title={section.title}
        description={
          section.knownCount !== undefined && section.expectedCount !== undefined
            ? `${section.knownCount} de ${section.expectedCount} campeões conhecidos.`
            : undefined
        }
        actions={partial ? <Badge tone="warning">Parcial</Badge> : undefined}
      />
      {vazia ? (
        <EmptyState inline title="Ainda sem dado pra esta leitura" description={section.unavailableReason} />
      ) : (
        <SignalChipList stacked>
          {section.signals.map((signal) => (
            <SignalChip key={signal.key} tone={chipTone(signal)}>
              {signal.description}
              {signal.evidence && signal.evidence.length > 0 && (
                <span style={{ color: "var(--text-tertiary)" }}> · {signal.evidence.join(" · ")}</span>
              )}
            </SignalChip>
          ))}
        </SignalChipList>
      )}
    </Card>
  );
}

/** Indisponível nunca vira alerta: é ausência de leitura, não risco. */
function chipTone(signal: AnalysisSignal): "positive" | "negative" | "info" {
  if (signal.status === "UNAVAILABLE") return "info";
  if (signal.tone === "POSITIVE") return "positive";
  if (signal.tone === "WARNING") return "negative";
  return "info";
}
