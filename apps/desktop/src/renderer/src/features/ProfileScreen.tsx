import type { PlayerProfileOverview, ProfileCoverage } from "@sparta/core";
import { AlertTriangle, BarChart3, Database, Gamepad2, RefreshCw, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { useAsyncData } from "../hooks/use-async-data";
import { fetchMyPlayerProfile } from "../services/api-client";
import {
  Card,
  ChampionPerformanceCard,
  CoverageBadge,
  EmptyState,
  ErrorState,
  InsightCard,
  MetricCard,
  PageLayout,
  PageSection,
  ProfileDataNotice,
  ProfileHero,
  RecentMatchRow,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  SkeletonRows,
  TrendChart
} from "../ui";

type TrendPeriod = "7" | "14" | "30";

const coverageLabels: Record<keyof ProfileCoverage, string> = {
  identity: "Identidade Riot",
  ranked: "Ranque League-V4",
  roles: "Posições observadas",
  recentPerformance: "Desempenho recente",
  trend: "Tendência temporal",
  champions: "Campeões utilizados",
  matches: "Partidas recentes",
  objectives: "Participação em objetivos",
  loadout: "Itens, runas e feitiços"
};

export function ProfileScreen({
  sessionToken,
  ddragonVersion,
  onOpenMatch
}: {
  sessionToken: string;
  ddragonVersion: string;
  onOpenMatch: (matchId: string) => void;
}) {
  const profile = useAsyncData<PlayerProfileOverview>(
    () => fetchMyPlayerProfile(sessionToken),
    [sessionToken]
  );
  const [period, setPeriod] = useState<TrendPeriod>("14");

  const trend = useMemo(() => {
    if (!profile.data) return [];
    const reference = new Date(profile.data.generatedAt).getTime();
    const cutoff = reference - Number(period) * 24 * 60 * 60 * 1000;
    return profile.data.performanceTrend.filter((point) => {
      const timestamp = new Date(point.observedAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= reference;
    });
  }, [period, profile.data]);

  if (profile.status === "loading" || profile.status === "idle") {
    return <ProfileLoading />;
  }

  if (profile.status === "error" || !profile.data) {
    return (
      <PageLayout>
        <Card>
          <ErrorState
            title="Perfil indisponível"
            description={profile.error ?? "A API não retornou o perfil desta sessão."}
          />
        </Card>
      </PageLayout>
    );
  }

  const data = profile.data;
  const noMatches = data.recentPerformance.sampleSize === 0;

  return (
    <PageLayout>
      <ProfileHero profile={data} ddragonVersion={ddragonVersion} />

      {data.status === "STALE" && (
        <ProfileDataNotice>
          <AlertTriangle size={16} aria-hidden="true" />
          Os dados observados estão desatualizados. Os valores permanecem históricos até uma nova
          sincronização legítima.
        </ProfileDataNotice>
      )}
      {data.status === "PARTIAL" && (
        <ProfileDataNotice>
          <Database size={16} aria-hidden="true" />
          Perfil parcial: cada seção informa sua própria cobertura. Cobertura não é nota nem
          confiança.
        </ProfileDataNotice>
      )}

      <PageSection>
        <SectionHeader
          eyebrow="Índices do Sparta"
          title="Resumo de desempenho"
          description="Índices determinísticos sobre as partidas pessoais observadas; não são notas oficiais da Riot nem comparação global."
        />
        <div className="sp-profile-metrics">
          {data.recentPerformance.metrics.map((metric) => (
            <MetricCard key={metric.key} metric={metric} />
          ))}
        </div>
      </PageSection>

      <PageSection>
        <SectionHeader
          eyebrow="Histórico pessoal"
          title="Tendência recente"
          description="Escala fixa de 0 a 100 e intervalos sem partidas não conectados."
          actions={
            <SegmentedControl<TrendPeriod>
              ariaLabel="Período da tendência"
              value={period}
              onChange={setPeriod}
              options={[
                { value: "7", label: "7 dias" },
                { value: "14", label: "14 dias" },
                { value: "30", label: "30 dias" }
              ]}
            />
          }
        />
        <TrendChart points={trend} periodDays={Number(period)} />
      </PageSection>

      <PageSection>
        <SectionHeader
          eyebrow="Experiência observada"
          title="Campeões mais utilizados"
          description="Ordenados por volume pessoal observado; sem meta ou estatística global."
        />
        {data.topChampions.length === 0 ? (
          <Card>
            <EmptyState
              inline
              icon={<Trophy size={21} />}
              title="Nenhum campeão observado"
              description={
                noMatches
                  ? "Sincronize partidas para formar o histórico pessoal."
                  : "As partidas disponíveis não possuem campeão e posição utilizáveis."
              }
            />
          </Card>
        ) : (
          <div className="sp-profile-champions">
            {data.topChampions.slice(0, 6).map((champion) => (
              <ChampionPerformanceCard
                key={`${champion.championId}-${champion.role}`}
                champion={champion}
                ddragonVersion={ddragonVersion}
              />
            ))}
          </div>
        )}
      </PageSection>

      <PageSection>
        <SectionHeader
          eyebrow="Match-V5"
          title="Partidas recentes"
          description="Fatos observados, loadout normalizado e atalhos para o detalhe já existente."
        />
        {data.recentMatches.length === 0 ? (
          <Card>
            <EmptyState
              inline
              icon={<Gamepad2 size={21} />}
              title="Nenhuma partida sincronizada"
              description="O perfil não preenche a ausência com partidas de exemplo."
            />
          </Card>
        ) : (
          <div className="sp-profile-matches">
            {data.recentMatches.map((match) => (
              <RecentMatchRow
                key={match.matchId}
                match={match}
                ddragonVersion={ddragonVersion}
                onOpen={onOpenMatch}
              />
            ))}
          </div>
        )}
      </PageSection>

      <PageSection>
        <SectionHeader
          eyebrow="Evidência"
          title="Pontos fortes e áreas de evolução"
          description="Sinais descritivos com amostra, período, cobertura e versão da regra."
        />
        {data.strengths.length === 0 && data.improvementAreas.length === 0 ? (
          <Card>
            <EmptyState
              inline
              icon={<BarChart3 size={21} />}
              title="Amostra ainda insuficiente para insights"
              description="Nenhum julgamento é produzido sem sinais reais elegíveis."
            />
          </Card>
        ) : (
          <div className="sp-profile-insights">
            {data.strengths.map((insight) => (
              <InsightCard key={`strength-${insight.code}`} insight={insight} tone="positive" />
            ))}
            {data.improvementAreas.map((insight) => (
              <InsightCard key={`improvement-${insight.code}`} insight={insight} tone="attention" />
            ))}
          </div>
        )}
      </PageSection>

      <PageSection>
        <SectionHeader
          eyebrow="Transparência"
          title="Cobertura e proveniência"
          description={`Contrato ${data.algorithmVersion}. Zero observado permanece diferente de ausência.`}
        />
        <div className="sp-profile-coverage">
          {(
            Object.entries(data.coverage) as [
              keyof ProfileCoverage,
              ProfileCoverage[keyof ProfileCoverage]
            ][]
          ).map(([key, item]) => (
            <article className="sp-profile-coverage__item" key={key}>
              <strong>{coverageLabels[key]}</strong>
              <CoverageBadge status={item.status} coverage={item.coverage} reason={item.reason} />
              <span>
                {item.availableSampleSize ?? 0} de {item.sampleSize} · atualização{" "}
                {item.updatedAt ? new Date(item.updatedAt).toLocaleString("pt-BR") : "indisponível"}
              </span>
              {item.reason && <span>{item.reason}</span>}
            </article>
          ))}
        </div>
        <ProfileDataNotice>
          <RefreshCw size={16} aria-hidden="true" />
          Fontes:{" "}
          {data.provenance
            .map((source) => `${source.sourceId ?? source.sourceType} (${source.status})`)
            .join(" · ")}
        </ProfileDataNotice>
      </PageSection>
    </PageLayout>
  );
}

function ProfileLoading() {
  return (
    <PageLayout>
      <Card tone="feature" pad="lg">
        <div
          role="status"
          aria-label="Carregando perfil"
          style={{ display: "grid", gap: "var(--space-5)" }}
        >
          <Skeleton width="42%" height={34} />
          <Skeleton width="68%" height={16} />
          <Skeleton height={84} radius="var(--radius-lg)" />
        </div>
      </Card>
      <div className="sp-profile-metrics">
        <SkeletonRows count={4} />
        <SkeletonRows count={4} />
      </div>
      <Card>
        <Skeleton height={280} radius="var(--radius-lg)" />
      </Card>
    </PageLayout>
  );
}
