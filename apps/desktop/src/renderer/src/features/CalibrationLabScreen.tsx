import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  AlertTriangle,
  ArrowRight,
  FlaskConical,
  History,
  Lock,
  Play,
  Rocket,
  RotateCcw,
  ShieldCheck
} from "lucide-react";
import {
  activateRelease,
  createCalibrationCandidate,
  createCalibrationRevision,
  createRelease,
  decideCalibrationCandidate,
  fetchActiveRelease,
  fetchCalibrationExperimentCases,
  fetchCalibrationParameters,
  listCalibrationCandidates,
  listCalibrationExperiments,
  listReleases,
  rollbackRelease,
  runCalibrationExperiment,
  validateCalibrationCandidateRemote,
  validateRelease,
  type ActiveReleaseResponse,
  type CalibrationCandidateInput,
  type CalibrationCandidateRow,
  type CalibrationCaseComparison,
  type CalibrationExperimentRow,
  type CalibrationParameterCatalog,
  type CalibrationRankingEntry,
  type CalibrationValidationResult,
  type EffectiveConfigurationView,
  type ReleaseRow
} from "../services/api-client";
import { useAsyncData } from "../hooks/use-async-data";
import { ReplayCapabilitySummary } from "./ReplayCapabilitySummary";
import { Button } from "../ui/Button";
import { Card, SectionHeader } from "../ui/Card";
import { EmptyState, ErrorState, Loading } from "../ui/States";
import { Field, NumberField, TextField } from "../ui/Field";
import { HashChip } from "../ui/HashChip";
import { Grid, PageLayout, PageSection } from "../ui/PageLayout";
import { SignalChip, SignalChipList } from "../ui/SignalChip";
import { Badge, StatusBadge } from "../ui/Badge";
import "./CalibrationLabScreen.css";

/**
 * Laboratorio do motor (Etapa 25b).
 *
 * A tela nao calcula nada: score, ranking e agregados vem prontos do servidor.
 * Ela tambem nao ativa configuracao nenhuma - aprovar aqui e registro
 * documental, e o texto da propria tela diz isso.
 *
 * O resultado da partida **nao e exibido**: o detalhe do caso mostra apenas
 * ranking historico, ranking candidato e as diferencas entre os dois.
 */

const DEFAULT_WEIGHTS: Record<string, number> = {
  PERSONAL_PERFORMANCE: 0.25,
  RECENT_FORM: 0.15,
  PERSONAL_MATCHUP: 0.1,
  BLIND_SAFETY: 0.1,
  ALLY_SYNERGY: 0.1,
  ENEMY_COMPOSITION_ANSWER: 0.1,
  TEAM_COMPOSITION: 0.2
};

const METRIC_LABELS: Record<string, string> = {
  PERSONAL_PERFORMANCE: "Desempenho pessoal",
  RECENT_FORM: "Forma recente",
  PERSONAL_MATCHUP: "Matchup pessoal",
  BLIND_SAFETY: "Segurança em blind",
  ALLY_SYNERGY: "Sinergia com o time",
  ENEMY_COMPOSITION_ANSWER: "Resposta ao draft inimigo",
  TEAM_COMPOSITION: "Encaixe de composição",
  META_STRENGTH: "Força no meta"
};

const ROLE_OPTIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;

/**
 * Estado de release cru → rótulo em pt-BR. `status === "ACTIVE"` não significa
 * "é a ativa agora" (Etapa 27b: uma release superada continua com esse status
 * até ser revertida) - por isso o rótulo de `ACTIVE` é resolvido à parte, via
 * `releaseStatusLabel`, que também confere `currentlyActive`.
 */
const RELEASE_STATUS_LABELS: Record<Exclude<ReleaseRow["status"], "ACTIVE">, string> = {
  DRAFT: "Rascunho",
  VALIDATING: "Validando",
  VALIDATION_FAILED: "Validação falhou",
  READY_FOR_ACTIVATION: "Pronta para ativação",
  ROLLED_BACK: "Revertida",
  REJECTED: "Rejeitada"
};

/**
 * O badge "ATIVA" ao lado já comunica quando `currentlyActive` é verdadeiro -
 * mostrar "Ativa (não é a atual)" nesse caso seria contradizer o próprio
 * badge. Sem o ponteiro, `ACTIVE` é sempre uma release superada.
 */
function releaseStatusLabel(release: ReleaseRow): string {
  if (release.status === "ACTIVE") {
    return release.currentlyActive ? "Ativa" : "Ativa (não é a atual)";
  }
  return RELEASE_STATUS_LABELS[release.status];
}

const EXCLUSION_REASON_LABELS: Record<string, string> = {
  UNSUPPORTED_PARAMETER: "Parâmetro fora do que pode ser reproduzido historicamente",
  MISSING_HISTORICAL_INPUT: "Histórico necessário não preservado no snapshot",
  UNSUPPORTED_ALGORITHM_VERSION: "Versão do motor não suportada pelo replay",
  INVALID_BUNDLE: "Bundle de replay inválido"
};

/**
 * Deltas entre a configuração base e a candidata - só o que de fato mudou
 * (Etapa 31I, §10). Pesos iguais nas duas ficam de fora, não aparecem como
 * "0.20 → 0.20".
 */
function computeWeightDeltas(
  base: Record<string, number> | null,
  candidate: Record<string, number>
): { metric: string; from: number | null; to: number }[] {
  const keys = new Set([...Object.keys(base ?? {}), ...Object.keys(candidate)]);
  const deltas: { metric: string; from: number | null; to: number }[] = [];
  for (const metric of keys) {
    const from = base?.[metric] ?? null;
    const to = candidate[metric] ?? 0;
    if (from !== to) deltas.push({ metric, from, to });
  }
  return deltas;
}

interface Props {
  token: string;
}

export function CalibrationLabScreen({ token }: Props): ReactElement {
  const catalog = useAsyncData<CalibrationParameterCatalog>(
    () => fetchCalibrationParameters(token),
    [token]
  );

  const [name, setName] = useState("Composição mais pesada");
  const [weights, setWeights] = useState<Record<string, number>>({ ...DEFAULT_WEIGHTS });
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [validation, setValidation] = useState<CalibrationValidationResult | null>(null);
  const [candidates, setCandidates] = useState<CalibrationCandidateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<CalibrationExperimentRow[]>([]);
  const [cases, setCases] = useState<CalibrationCaseComparison[]>([]);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<ActiveReleaseResponse | null>(null);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [releaseVersion, setReleaseVersion] = useState("release-1");
  const [confirming, setConfirming] = useState<{ releaseId: string; action: "activate" | "rollback" } | null>(null);

  const candidateInput = useMemo<CalibrationCandidateInput>(
    () => ({
      name,
      baselineAggregationVersion: "1.0.0",
      candidateVersion: "1.0.0",
      metricWeights: weights,
      ...(Object.keys(thresholds).length ? { postAggregationThresholds: thresholds } : {}),
      status: "READY"
    }),
    [name, weights, thresholds]
  );

  const refreshCandidates = useCallback(async () => {
    const result = await listCalibrationCandidates(token);
    setCandidates(result.candidates);
  }, [token]);

  const refreshReleases = useCallback(async () => {
    const [active, list] = await Promise.all([fetchActiveRelease(token), listReleases(token)]);
    setActiveConfig(active);
    setReleases(list.releases);
  }, [token]);

  useEffect(() => {
    void refreshCandidates();
  }, [refreshCandidates]);

  useEffect(() => {
    void refreshReleases();
  }, [refreshReleases]);

  useEffect(() => {
    let cancelled = false;
    void validateCalibrationCandidateRemote(token, candidateInput)
      .then((result) => {
        if (!cancelled) setValidation(result);
      })
      .catch(() => {
        if (!cancelled) setValidation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, candidateInput]);

  const selected = candidates.find((entry) => entry.id === selectedId) ?? null;
  const latestExperiment = experiments[0] ?? null;
  const report = latestExperiment?.report ?? null;

  // Comparação base × candidata (Etapa 31I, §10) - só existe uma "base" única
  // pra comparar quando há release ativa; a baseline embutida varia por
  // cenário do draft (blind/lane revelada/meio do draft), então comparar
  // contra "a" baseline fingiria uma configuração única que não existe.
  const baseWeights =
    activeConfig?.source === "RELEASE" && activeConfig.release
      ? activeConfig.release.artifact.configuration.metricWeights
      : null;
  const weightDeltas = useMemo(() => computeWeightDeltas(baseWeights, weights), [baseWeights, weights]);

  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Operação falhou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageLayout>
      <PageSection>
        <Card tone="inset">
          <SectionHeader
            eyebrow={
              <>
                <History size={12} /> Ambiente histórico / não operacional
              </>
            }
            title="Laboratório do motor"
            description="Testa uma configuração candidata contra os drafts já registrados, sem tocar no motor em uso."
          />
          <SignalChipList stacked>
            <SignalChip tone="info">
              Nada aqui altera automaticamente a produção - experimentos são registros históricos.
            </SignalChip>
            <SignalChip tone="info">
              Métricas usadas são congeladas no instante do snapshot original, nunca recalculadas com dado atual.
            </SignalChip>
            <SignalChip tone="info">
              Ativar uma configuração exige o fluxo de release abaixo, em etapas separadas e confirmadas.
            </SignalChip>
          </SignalChipList>
        </Card>
      </PageSection>

      <PageSection>
        <Card>
          <SectionHeader
            title="Configuração operacional atual"
            description="O que o motor realmente usa agora para gerar recomendações — só leitura, nunca editável aqui."
          />
          {activeConfig?.source === "RELEASE" && activeConfig.release ? (
            <>
              <div className="sp-calib-config-row">
                <Badge tone="positive">ATIVA</Badge>
                <ShieldCheck size={14} aria-hidden />
                <span>
                  {activeConfig.release.releaseVersion} · candidata {activeConfig.release.candidateVersion}
                </span>
                <HashChip label="config" value={activeConfig.release.configHash} />
                <HashChip label="artefato" value={activeConfig.release.artifactHash} />
                {latestExperiment && activeConfig.release.experimentId === latestExperiment.id ? (
                  <span className="sp-calib-lineage">
                    <ArrowRight size={12} aria-hidden /> originada do experimento aberto abaixo
                  </span>
                ) : null}
              </div>
              <div className="sp-calib-weights">
                {Object.entries(activeConfig.release.artifact.configuration.metricWeights).map(([metric, value]) => (
                  <Metric key={metric} label={METRIC_LABELS[metric] ?? metric} value={value} />
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="sp-calib-note">
                Fallback para baseline em uso — nenhuma release está ativa. A baseline varia por
                cenário do draft; as três tabelas reais abaixo mostram cada uma.
              </p>
              <div className="sp-calib-side-by-side">
                {(activeConfig?.scenarios ?? []).map((scenario) => (
                  <div key={scenario.label}>
                    <h4>{scenario.label}</h4>
                    <BaselineWeights configuration={scenario.configuration} />
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </PageSection>

      <PageSection>
        <Card>
          <SectionHeader
            title="Configuração candidata"
            description="Só pesos sobre sinais congelados e regras aplicadas depois da agregação."
          />
          <Field label="Nome">
            <TextField value={name} onChange={setName} />
          </Field>

          {baseWeights ? (
            <div className="sp-calib-delta-block">
              <SectionHeader
                title="Diferença contra a release ativa"
                description="Só os pesos que de fato mudaram - iguais nas duas ficam de fora."
              />
              {weightDeltas.length === 0 ? (
                <p className="sp-calib-note">Nenhuma diferença: os pesos batem com a release ativa.</p>
              ) : (
                <ul className="sp-calib-delta-list">
                  {weightDeltas.map((delta) => (
                    <li key={delta.metric}>
                      <span>{METRIC_LABELS[delta.metric] ?? delta.metric}</span>
                      <span className="sp-calib-delta-value">
                        {delta.from === null ? "—" : delta.from.toFixed(2)}
                        <ArrowRight size={12} aria-hidden />
                        {delta.to.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="sp-calib-weights">
            {Object.keys(DEFAULT_WEIGHTS).map((metric) => (
              <Field key={metric} label={METRIC_LABELS[metric] ?? metric}>
                <NumberField
                  value={weights[metric] ?? 0}
                  min={0}
                  max={1}
                  ariaLabel={METRIC_LABELS[metric] ?? metric}
                  onChange={(value) => setWeights((current) => ({ ...current, [metric]: value }))}
                />
              </Field>
            ))}
          </div>

          <SectionHeader
            title="Regras pós-agregação"
            description="Aplicadas depois das métricas congeladas; não mudam como nenhuma métrica é produzida."
          />
          <div className="sp-calib-weights">
            <Field label="primaryCount" hint="Quantos candidatos formam o grupo principal.">
              <NumberField
                value={thresholds.primaryCount ?? 5}
                min={1}
                max={20}
                ariaLabel="primaryCount"
                onChange={(value) =>
                  setThresholds((current) => ({ ...current, primaryCount: value }))
                }
              />
            </Field>
            <Field label="alternativeCount" hint="Quantos formam o grupo alternativo.">
              <NumberField
                value={thresholds.alternativeCount ?? 3}
                min={0}
                max={20}
                ariaLabel="alternativeCount"
                onChange={(value) =>
                  setThresholds((current) => ({ ...current, alternativeCount: value }))
                }
              />
            </Field>
          </div>

          {validation ? (
            <div className="sp-calib-validation">
              {validation.valid ? (
                <SignalChip tone="positive">Configuração reproduzível</SignalChip>
              ) : (
                validation.rejections.map((rejection) => (
                  <SignalChip key={`${rejection.parameter}-${rejection.code}`} tone="negative">
                    {`${rejection.parameter}: ${rejection.reason}`}
                  </SignalChip>
                ))
              )}
            </div>
          ) : null}

          <div className="sp-calib-actions">
            <Button
              disabled={busy || validation?.valid !== true}
              onClick={() =>
                withBusy(async () => {
                  const created = selected
                    ? await createCalibrationRevision(token, selected.id, candidateInput)
                    : await createCalibrationCandidate(token, candidateInput);
                  await refreshCandidates();
                  setSelectedId(created.id);
                  setFeedback(`Revisão ${created.revision} salva.`);
                })
              }
            >
              {selected ? "Salvar como nova revisão" : "Salvar configuração"}
            </Button>
          </div>
        </Card>
      </PageSection>

      <PageSection>
        <Card>
          <SectionHeader
            title="Parâmetros bloqueados"
            description="Dependem de dado histórico que o snapshot não preserva, ou não são avaliáveis."
          />
          {catalog.status === "loading" ? <Loading label="Carregando registro" /> : null}
          {catalog.status === "error" ? <ErrorState description="Registro indisponível." /> : null}
          <ul className="sp-calib-blocked">
            {(catalog.data?.registry ?? [])
              .filter((entry) => entry.capability !== "EXACT_REWEIGHT" && entry.capability !== "EXACT_POST_AGGREGATION")
              .map((entry) => (
                <li key={entry.parameter}>
                  <Lock size={14} aria-hidden />
                  <div>
                    <strong>{entry.parameter}</strong>
                    <span>{entry.description}</span>
                    {entry.missingHistoricalInputs?.length ? (
                      <em>Falta: {entry.missingHistoricalInputs.join("; ")}</em>
                    ) : null}
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      </PageSection>

      <PageSection>
        <Card>
          <SectionHeader title="Configurações salvas" />
          {candidates.length === 0 ? (
            <EmptyState
              title="Nenhuma configuração salva"
              description="Ajuste os pesos acima e salve para poder executar um experimento."
            />
          ) : (
            <ul className="sp-calib-list">
              {candidates.map((entry) => (
                <li key={entry.id} className="sp-calib-list__row">
                  <button
                    type="button"
                    className={entry.id === selectedId ? "is-selected" : ""}
                    onClick={() =>
                      withBusy(async () => {
                        setSelectedId(entry.id);
                        setCases([]);
                        const result = await listCalibrationExperiments(token, entry.id);
                        setExperiments(result.experiments);
                      })
                    }
                  >
                    <span>
                      {entry.name} · rev {entry.revision}
                    </span>
                    <StatusBadge state="offline">{entry.status}</StatusBadge>
                  </button>
                  {/* Fora do <button> de seleção - HashChip tem botões próprios
                      (expandir/copiar), e HTML não permite <button> aninhado. */}
                  <HashChip value={entry.configHash} />
                </li>
              ))}
            </ul>
          )}

          <div className="sp-calib-actions">
            <div className="sp-calib-roles">
              {ROLE_OPTIONS.map((role) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={roles.includes(role)}
                    onChange={() =>
                      setRoles((current) =>
                        current.includes(role)
                          ? current.filter((entry) => entry !== role)
                          : [...current, role]
                      )
                    }
                  />
                  {role}
                </label>
              ))}
            </div>
            <Button
              disabled={busy || !selected}
              onClick={() =>
                withBusy(async () => {
                  if (!selected) return;
                  const result = await runCalibrationExperiment(token, selected.id, {
                    ...(roles.length ? { roles } : {})
                  });
                  const list = await listCalibrationExperiments(token, selected.id);
                  // O experimento devolvido pela execução pode pertencer a outra
                  // configuração funcionalmente idêntica (mesmo `inputHash`), e
                  // nesse caso não aparece na lista filtrada por esta. Ele vem
                  // na frente para o resumo sempre mostrar o que acabou de rodar.
                  setExperiments([
                    result.experiment,
                    ...list.experiments.filter((entry) => entry.id !== result.experiment.id)
                  ]);
                  setFeedback(
                    result.reused
                      ? "Mesmo input funcional: experimento existente reaproveitado."
                      : "Experimento concluído."
                  );
                })
              }
            >
              <Play size={14} aria-hidden /> Executar experimento
            </Button>
          </div>
          {feedback ? <p className="sp-calib-feedback">{feedback}</p> : null}
        </Card>
      </PageSection>

      {latestExperiment ? (
        <PageSection>
          <Card>
            <SectionHeader
              title="Resumo do experimento"
              description="Deslocamento e estabilidade da ordenação. Não é medida de qualidade nem de melhoria."
            />
            <Grid cols={4}>
              <Metric label="Casos totais" value={latestExperiment.totalCases} />
              <Metric label="Replays exatos" value={latestExperiment.exactReplayCases} />
              <Metric label="Falhas de integridade" value={latestExperiment.integrityFailedCases} />
              <Metric label="Versão não suportada" value={latestExperiment.unsupportedCases} />
              <Metric label="Input histórico ausente" value={latestExperiment.missingInputCases} />
              <Metric label="Excluídos" value={latestExperiment.excludedCases} />
              <Metric label="Top 1 preservado" value={num(report?.topOnePreservedCases)} />
              <Metric label="Sobreposição top 5" value={num(report?.averageTopFiveOverlap)} />
              <Metric label="Deslocamento médio" value={num(report?.averageRankDisplacement)} />
              <Metric label="Deslocamento mediano" value={num(report?.medianRankDisplacement)} />
              <Metric label="Entraram no principal" value={num(report?.totalEnteredPrimary)} />
              <Metric label="Saíram do principal" value={num(report?.totalLeftPrimary)} />
            </Grid>

            <SectionHeader title="Segmentos" />
            <ul className="sp-calib-segments">
              {(report?.segments ?? []).map((segment, index) => (
                <li key={`${segment.dimension}-${segment.value}-${index}`}>
                  <strong>
                    {segment.dimension}: {segment.value}
                  </strong>
                  <span>
                    {segment.cases} caso(s) · top 1 preservado {segment.topOnePreservedCases} · deslocamento{" "}
                    {segment.averageRankDisplacement ?? "—"}
                  </span>
                </li>
              ))}
            </ul>

            <SectionHeader
              title="Cobertura"
              description="Quantos casos foram de fato reavaliados - exclusão não é falha do modelo."
            />
            {report ? (
              <>
                <Grid cols={4}>
                  <Metric label="Total" value={report.totalCases} />
                  <Metric label="Reavaliados" value={report.replayedCases} />
                  <Metric label="Excluídos" value={report.excludedCases} />
                  <Metric label="Não reproduzíveis" value={report.nonReproducibleCases} />
                </Grid>
                {report.exclusions.length > 0 ? (
                  <ul className="sp-calib-segments">
                    {report.exclusions.map((exclusion) => (
                      <li key={exclusion.code}>
                        <strong>{EXCLUSION_REASON_LABELS[exclusion.code] ?? exclusion.code}</strong>
                        <span>
                          {exclusion.cases} caso(s)
                          {exclusion.missingHistoricalInputs.length
                            ? ` · falta: ${exclusion.missingHistoricalInputs.join(", ")}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}

            <SectionHeader
              title="Integridade temporal"
              description="Nenhum caso usa dado posterior ao instante do próprio snapshot histórico."
            />
            <SignalChip tone="info">
              Cada caso é reavaliado só com o que o `ReplayInputBundle` daquele snapshot preservou -
              histórico posterior ao momento do draft nunca entra na reavaliação, por construção.
            </SignalChip>

            <SectionHeader title="Revisões humanas pré-resultado" />
            <p className="sp-calib-note">
              Contagens de avaliação feita antes de o resultado ser revelado. A avaliação
              pós-resultado não é carregada por este fluxo.
            </p>
            {report ? (
              <Grid cols={4}>
                <Metric label="Casos com revisão" value={report.humanReview.casesWithReview} />
                <Metric label="Casos sem revisão" value={report.humanReview.casesWithoutReview} />
                <Metric label="Fortes preservados" value={report.humanReview.strongCasesPreserved} />
                <Metric label="Fortes alterados" value={report.humanReview.strongCasesAltered} />
                <Metric label="Fracos preservados" value={report.humanReview.weakCasesPreserved} />
                <Metric label="Fracos alterados" value={report.humanReview.weakCasesAltered} />
              </Grid>
            ) : null}
            {report && report.humanReview.issueTagsAffected.length > 0 ? (
              <ul className="sp-calib-segments">
                {report.humanReview.issueTagsAffected.map((tag) => (
                  <li key={tag.tag}>
                    <strong>{tag.tag}</strong>
                    <span>
                      {tag.casesAltered} de {tag.casesTotal} caso(s) com esta tag mudaram de resultado
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="sp-calib-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    const page = await fetchCalibrationExperimentCases(token, latestExperiment.id, {
                      limit: 20
                    });
                    setCases(page.cases);
                  })
                }
              >
                Abrir casos ({latestExperiment.totalCases})
              </Button>
            </div>
          </Card>
        </PageSection>
      ) : null}

      {cases.length > 0 ? (
        <PageSection>
          <Card>
            <SectionHeader
              title="Casos"
              description="Histórico e candidato lado a lado. O resultado da partida não é exibido."
            />
            <ul className="sp-calib-cases">
              {cases.map((entry) => {
                const id = entry.snapshotId;
                const open = openCaseId === id;
                return (
                  <li key={id}>
                    <button type="button" onClick={() => setOpenCaseId(open ? null : id)}>
                      <span>{entry.role}</span>
                      <StatusBadge state={entry.replayStatus === "EXACT_REPLAY" ? "live" : "warning"}>
                        {entry.replayStatus}
                      </StatusBadge>
                    </button>
                    {open ? <CaseDetail comparison={entry} token={token} /> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </PageSection>
      ) : null}

      {selected && latestExperiment?.status === "COMPLETED" ? (
        <PageSection>
          <Card>
            <SectionHeader
              title="Decisão"
              description="Aprovar registra revisão humana. Não ativa a configuração nem altera peso nenhum."
            />
            <p className="sp-calib-note">
              <AlertTriangle size={14} aria-hidden /> `APPROVED_FOR_FUTURE_RELEASE` é o estado
              máximo: a ativação é uma etapa separada, fora deste laboratório.
            </p>
            <div className="sp-calib-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    await decideCalibrationCandidate(token, selected.id, "reject", {
                      experimentId: latestExperiment.id
                    });
                    await refreshCandidates();
                    setFeedback("Configuração rejeitada.");
                  })
                }
              >
                Rejeitar
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  withBusy(async () => {
                    const result = await decideCalibrationCandidate(
                      token,
                      selected.id,
                      "approve-for-future-release",
                      { experimentId: latestExperiment.id }
                    );
                    await refreshCandidates();
                    setFeedback(
                      `Aprovada para versão futura. Ativação: ${result.activation ?? "NOT_ACTIVATED"}.`
                    );
                  })
                }
              >
                <FlaskConical size={14} aria-hidden /> Aprovar para versão futura
              </Button>
            </div>
          </Card>
        </PageSection>
      ) : null}

      {selected?.status === "APPROVED_FOR_FUTURE_RELEASE" ? (
        <PageSection>
          <Card>
            <SectionHeader
              title="Preparar release"
              description="Aprovação não significa ativação. Congela o artefato (candidata + experimento + configuração), pronto para validar."
            />
            <Field label="Versão da release">
              <TextField value={releaseVersion} onChange={setReleaseVersion} />
            </Field>
            <div className="sp-calib-actions">
              <Button
                disabled={busy || !releaseVersion.trim()}
                onClick={() =>
                  withBusy(async () => {
                    await createRelease(token, selected.id, releaseVersion.trim());
                    await refreshReleases();
                    setFeedback("Release criada em DRAFT. Valide antes de ativar.");
                  })
                }
              >
                Criar release
              </Button>
            </div>
          </Card>
        </PageSection>
      ) : null}

      <PageSection>
        <Card>
          <SectionHeader
            title="Releases"
            description="Ciclo de vida completo: DRAFT → VALIDATING → READY_FOR_ACTIVATION → ACTIVE → ROLLED_BACK. Nenhum peso é editável aqui."
          />
          {releases.length === 0 ? (
            <EmptyState
              title="Nenhuma release preparada"
              description="Aprove uma configuração para versão futura e prepare uma release acima."
            />
          ) : (
            <ul className="sp-calib-list">
              {releases.map((release) => (
                <li key={release.id}>
                  <div className="sp-calib-release-row">
                    {release.currentlyActive ? <Badge tone="positive">ATIVA</Badge> : null}
                    <span>
                      {release.releaseVersion} · candidata {release.candidateVersion}
                    </span>
                    <HashChip label="config" value={release.configHash} />
                    <HashChip label="artefato" value={release.artifactHash} />
                    <StatusBadge state={release.currentlyActive ? "live" : "offline"}>
                      {releaseStatusLabel(release)}
                    </StatusBadge>
                    {latestExperiment && release.experimentId === latestExperiment.id ? (
                      <span className="sp-calib-lineage">
                        <ArrowRight size={12} aria-hidden /> do experimento aberto acima
                      </span>
                    ) : null}
                  </div>
                  {release.validation && release.status === "VALIDATION_FAILED" ? (
                    <p className="sp-calib-note">
                      <AlertTriangle size={14} aria-hidden /> {release.validation.reason}
                    </p>
                  ) : null}
                  {release.status === "ROLLED_BACK" ? (
                    <p className="sp-calib-note">Release revertida em {release.rolledBackAt ?? "—"}.</p>
                  ) : null}
                  <div className="sp-calib-actions">
                    {release.status === "DRAFT" || release.status === "VALIDATION_FAILED" ? (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          withBusy(async () => {
                            const result = await validateRelease(token, release.id);
                            await refreshReleases();
                            setFeedback(`Validação: ${result.validation?.status ?? "desconhecida"}.`);
                          })
                        }
                      >
                        Validar
                      </Button>
                    ) : null}

                    {release.status === "READY_FOR_ACTIVATION" &&
                    confirming?.releaseId === release.id &&
                    confirming.action === "activate" ? (
                      <>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            withBusy(async () => {
                              await activateRelease(token, release.id);
                              setConfirming(null);
                              await refreshReleases();
                              setFeedback("Release ativa.");
                            })
                          }
                        >
                          Confirmar ativação
                        </Button>
                        <Button variant="secondary" disabled={busy} onClick={() => setConfirming(null)}>
                          Cancelar
                        </Button>
                      </>
                    ) : null}
                    {release.status === "READY_FOR_ACTIVATION" &&
                    !(confirming?.releaseId === release.id && confirming.action === "activate") ? (
                      <Button
                        disabled={busy}
                        onClick={() => setConfirming({ releaseId: release.id, action: "activate" })}
                      >
                        <Rocket size={14} aria-hidden /> Ativar
                      </Button>
                    ) : null}

                    {release.currentlyActive &&
                    confirming?.releaseId === release.id &&
                    confirming.action === "rollback" ? (
                      <>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            withBusy(async () => {
                              await rollbackRelease(token, release.id);
                              setConfirming(null);
                              await refreshReleases();
                              setFeedback("Release revertida para a configuração anterior.");
                            })
                          }
                        >
                          Confirmar rollback
                        </Button>
                        <Button variant="secondary" disabled={busy} onClick={() => setConfirming(null)}>
                          Cancelar
                        </Button>
                      </>
                    ) : null}
                    {release.currentlyActive &&
                    !(confirming?.releaseId === release.id && confirming.action === "rollback") ? (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setConfirming({ releaseId: release.id, action: "rollback" })}
                      >
                        <RotateCcw size={14} aria-hidden /> Reverter
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageSection>
    </PageLayout>
  );
}

function BaselineWeights({ configuration }: { configuration: EffectiveConfigurationView }): ReactElement {
  return (
    <ul className="sp-calib-ranking">
      {Object.entries(configuration.metricWeights)
        .filter(([, value]) => value > 0)
        .map(([metric, value]) => (
          <li key={metric}>
            <span>{METRIC_LABELS[metric] ?? metric}</span>
            <span>{value}</span>
          </li>
        ))}
    </ul>
  );
}

function Metric({ label, value }: { label: string; value: number | string }): ReactElement {
  return (
    <div className="sp-calib-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function num(value: unknown): string {
  return typeof value === "number" ? String(value) : "—";
}

function CaseDetail({
  comparison,
  token
}: {
  comparison: CalibrationCaseComparison;
  token: string;
}): ReactElement {
  const { candidate, snapshotId } = comparison;

  if (!candidate) {
    return (
      <div className="sp-calib-case-detail">
        <p className="sp-calib-note">Caso fora da comparação: {comparison.replayStatus}.</p>
        {comparison.exclusionReasons.length > 0 ? (
          <ul className="sp-calib-segments">
            {comparison.exclusionReasons.map((reason) => (
              <li key={reason.code}>
                <strong>{EXCLUSION_REASON_LABELS[reason.code] ?? reason.code}</strong>
                {reason.missingHistoricalInputs.length ? (
                  <span>Falta: {reason.missingHistoricalInputs.join(", ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div style={{ marginTop: "var(--space-3)" }}>
          <ReplayCapabilitySummary token={token} snapshotId={snapshotId} />
        </div>
      </div>
    );
  }

  return (
    <div className="sp-calib-case-detail">
      <div style={{ marginBottom: "var(--space-3)" }}>
        <ReplayCapabilitySummary token={token} snapshotId={snapshotId} />
      </div>
      <div className="sp-calib-side-by-side">
        <div>
          <h4>Histórico</h4>
          <RankingList entries={comparison.baseline.entries} />
        </div>
        <div>
          <h4>Candidato</h4>
          <RankingList entries={candidate.entries} />
        </div>
      </div>
      <h4>Diferenças</h4>
      <ul className="sp-calib-diff">
        <li>Promovidos: {list(comparison.promotedChampionIds)}</li>
        <li>Rebaixados: {list(comparison.demotedChampionIds)}</li>
        <li>Entraram no principal: {list(comparison.enteredPrimaryChampionIds)}</li>
        <li>Saíram do principal: {list(comparison.leftPrimaryChampionIds)}</li>
        <li>Integridade do replay: {comparison.replayStatus}</li>
      </ul>
      <h4>Componentes que explicam a alteração</h4>
      <div className="sp-calib-table-wrap">
        <table className="sp-calib-table">
          <thead>
            <tr>
              <th scope="col">Campeão</th>
              <th scope="col">Score histórico</th>
              <th scope="col">Score reconstruído</th>
              <th scope="col">Score candidato</th>
              <th scope="col">Cobertura histórica</th>
              <th scope="col">Cobertura candidata</th>
              <th scope="col">Motivos da diferença</th>
            </tr>
          </thead>
          <tbody>
            {comparison.candidates.map((entry) => (
              <tr key={entry.championId}>
                <td>{entry.championName}</td>
                <td>{entry.baselineScore.toFixed(1)}</td>
                <td>{entry.reconstructedScore.toFixed(1)}</td>
                <td>{entry.candidateScore.toFixed(1)}</td>
                <td>{(entry.baselineDataCoverage * 100).toFixed(0)}%</td>
                <td>{(entry.candidateDataCoverage * 100).toFixed(0)}%</td>
                <td>{entry.differenceReasons.length ? entry.differenceReasons.join("; ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankingList({ entries }: { entries: CalibrationRankingEntry[] }): ReactElement {
  return (
    <ol className="sp-calib-ranking">
      {entries.map((entry) => (
        <li key={entry.championId}>
          <span>{entry.championName}</span>
          <span>{entry.score}</span>
          <StatusBadge state="offline">{entry.group}</StatusBadge>
        </li>
      ))}
    </ol>
  );
}

function list(value: unknown): string {
  return Array.isArray(value) && value.length > 0 ? value.join(", ") : "—";
}
