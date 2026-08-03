import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { AlertTriangle, FlaskConical, Lock, Play, Rocket, RotateCcw, ShieldCheck } from "lucide-react";
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
  type CalibrationExperimentRow,
  type CalibrationParameterCatalog,
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
import { Grid, PageLayout, PageSection } from "../ui/PageLayout";
import { SignalChip } from "../ui/SignalChip";
import { StatusBadge } from "../ui/Badge";
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
  const [cases, setCases] = useState<Record<string, unknown>[]>([]);
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
  const report = (latestExperiment?.report ?? null) as Record<string, unknown> | null;

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
        <Card>
          <SectionHeader
            title="Laboratório do motor"
            description="Testa uma configuração candidata contra os drafts já registrados, sem tocar no motor em uso."
          />
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
              <p className="sp-calib-note">
                <ShieldCheck size={14} aria-hidden /> Release ativa: {activeConfig.release.releaseVersion} ·
                candidata {activeConfig.release.candidateVersion} · hash {activeConfig.release.configHash.slice(0, 12)}…
              </p>
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
                <li key={entry.id}>
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
              {((report?.segments ?? []) as Record<string, unknown>[]).map((segment, index) => (
                <li key={`${String(segment.dimension)}-${String(segment.value)}-${index}`}>
                  <strong>
                    {String(segment.dimension)}: {String(segment.value)}
                  </strong>
                  <span>
                    {String(segment.cases)} caso(s) · top 1 preservado{" "}
                    {String(segment.topOnePreservedCases)} · deslocamento{" "}
                    {String(segment.averageRankDisplacement)}
                  </span>
                </li>
              ))}
            </ul>

            <SectionHeader title="Revisões humanas pré-resultado" />
            <p className="sp-calib-note">
              Contagens de avaliação feita antes de o resultado ser revelado. A avaliação
              pós-resultado não é carregada por este fluxo.
            </p>
            <pre className="sp-calib-raw">
              {JSON.stringify(report?.humanReview ?? {}, null, 2)}
            </pre>

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
                const id = String(entry.snapshotId);
                const open = openCaseId === id;
                return (
                  <li key={id}>
                    <button type="button" onClick={() => setOpenCaseId(open ? null : id)}>
                      <span>{String(entry.role)}</span>
                      <StatusBadge
                        state={entry.replayStatus === "EXACT_REPLAY" ? "live" : "warning"}
                      >
                        {String(entry.replayStatus)}
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
                    <span>
                      {release.releaseVersion} · candidata {release.candidateVersion}
                      {release.currentlyActive ? " · Release ativa" : ""}
                    </span>
                    <StatusBadge state={release.status === "ACTIVE" ? "live" : "offline"}>
                      {release.status === "READY_FOR_ACTIVATION" ? "Release pronta para ativação" : release.status}
                    </StatusBadge>
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
  comparison: Record<string, unknown>;
  token: string;
}): ReactElement {
  const baseline = (comparison.baseline ?? {}) as { entries?: Record<string, unknown>[] };
  const candidate = (comparison.candidate ?? null) as { entries?: Record<string, unknown>[] } | null;
  const snapshotId = comparison.snapshotId ? String(comparison.snapshotId) : null;

  if (!candidate) {
    return (
      <div className="sp-calib-case-detail">
        <p className="sp-calib-note">
          Caso fora da comparação: {String(comparison.replayStatus)}.
        </p>
        <pre className="sp-calib-raw">
          {JSON.stringify(comparison.exclusionReasons ?? [], null, 2)}
        </pre>
        {snapshotId && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <ReplayCapabilitySummary token={token} snapshotId={snapshotId} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sp-calib-case-detail">
      {snapshotId && (
        <div style={{ marginBottom: "var(--space-3)" }}>
          <ReplayCapabilitySummary token={token} snapshotId={snapshotId} />
        </div>
      )}
      <div className="sp-calib-side-by-side">
        <div>
          <h4>Histórico</h4>
          <RankingList entries={baseline.entries ?? []} />
        </div>
        <div>
          <h4>Candidato</h4>
          <RankingList entries={candidate.entries ?? []} />
        </div>
      </div>
      <h4>Diferenças</h4>
      <ul className="sp-calib-diff">
        <li>Promovidos: {list(comparison.promotedChampionIds)}</li>
        <li>Rebaixados: {list(comparison.demotedChampionIds)}</li>
        <li>Entraram no principal: {list(comparison.enteredPrimaryChampionIds)}</li>
        <li>Saíram do principal: {list(comparison.leftPrimaryChampionIds)}</li>
        <li>Integridade do replay: {String(comparison.replayStatus)}</li>
      </ul>
      <h4>Componentes que explicam a alteração</h4>
      <pre className="sp-calib-raw">
        {JSON.stringify(
          ((comparison.candidates ?? []) as Record<string, unknown>[]).map((entry) => ({
            championName: entry.championName,
            baselineScore: entry.baselineScore,
            reconstructedScore: entry.reconstructedScore,
            candidateScore: entry.candidateScore,
            baselineDataCoverage: entry.baselineDataCoverage,
            candidateDataCoverage: entry.candidateDataCoverage,
            differenceReasons: entry.differenceReasons
          })),
          null,
          2
        )}
      </pre>
    </div>
  );
}

function RankingList({ entries }: { entries: Record<string, unknown>[] }): ReactElement {
  return (
    <ol className="sp-calib-ranking">
      {entries.map((entry) => (
        <li key={String(entry.championId)}>
          <span>{String(entry.championName)}</span>
          <span>{String(entry.score)}</span>
          <StatusBadge state="offline">{String(entry.group)}</StatusBadge>
        </li>
      ))}
    </ol>
  );
}

function list(value: unknown): string {
  return Array.isArray(value) && value.length > 0 ? value.join(", ") : "—";
}
