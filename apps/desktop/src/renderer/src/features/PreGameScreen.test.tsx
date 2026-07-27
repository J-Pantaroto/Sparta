import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DraftState, PreGameAnalysis } from "@sparta/core";
import { PreGameScreen } from "./PreGameScreen";

const fetchPreGameAnalysisMock = vi.fn();

vi.mock("../services/api-client", () => ({
  fetchPreGameAnalysis: (...args: unknown[]) => fetchPreGameAnalysisMock(...args)
}));
vi.mock("../services/datadragon", () => ({
  fetchAllChampions: () => Promise.resolve([{ id: 61, key: "Orianna", name: "Orianna" }]),
  fetchChampionClassProfiles: () => Promise.resolve([]),
  fetchItemCatalog: () => Promise.resolve([]),
  itemIconUrl: () => "",
  championSquareUrl: () => "",
  championSplashUrl: () => ""
}));

function analysis(overrides: Partial<PreGameAnalysis> = {}): PreGameAnalysis {
  return {
    status: "PARTIAL",
    dataCoverage: 0.45,
    coverageBreakdown: { campeaoSelecionado: { weight: 0.1, available: true } },
    selectedChampion: { championId: 61, championName: "Orianna", role: "MID" },
    summary: {
      key: "summary",
      title: "Resumo da escolha",
      description: "Análise de Orianna com 3 dos 10 campeões da partida já conhecidos.",
      status: "PARTIAL",
      tone: "NEUTRAL",
      strength: null,
      confidence: null,
      evidence: ["2 de 5 aliados (incluindo você)"]
    },
    laneContext: {
      key: "lane_context",
      title: "Confronto direto",
      status: "UNAVAILABLE",
      signals: [],
      unavailableReason: "O oponente da sua posição ainda não foi revelado no draft."
    },
    alliedComposition: {
      key: "allied_composition",
      title: "Composição aliada",
      status: "PARTIAL",
      knownCount: 2,
      expectedCount: 5,
      signals: [
        {
          key: "ally_waveclear",
          title: "wave clear",
          description: "Entre 2 dos 5 campeões conhecidos, a composição já apresenta wave clear.",
          status: "PARTIAL",
          tone: "POSITIVE",
          strength: 72,
          confidence: null
        }
      ]
    },
    enemyComposition: {
      key: "enemy_composition",
      title: "Composição inimiga",
      status: "UNAVAILABLE",
      signals: [],
      unavailableReason: "Nenhum campeão inimigo foi revelado até agora."
    },
    selectedChampionFit: {
      key: "selected_fit",
      title: "O que sua escolha adiciona",
      status: "PARTIAL",
      signals: [
        {
          key: "fit_adds",
          title: "Recursos que sua escolha traz",
          description: "Orianna apresenta perfil de wave clear.",
          status: "AVAILABLE",
          tone: "POSITIVE",
          strength: null,
          confidence: null
        }
      ]
    },
    knownRisks: {
      key: "known_risks",
      title: "Riscos conhecidos",
      status: "UNAVAILABLE",
      signals: [],
      unavailableReason: "Nenhum campeão inimigo com perfil conhecido foi revelado até agora."
    },
    unavailableSignals: [
      {
        key: "META_STRENGTH",
        title: "Força no meta",
        description: "Quão forte o campeão está no patch atual.",
        status: "UNAVAILABLE",
        unavailableReason: "Não há Meta Intelligence observada para o patch.",
        strength: null,
        confidence: null
      }
    ],
    generatedAt: "2026-07-27T12:00:00.000Z",
    algorithmVersion: "1.0.0",
    ...overrides
  };
}

function draft(overrides: Partial<DraftState> = {}): DraftState {
  return {
    playerRole: "MID",
    pickOrder: 3,
    allies: [],
    enemies: [],
    bannedChampionIds: [],
    selectedChampionId: 61,
    ...overrides
  };
}

function renderScreen(state: Partial<DraftState> = {}, token: string | null = "token-1") {
  render(<PreGameScreen draft={draft(state)} ddragonVersion="16.14.1" sessionToken={token} />);
}

describe("PreGameScreen", () => {
  it("renderiza o resumo e a cobertura vindos do contrato", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(analysis());
    renderScreen();

    expect(await screen.findByText(/3 dos 10 campeões/)).toBeTruthy();
    expect(screen.getAllByText(/45%/).length).toBeGreaterThan(0);
  });

  it("marca explicitamente que a cobertura não é confiança nem chance de vitória", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(analysis());
    renderScreen();

    expect(await screen.findByText(/não é confiança estatística nem chance de vitória/i)).toBeTruthy();
  });

  it("renderiza sinal disponível, parcial e indisponível ao mesmo tempo", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(analysis());
    renderScreen();

    // Disponível/parcial: a descrição do sinal aparece.
    expect(await screen.findByText(/já apresenta wave clear/)).toBeTruthy();
    // Parcial: badge de parcialidade.
    expect(screen.getAllByText("Parcial").length).toBeGreaterThan(0);
    // Indisponível: o motivo aparece, sem número inventado.
    expect(screen.getByText(/oponente da sua posição ainda não foi revelado/i)).toBeTruthy();
  });

  it("não exibe a orientação estática antiga", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(analysis());
    renderScreen();

    await screen.findByText(/3 dos 10 campeões/);
    expect(screen.queryByText(/Orientação geral/i)).toBeNull();
    expect(screen.queryByText(/Prioridades da partida/i)).toBeNull();
    expect(screen.queryByText(/prioridade no mid antes de objetivos/i)).toBeNull();
  });

  it("lista os sinais que o Sparta ainda não produz, com motivo", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(analysis());
    renderScreen();

    expect(await screen.findByText(/Força no meta/)).toBeTruthy();
    expect(screen.getByText(/Meta Intelligence observada/)).toBeTruthy();
  });

  it("draft incompleto é estado natural, não erro técnico", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(analysis());
    renderScreen();

    expect(await screen.findByText("Draft incompleto")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sem campeão confirmado, não chama a API e mostra o estado vazio", async () => {
    fetchPreGameAnalysisMock.mockClear();
    renderScreen({ selectedChampionId: undefined });

    expect(await screen.findByText(/Nenhum campeão confirmado/)).toBeTruthy();
    expect(fetchPreGameAnalysisMock).not.toHaveBeenCalled();
  });

  it("sem posição identificada, não chama a API", async () => {
    fetchPreGameAnalysisMock.mockClear();
    fetchPreGameAnalysisMock.mockResolvedValue(analysis());
    renderScreen({ playerRole: undefined });

    await waitFor(() => expect(screen.getAllByText("Orianna").length).toBeGreaterThan(0));
    expect(fetchPreGameAnalysisMock).not.toHaveBeenCalled();
  });

  it("erro estruturado da API vira mensagem legível, sem texto técnico", async () => {
    fetchPreGameAnalysisMock.mockRejectedValue(new Error("Análise contextual indisponível nesta versão da API."));
    renderScreen();

    expect(await screen.findByText(/Análise contextual indisponível nesta versão da API/)).toBeTruthy();
    expect(screen.queryByText(/undefined|NaN|\[object Object\]/)).toBeNull();
  });

  it("resposta atrasada de um draft anterior não é exibida como atual", async () => {
    // A primeira busca nunca resolve; a tela não pode mostrar nada de
    // análise enquanto isso.
    fetchPreGameAnalysisMock.mockReturnValue(new Promise(() => {}));
    renderScreen();

    await waitFor(() => expect(screen.getByText(/Analisando o draft atual/)).toBeTruthy());
    expect(screen.queryByText(/já apresenta wave clear/)).toBeNull();
  });

  it("refaz a análise quando o campeão confirmado muda", async () => {
    fetchPreGameAnalysisMock.mockClear();
    fetchPreGameAnalysisMock.mockResolvedValue(analysis());

    const { rerender } = render(
      <PreGameScreen draft={draft()} ddragonVersion="16.14.1" sessionToken="token-1" />
    );
    await screen.findByText(/3 dos 10 campeões/);
    const chamadasIniciais = fetchPreGameAnalysisMock.mock.calls.length;

    rerender(
      <PreGameScreen
        draft={draft({ selectedChampionId: 103 })}
        ddragonVersion="16.14.1"
        sessionToken="token-1"
      />
    );

    await waitFor(() => expect(fetchPreGameAnalysisMock.mock.calls.length).toBeGreaterThan(chamadasIniciais));
  });

  it("refaz a análise quando a posição muda", async () => {
    fetchPreGameAnalysisMock.mockClear();
    fetchPreGameAnalysisMock.mockResolvedValue(analysis());

    const { rerender } = render(
      <PreGameScreen draft={draft()} ddragonVersion="16.14.1" sessionToken="token-1" />
    );
    await screen.findByText(/3 dos 10 campeões/);
    const chamadasIniciais = fetchPreGameAnalysisMock.mock.calls.length;

    rerender(
      <PreGameScreen draft={draft({ playerRole: "JUNGLE" })} ddragonVersion="16.14.1" sessionToken="token-1" />
    );

    await waitFor(() => expect(fetchPreGameAnalysisMock.mock.calls.length).toBeGreaterThan(chamadasIniciais));
  });

  it("não renderiza NaN, Infinity nem undefined em lugar nenhum", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(analysis());
    const { container } = render(
      <PreGameScreen draft={draft()} ddragonVersion="16.14.1" sessionToken="token-1" />
    );

    await screen.findByText(/3 dos 10 campeões/);
    expect(container.textContent ?? "").not.toMatch(/NaN|Infinity|undefined|\[object Object\]/);
  });
});

describe("PreGameScreen - origem do perfil (Etapa 8)", () => {
  const provenance = (
    reviewState: "UNREVIEWED" | "PARTIALLY_REVIEWED" | "REVIEWED",
    reviewedDimensions: string[] = []
  ) =>
    ({
      source: {
        sourceType: "DERIVED",
        sourceId: "data-dragon",
        resource: "champion.json",
        patch: "16.14.1",
        locale: "pt_BR",
        algorithmVersion: "champion-tag-derivation/1.0.0",
        status: "AVAILABLE"
      },
      reviewState,
      reviewedDimensions
    }) as PreGameAnalysis["selectedChampion"]["profileProvenance"];

  function comProveniencia(profileProvenance: PreGameAnalysis["selectedChampion"]["profileProvenance"]) {
    const base = analysis();
    return { ...base, selectedChampion: { ...base.selectedChampion, profileProvenance } };
  }

  it("perfil derivado é apresentado como derivado das classes, não como estatística", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(comProveniencia(provenance("UNREVIEWED")));
    renderScreen();

    const nota = await screen.findByText(/derivado das classes da Data Dragon/i);
    // A nota de origem não se apresenta como dado oficial da Riot.
    expect(nota.textContent ?? "").not.toMatch(/oficial|Riot|estatística/i);
  });

  it("perfil parcialmente revisado informa quantas dimensões foram revisadas", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(comProveniencia(provenance("PARTIALLY_REVIEWED", ["pickoff", "engage"])));
    renderScreen();

    expect(await screen.findByText(/com 2 dimensão\(ões\) revisada\(s\)/i)).toBeTruthy();
  });

  it("perfil revisado é apresentado como revisado especificamente", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(comProveniencia(provenance("REVIEWED", ["pickoff"])));
    renderScreen();

    expect(await screen.findByText(/revisado especificamente para este campeão/i)).toBeTruthy();
  });

  it("sem proveniência, diz que a origem não foi informada em vez de assumir derivação", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(comProveniencia(undefined));
    renderScreen();

    expect(await screen.findByText(/Origem do perfil deste campeão não informada/i)).toBeTruthy();
    expect(screen.queryByText(/derivado das classes/i)).toBeNull();
  });

  it("a versão da fonte aparece quando conhecida e some quando ausente", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(comProveniencia(provenance("UNREVIEWED")));
    const { unmount } = render(
      <PreGameScreen draft={draft()} ddragonVersion="16.14.1" sessionToken="token-1" />
    );
    expect(await screen.findByText(/champion\.json 16\.14\.1/)).toBeTruthy();
    unmount();

    const semVersao = provenance("UNREVIEWED");
    fetchPreGameAnalysisMock.mockResolvedValue(
      comProveniencia(semVersao ? { ...semVersao, source: { ...semVersao.source, patch: undefined } } : undefined)
    );
    render(<PreGameScreen draft={draft()} ddragonVersion="16.14.1" sessionToken="token-1" />);

    await screen.findByText(/derivado das classes da Data Dragon/i);
    expect(screen.queryByText(/champion\.json/)).toBeNull();
  });

  it("a origem aparece em um lugar só, não repetida em cada frase", async () => {
    fetchPreGameAnalysisMock.mockResolvedValue(comProveniencia(provenance("UNREVIEWED")));
    renderScreen();

    await screen.findByText(/derivado das classes da Data Dragon/i);
    expect(screen.getAllByText(/derivado das classes da Data Dragon/i)).toHaveLength(1);
  });
});
