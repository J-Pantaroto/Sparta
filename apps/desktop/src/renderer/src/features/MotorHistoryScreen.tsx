import type {
  CountRatio,
  LongitudinalRecommendationReport,
  NumericBandDistribution,
  RecommendationSelectionGroup,
  Role
} from "@sparta/core";
import { BarChart3, Info, UserPlus } from "lucide-react";
import { useState } from "react";
import { ROLES, roleLabels } from "../app/labels";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchRecommendationObservability, type RiotAccountSummary } from "../services/api-client";
import {
  Card,
  EmptyState,
  ErrorState,
  InlineStat,
  InlineStats,
  Loading,
  PageHero,
  PageLayout,
  SectionHeader,
  SegmentedControl,
  SignalChip,
  SignalChipList
} from "../ui";
import "./MotorHistoryScreen.css";

type RoleFilter = "ALL" | Role;

const groupLabels: Record<RecommendationSelectionGroup, string> = {
  PRIMARY: "Principais",
  ALTERNATIVE: "Alternativas",
  NOT_IN_SNAPSHOT: "Fora do snapshot"
};

const dimensionLabels: Record<string, string> = {
  recommendationEngine: "Motor de recomendação",
  draftStrategy: "Motor estratégico",
  executionRisk: "Risco de execução",
  postgameComparison: "Relatório pós-game",
  SNAPSHOT: "Snapshot histórico",
  RANK: "Posição no ranking",
  SCORE: "Score histórico",
  COVERAGE: "Cobertura histórica",
  EXECUTION_RISK: "Risco de execução",
  OBSERVED_POSITION: "Posição observada",
  PATCH: "Patch",
  QUEUE: "Fila",
  PLAYED_AT: "Data da partida",
  POSTGAME_COMPARISON: "Comparação pós-game"
};

export function MotorHistoryScreen({
  riotAccounts,
  sessionToken
}: {
  riotAccounts: RiotAccountSummary[];
  sessionToken: string | null;
}) {
  const account = riotAccounts[0];
  const [role, setRole] = useState<RoleFilter>("ALL");
  const report = useAsyncData<LongitudinalRecommendationReport>(
    () =>
      account && sessionToken
        ? fetchRecommendationObservability(
            sessionToken,
            account.puuid,
            role === "ALL" ? {} : { roles: [role] }
          )
        : undefined,
    [account?.puuid, sessionToken, role]
  );

  if (!account) {
    return (
      <PageLayout>
        <PageHero eyebrow="Observabilidade" title="Histórico do motor" />
        <Card>
          <EmptyState
            icon={<UserPlus size={22} />}
            title="Nenhuma conta Riot vinculada"
            description="Vincule sua conta para consultar os drafts ligados a partidas reais."
          />
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHero
        eyebrow="Observabilidade"
        title="Histórico do motor"
        subtitle="Distribuição descritiva das decisões registradas. Nenhum resultado altera o ranking ou os pesos históricos."
        meta={
          report.data && (
            <InlineStats>
              <InlineStat label="Drafts vinculados" value={report.data.linkedSessionCount} />
              <InlineStat
                label="Comparações pós-game"
                value={`${report.data.availableComparisonCount} de ${report.data.sampleSize}`}
              />
              <InlineStat
                label="Versões misturadas"
                value={report.data.mixedAlgorithmVersions ? "Sim, identificadas" : "Não"}
              />
            </InlineStats>
          )
        }
      />

      <SegmentedControl
        value={role}
        onChange={setRole}
        ariaLabel="Filtrar histórico por posição"
        options={[
          { value: "ALL", label: "Todas" },
          ...ROLES.map((value) => ({ value, label: roleLabels[value] }))
        ]}
      />

      {report.status === "loading" && (
        <Card>
          <Loading label="Carregando histórico do motor..." />
        </Card>
      )}
      {report.status === "error" && (
        <Card>
          <ErrorState inline description={report.error ?? undefined} />
        </Card>
      )}
      {report.data?.sampleSize === 0 && (
        <Card>
          <EmptyState
            icon={<BarChart3 size={22} />}
            title="Nenhum draft vinculado neste recorte"
            description="Somente sessões ligadas com segurança a uma partida Match-V5 entram nesta análise."
          />
        </Card>
      )}

      {report.data && report.data.sampleSize > 0 && <ReportContent report={report.data} />}
    </PageLayout>
  );
}

export function ReportContent({ report }: { report: LongitudinalRecommendationReport }) {
  const rankOne = report.rankDistribution.ranks.find((entry) => entry.rank === 1);
  return (
    <>
      <div className="sp-motor-history__summary-grid">
        <Card>
          <SectionHeader
            title="Escolhas registradas"
            description={`${report.sampleSize} sessões vinculadas nos filtros atuais.`}
          />
          <div className="sp-motor-history__rows">
            {report.selectionDistribution.groups.map((entry) => (
              <ObservationRow
                key={entry.group}
                label={groupLabels[entry.group]}
                count={entry.selections}
                wins={entry.outcomes.wins.numerator}
                losses={entry.outcomes.losses.numerator}
              />
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Posições no ranking original"
            description={`${report.rankDistribution.sampleSize} escolhas possuíam posição registrada.`}
          />
          <InlineStats>
            <InlineStat
              label="Rank médio"
              value={report.rankDistribution.mean ?? "Indisponível"}
              muted={report.rankDistribution.mean === null}
            />
            <InlineStat
              label="Rank mediano"
              value={report.rankDistribution.median ?? "Indisponível"}
              muted={report.rankDistribution.median === null}
            />
            <InlineStat
              label="Primeira recomendação"
              value={
                rankOne
                  ? `${rankOne.selections.numerator} de ${rankOne.selections.denominator}`
                  : "0 observações"
              }
            />
          </InlineStats>
          {rankOne && (
            <p className="sp-motor-history__context">
              Resultado observado quando a primeira recomendação foi escolhida:{" "}
              {rankOne.outcomes.wins.numerator} vitória(s) e {rankOne.outcomes.losses.numerator}{" "}
              derrota(s) em {rankOne.outcomes.sampleSize} partida(s).
            </p>
          )}
        </Card>
      </div>

      <Card>
        <SectionHeader
          title="Score, cobertura e risco em faixas"
          description="Agrupamentos de leitura; os valores brutos históricos não são alterados e não representam probabilidade."
        />
        <div className="sp-motor-history__band-grid">
          <BandColumn title="Score registrado" distribution={report.scoreBands} />
          <BandColumn title="Cobertura registrada" distribution={report.coverageBands} />
          <BandColumn title="Risco registrado" distribution={report.executionRiskBands} />
        </div>
      </Card>

      <div className="sp-motor-history__summary-grid">
        <Card>
          <SectionHeader
            title="Distribuição por posição"
            description={`${report.positionDivergence.divergences.numerator} divergência(s) em ${report.positionDivergence.divergences.denominator} posição(ões) comparáveis.`}
          />
          <div className="sp-motor-history__rows">
            {report.roleBreakdown.map((entry) => (
              <ObservationRow
                key={entry.value}
                label={roleLabels[entry.value as Role]}
                count={entry.selections}
                wins={entry.outcomes.wins.numerator}
                losses={entry.outcomes.losses.numerator}
              />
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Correspondências pós-game"
            description={`${report.availableComparisonCount} relatório(s) disponível(is); ${report.unavailableSignalCount} sinal(is) indisponível(is).`}
          />
          <div className="sp-motor-history__rows">
            {report.postgameSignalFrequencies.length > 0 ? (
              report.postgameSignalFrequencies.map((entry) => (
                <div className="sp-motor-history__row" key={entry.key}>
                  <span>{entry.key.replaceAll("_", " ").toLocaleLowerCase("pt-BR")}</span>
                  <strong>
                    {entry.comparable.numerator} comparável(is) de {entry.comparable.denominator}
                  </strong>
                </div>
              ))
            ) : (
              <p className="sp-motor-history__context">
                Nenhuma correspondência pós-game disponível neste recorte.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeader
          title="Versões presentes"
          description={
            report.mixedAlgorithmVersions
              ? "Mais de uma versão aparece no recorte; a distribuição permanece separada."
              : "Cada dimensão possui uma única versão observada no recorte."
          }
        />
        <div className="sp-motor-history__version-grid">
          {report.algorithmVersionBreakdown.map((entry) => (
            <div className="sp-motor-history__version" key={`${entry.dimension}:${entry.version}`}>
              <span>{dimensionLabels[entry.dimension] ?? entry.dimension}</span>
              <strong>{entry.version}</strong>
              <small>
                {entry.sampleSize} observação(ões) ·{" "}
                {entry.roles.map((roleValue) => roleLabels[roleValue]).join(", ") ||
                  "posição ausente"}
                {" · "}
                {entry.patches.join(", ") || "patch ausente"}
              </small>
            </div>
          ))}
        </div>
        <SignalChipList stacked>
          {report.algorithmVersionComparisons
            .filter((entry) => entry.status === "UNAVAILABLE" && entry.versions.length > 1)
            .map((entry) => (
              <SignalChip tone="info" key={entry.dimension}>
                {dimensionLabels[entry.dimension] ?? entry.dimension}: dados insuficientes para
                comparar versões — {entry.reasons.join(" ")}
              </SignalChip>
            ))}
        </SignalChipList>
      </Card>

      <Card tone="inset">
        <SectionHeader
          eyebrow={
            <>
              <Info size={12} /> Limitações
            </>
          }
          title="Disponibilidade da amostra"
          description={`O limite de ${report.displaySampleThreshold} partidas é somente de exibição, não significância estatística.`}
        />
        <SignalChipList stacked>
          {report.unavailableDimensions.map((entry) => (
            <SignalChip tone="info" key={entry.dimension}>
              {dimensionLabels[entry.dimension] ?? entry.dimension}: {entry.unavailable.numerator}{" "}
              indisponível(is) em {entry.unavailable.denominator} observação(ões).{" "}
              {entry.reasons.join(" ")}
            </SignalChip>
          ))}
        </SignalChipList>
        <p className="sp-motor-history__notice">{report.limitation}</p>
      </Card>
    </>
  );
}

function ObservationRow({
  label,
  count,
  wins,
  losses
}: {
  label: string;
  count: CountRatio;
  wins: number;
  losses: number;
}) {
  return (
    <div className="sp-motor-history__row">
      <span>{label}</span>
      <strong>
        {count.numerator} de {count.denominator}
      </strong>
      <small>
        {wins} vitória(s) · {losses} derrota(s)
      </small>
    </div>
  );
}

function BandColumn({
  title,
  distribution
}: {
  title: string;
  distribution: NumericBandDistribution;
}) {
  const populated = distribution.observations.filter((entry) => entry.sampleSize > 0);
  return (
    <div className="sp-motor-history__band">
      <strong>{title}</strong>
      <small>
        {distribution.availableSampleSize} disponível(is) · {distribution.unavailableCount}{" "}
        ausente(s)
      </small>
      {populated.map((entry) => (
        <div className="sp-motor-history__band-row" key={entry.id}>
          <span>{entry.label}</span>
          <span>
            {entry.sampleSize} partida(s): {entry.outcomes.wins.numerator} V ·{" "}
            {entry.outcomes.losses.numerator} D
          </span>
        </div>
      ))}
    </div>
  );
}
