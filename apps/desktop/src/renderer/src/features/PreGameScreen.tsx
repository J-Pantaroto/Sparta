import type {
  AnalysisSection,
  AnalysisSignal,
  ChampionClassProfile,
  ChampionTagProvenance,
  DraftStrategicAnalysis,
  DraftState,
  PreGameAnalysis
} from "@sparta/core";
import type { ReactNode } from "react";
import { STRATEGIC_CAPABILITY_LABELS, summarizeEnemyDamageLean } from "@sparta/core";
import { ChevronDown, Shield } from "lucide-react";
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
import { PersonalLoadoutHistory } from "./PersonalLoadoutHistory";
import "./PreGameScreen.css";

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
  sessionToken,
  playerId
}: {
  draft: DraftState;
  ddragonVersion: string;
  sessionToken: string | null;
  playerId?: string;
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
    (signal) => {
      if (!sessionToken || !draft.playerRole || draft.selectedChampionId === undefined)
        return undefined;
      return fetchPreGameAnalysis(sessionToken, draft, signal);
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
  const compatibleAnalysis = {
    ...analysis,
    data:
      analysis.data?.selectedChampion.championId === draft.selectedChampionId &&
      analysis.data?.selectedChampion.role === draft.playerRole
        ? analysis.data
        : null
  };

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
          draft.playerRole
            ? `Preparação pro confronto em ${roleLabels[draft.playerRole]}.`
            : "Preparação pro confronto."
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
            <InlineStat
              label="Posição"
              value={draft.playerRole ? roleLabels[draft.playerRole] : "Não identificada"}
            />
            <InlineStat
              label="Inimigos revelados"
              value={`${enemyChampions.length}/${MAX_ENEMIES}`}
            />
            <InlineStat
              label="Cobertura dos dados"
              value={analysis.data ? `${Math.round(analysis.data.dataCoverage * 100)}%` : "—"}
              muted={!analysis.data}
            />
          </InlineStats>
        }
      />

      <PreGameDraftBoard
        draft={draft}
        catalog={catalog.data ?? []}
        ddragonVersion={ddragonVersion}
      />

      <Columns
        asideWidth="360px"
        main={
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <AnalysisBody state={compatibleAnalysis} />

            {draft.playerRole && (
              <PersonalLoadoutHistory
                token={sessionToken}
                playerId={playerId}
                championId={ownChampion.id}
                role={draft.playerRole}
                requestedPatch={draft.patch}
              />
            )}

            <Card>
              <SectionHeader
                title="Composição inimiga revelada"
                description="Só o que já apareceu no draft — a leitura muda conforme os picks são revelados."
                actions={
                  enemyLean &&
                  enemyLean.lean !== "BALANCED" && (
                    <Badge tone="accent">
                      {enemyLean.lean === "MAGIC" ? "Foco mágico" : "Foco físico"}
                    </Badge>
                  )
                }
              />
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                {Array.from({ length: MAX_ENEMIES }, (_, index) => {
                  const champion = enemyChampions[index];
                  if (!champion) {
                    return (
                      <EmptyAvatarSlot
                        key={`empty-${index}`}
                        size="lg"
                        label="Inimigo ainda não revelado"
                      />
                    );
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
            {analysis.status === "success" && analysis.data && (
              <SectionCard section={analysis.data.laneContext} />
            )}
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

  if (state.status === "loading" && !state.data) {
    return (
      <Card>
        <Loading label="Analisando o draft atual..." />
      </Card>
    );
  }

  if (state.status === "error" || !state.data) {
    return (
      <Card>
        <EmptyState
          title="Não foi possível analisar este draft"
          description={state.error ?? "Erro desconhecido."}
        />
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
          actions={
            state.status === "loading" ? (
              <Badge tone="accent">Atualizando draft</Badge>
            ) : analysis.status === "PARTIAL" ? (
              <Badge tone="warning">Draft incompleto</Badge>
            ) : undefined
          }
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
        <p
          style={{
            marginTop: "var(--space-4)",
            color: "var(--text-secondary)",
            fontSize: "var(--text-sm)"
          }}
        >
          Cobertura dos dados: {Math.round(analysis.dataCoverage * 100)}% dos sinais esperados
          estavam disponíveis. Não é confiança estatística nem chance de vitória — é quanto do draft
          e das tabelas o Sparta conseguiu ler.
        </p>
      </Card>

      {analysis.strategicAnalysis && <PreGameCapabilityMap analysis={analysis.strategicAnalysis} />}

      <SectionCard
        section={analysis.selectedChampionFit}
        footer={<ProfileSourceNote provenance={analysis.selectedChampion.profileProvenance} />}
      />
      <SectionCard section={analysis.knownRisks} />
      <CollapsibleAnalysis section={analysis.alliedComposition} />
      <CollapsibleAnalysis section={analysis.enemyComposition} />

      <details className="sp-pregame-details">
        <summary>
          Dados indisponiveis e limitacoes <ChevronDown size={16} aria-hidden="true" />
        </summary>
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
      </details>
    </>
  );
}

/**
 * Origem do perfil de campeão usado na análise, num rodapé discreto.
 *
 * Fica **só aqui**, num lugar só: repetir "derivado das classes" em cada
 * frase transformaria a ressalva em ruído, e destacá-la faria parecer
 * estatística. Sem proveniência (perfil gravado antes da Etapa 8, ou
 * campeão sem tag) o texto diz exatamente isso - não assume derivação.
 */
function ProfileSourceNote({ provenance }: { provenance?: ChampionTagProvenance }) {
  const texto = !provenance
    ? "Origem do perfil deste campeão não informada."
    : provenance.reviewState === "REVIEWED"
      ? "Perfil revisado especificamente para este campeão."
      : provenance.reviewState === "PARTIALLY_REVIEWED"
        ? `Perfil derivado das classes da Data Dragon, com ${provenance.reviewedDimensions.length} dimensão(ões) revisada(s).`
        : "Perfil derivado das classes da Data Dragon, sem revisão específica deste campeão.";

  const versao = provenance?.source.patch;

  return (
    <p
      style={{
        marginTop: "var(--space-4)",
        color: "var(--text-tertiary)",
        fontSize: "var(--text-xs)"
      }}
    >
      {texto}
      {versao ? ` Fonte: champion.json ${versao}.` : ""}
    </p>
  );
}

/** Uma seção do contrato. Indisponível não vira card vazio: vira o motivo. */
function SectionCard({ section, footer }: { section: AnalysisSection; footer?: ReactNode }) {
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
        <EmptyState
          inline
          title="Ainda sem dado pra esta leitura"
          description={section.unavailableReason}
        />
      ) : (
        <SignalChipList stacked>
          {section.signals.map((signal) => (
            <SignalChip key={signal.key} tone={chipTone(signal)}>
              {signal.description}
              {signal.evidence && signal.evidence.length > 0 && (
                <span style={{ color: "var(--text-tertiary)" }}>
                  {" "}
                  · {signal.evidence.join(" · ")}
                </span>
              )}
            </SignalChip>
          ))}
        </SignalChipList>
      )}
      {footer}
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

function PreGameDraftBoard({
  draft,
  catalog,
  ddragonVersion
}: {
  draft: DraftState;
  catalog: DataDragonChampionSummary[];
  ddragonVersion: string;
}) {
  const allies = [
    ...(draft.selectedChampionId === undefined
      ? []
      : [
          {
            championId: draft.selectedChampionId,
            championName:
              catalog.find((champion) => champion.id === draft.selectedChampionId)?.name ??
              `Campeão ${draft.selectedChampionId}`,
            role: draft.playerRole,
            team: "ally" as const
          }
        ]),
    ...draft.allies
  ].slice(0, 5);
  return (
    <Card className="sp-pregame-draft" pad="sm">
      <PreGameTeam title="Seu time" picks={allies} ddragonVersion={ddragonVersion} />
      <div className="sp-pregame-draft__center">
        <Shield size={20} aria-hidden="true" />
        <strong>Leitura do draft</strong>
        <span>
          {draft.allies.length + draft.enemies.length + (draft.selectedChampionId ? 1 : 0)} de 10
          campeões conhecidos
        </span>
        <small>Sem completar picks ou posicoes ausentes</small>
      </div>
      <PreGameTeam
        title="Time inimigo"
        picks={draft.enemies}
        ddragonVersion={ddragonVersion}
        directOpponentId={draft.enemyLaneChampionId}
      />
    </Card>
  );
}

function PreGameTeam({
  title,
  picks,
  ddragonVersion,
  directOpponentId
}: {
  title: string;
  picks: DraftState["allies"];
  ddragonVersion: string;
  directOpponentId?: number;
}) {
  return (
    <div className="sp-pregame-team">
      <strong>{title}</strong>
      <div>
        {Array.from({ length: 5 }, (_, index) => {
          const pick = picks[index];
          if (!pick)
            return (
              <EmptyAvatarSlot
                key={`${title}-${index}`}
                label={`${title}: vaga ${index + 1} desconhecida`}
              />
            );
          const direct = pick.championId === directOpponentId;
          return (
            <span
              key={`${pick.championId}-${index}`}
              className={direct ? "sp-pregame-team__direct" : undefined}
            >
              <ChampionAvatar
                championId={pick.championId}
                ddragonVersion={ddragonVersion}
                alt={`${pick.championName}${pick.role ? `, ${roleLabels[pick.role]}` : ", posição desconhecida"}${direct ? ", adversário direto confirmado" : ""}`}
              />
              {direct && <small>Direto</small>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PreGameCapabilityMap({ analysis }: { analysis: DraftStrategicAnalysis }) {
  const contribution = analysis.candidateContribution;
  const cells = [
    ...contribution.filledKnownGaps.map((key) => ({ key, state: "Cobre lacuna" })),
    ...contribution.addedCapabilities.map((key) => ({ key, state: "Adiciona" })),
    ...contribution.reinforcedCapabilities.map((key) => ({ key, state: "Reforca" })),
    ...contribution.remainingKnownGaps.map((key) => ({ key, state: "Lacuna conhecida" }))
  ].filter(
    (entry, index, list) => list.findIndex((candidate) => candidate.key === entry.key) === index
  );
  return (
    <Card>
      <SectionHeader
        eyebrow="Estrategia 5x5"
        title="Mapa de capacidades calculadas"
        description={`Cobertura ${Math.round(analysis.coverage * 100)}%. Representa somente dimensoes sustentadas pelo modelo atual.`}
      />
      <div
        className="sp-pregame-capabilities"
        role="list"
        aria-label="Equivalente textual do mapa de capacidades"
      >
        {cells.length === 0 ? (
          <span className="sp-pregame-capabilities__empty">
            Nenhuma contribuicao ou lacuna especifica foi identificada.
          </span>
        ) : (
          cells.map((cell) => (
            <div key={cell.key} role="listitem">
              <strong>{STRATEGIC_CAPABILITY_LABELS[cell.key]}</strong>
              <span>{cell.state}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function CollapsibleAnalysis({ section }: { section: AnalysisSection }) {
  return (
    <details className="sp-pregame-details">
      <summary>
        {section.title}
        <span>
          {section.knownCount !== undefined && section.expectedCount !== undefined
            ? `${section.knownCount}/${section.expectedCount}`
            : section.status === "UNAVAILABLE"
              ? "Indisponivel"
              : section.status === "PARTIAL"
                ? "Parcial"
                : "Disponivel"}
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </summary>
      <SectionCard section={section} />
    </details>
  );
}
