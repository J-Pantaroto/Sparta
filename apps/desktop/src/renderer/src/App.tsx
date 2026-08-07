import type {
  CacheMetadata,
  DraftPick,
  DraftRecommendationResponse,
  DraftState,
  AccountOnboardingStatus,
  Role
} from "@sparta/core";
import type {
  LcuDraftMember,
  LcuDraftSnapshot,
  LcuGameflowPhase,
  LcuObservedGame,
  LcuReadStatus
} from "@sparta/riot";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navGroups, pageContext, type Page } from "./app/navigation";
import { accessRouteForOnboarding } from "./app/session-routing";
import { useAsyncData } from "./hooks/use-async-data";
import {
  fetchDraftRecommendations,
  fetchSession,
  logout,
  observeDraftSessionGame,
  SESSION_EXPIRED_EVENT,
  transitionDraftSessionStatus,
  type DraftPersistenceInfo,
  type DraftSessionIdentity,
  type RiotAccountSummary,
  type SessionUser
} from "./services/api-client";
import {
  fetchAllChampions,
  fetchLatestDataDragonVersion,
  DATA_DRAGON_CACHE_EVENT,
  getLastDataDragonCacheMetadata,
  type DataDragonChampionSummary
} from "./services/datadragon";
import { AuthScreen } from "./features/AuthScreen";
import { AccountScreen } from "./features/AccountScreen";
import { ChampionSelectScreen } from "./features/ChampionSelectScreen";
import { DashboardScreen } from "./features/DashboardScreen";
import { DraftHistoryScreen } from "./features/DraftHistoryScreen";
import { CalibrationLabScreen } from "./features/CalibrationLabScreen";
import { GrowthJourneyScreen } from "./features/GrowthJourneyScreen";
import { MotorHistoryScreen } from "./features/MotorHistoryScreen";
import { LinkRiotAccountScreen } from "./features/LinkRiotAccountScreen";
import { EmailVerificationScreen } from "./features/EmailVerificationScreen";
import { OnboardingCompleteScreen } from "./features/OnboardingCompleteScreen";
import { PostGameScreen } from "./features/PostGameScreen";
import { PreGameScreen } from "./features/PreGameScreen";
import { ProfileScreen } from "./features/ProfileScreen";
import { SettingsScreen } from "./features/SettingsScreen";
import { FeaturedChampionProvider, useFeaturedChampion } from "./theme/featured-champion-context";
import {
  AppShell,
  AuthLayout,
  GlobalNotice,
  Loading,
  PlayerSummary,
  Sidebar,
  SidebarGroup,
  SidebarNavItem,
  Topbar
} from "./ui";

type SessionStatus =
  "checking" | "auth" | "email-verification" | "link-account" | "complete" | "ready";

/**
 * Chave técnica opaca da sessão de draft. Aleatória de propósito: qualquer
 * derivação de campeão, posição ou horário poderia unir duas sessões
 * diferentes ou reaproveitar a anterior, que é exatamente o que a Etapa 16
 * proíbe.
 */
function newDraftSessionKey(): string {
  return `cs-${globalThis.crypto.randomUUID()}`;
}

export function App() {
  return (
    <FeaturedChampionProvider>
      <SpartaApp />
    </FeaturedChampionProvider>
  );
}

/**
 * Casca do app: sessao, deteccao via LCU e roteamento entre telas. Cada
 * tela mora no proprio arquivo em `features/` - antes tudo (shell, sessao,
 * os 3 efeitos de IPC e 5 telas inteiras) vivia neste unico arquivo.
 */
function SpartaApp() {
  const { splashUrl } = useFeaturedChampion();
  const [page, setPage] = useState<Page>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sparta:sidebar-collapsed") === "true"
  );
  const [leagueConnected, setLeagueConnected] = useState(false);
  const [lcuStatus, setLcuStatus] = useState<LcuReadStatus>("CLIENT_CLOSED");
  const [gameflowPhase, setGameflowPhase] = useState<LcuGameflowPhase | null>(null);
  const [dashboardRefreshRequest, setDashboardRefreshRequest] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [lastProfileSync, setLastProfileSync] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>({
    // Sem posição. Nada de `playerRole: "MID"`: até o LCU informar (ou o
    // usuário escolher no modo manual), o Sparta não sabe a posição, e
    // fingir que sabe produziria recomendações do papel errado.
    playerRole: undefined,
    pickOrder: 1,
    allies: [],
    enemies: [],
    bannedChampionIds: []
  });

  const [ddragonVersion, setDdragonVersion] = useState<string | null>(null);
  const [ddragonError, setDdragonError] = useState<string | null>(null);
  const [ddragonCache, setDdragonCache] = useState<CacheMetadata>({
    state: "MISS",
    servedAsFallback: false
  });
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("checking");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [onboarding, setOnboarding] = useState<AccountOnboardingStatus | null>(null);
  const [riotAccounts, setRiotAccounts] = useState<RiotAccountSummary[]>([]);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [localPreviewToken, setLocalPreviewToken] = useState<string | undefined>();
  const [poolRevision, setPoolRevision] = useState(0);
  const [postgameInitialMatchId, setPostgameInitialMatchId] = useState<string | null>(null);
  /**
   * Identidade da sessão de draft (Etapa 16). Nasce ao **entrar** no champion
   * select (ou ao iniciar a simulação manual) e é descartada ao sair - não
   * deriva de campeão nem de horário, então duas sessões nunca colidem e uma
   * entrada nova jamais reaproveita a anterior. `null` = nada é persistido, e
   * a análise continua funcionando igual.
   */
  const [draftSession, setDraftSession] = useState<DraftSessionIdentity | null>(null);
  const [persistedDraftSessionId, setPersistedDraftSessionId] = useState<string | null>(null);
  const persistedDraftSessionIdRef = useRef<string | null>(null);
  const lastGameflowPhaseRef = useRef<LcuGameflowPhase | null>(null);
  const sentObservedGameRef = useRef<string | null>(null);
  const [observedGame, setObservedGame] = useState<LcuObservedGame | null>(null);
  const [lastLcuSessionKey, setLastLcuSessionKey] = useState<string | null>(null);
  const lastLcuSessionKeyRef = useRef<string | null>(null);

  // Proteção centralizada: sem posição, a requisição nem sai. A API também
  // recusa (`PLAYER_ROLE_UNAVAILABLE`), mas barrar aqui evita depender de a
  // API estar na mesma versão do desktop. `useAsyncData` já descarta o
  // resultado de uma execução anterior quando as dependências mudam, então
  // trocar de posição não deixa a resposta antiga sobrescrever a nova.
  const recommendationsQuery = useAsyncData<
    DraftRecommendationResponse & { persistence?: DraftPersistenceInfo }
  >(
    (signal) =>
      sessionToken && draft.playerRole
        ? fetchDraftRecommendations(sessionToken, draft, draftSession ?? undefined, signal)
        : undefined,
    [sessionToken, draft, poolRevision, draftSession]
  );

  useEffect(() => {
    const sessionId = recommendationsQuery.data?.persistence?.sessionId;
    if (!sessionId) return;
    setPersistedDraftSessionId(sessionId);
    persistedDraftSessionIdRef.current = sessionId;
  }, [recommendationsQuery.data?.persistence?.sessionId]);

  function loadDataDragonVersion() {
    setDdragonError(null);
    void fetchLatestDataDragonVersion()
      .then((version) => {
        setDdragonVersion(version);
        setDdragonCache(getLastDataDragonCacheMetadata());
      })
      .catch((error) => {
        setDdragonError(error instanceof Error ? error.message : "Catálogo externo indisponível.");
        setDdragonCache(getLastDataDragonCacheMetadata());
      });
  }

  useEffect(loadDataDragonVersion, []);

  useEffect(() => {
    const updateCacheState: Parameters<typeof globalThis.addEventListener>[1] = (event) => {
      setDdragonCache((event as unknown as { detail: CacheMetadata }).detail);
    };
    globalThis.addEventListener(DATA_DRAGON_CACHE_EVENT, updateCacheState);
    return () => globalThis.removeEventListener(DATA_DRAGON_CACHE_EVENT, updateCacheState);
  }, []);

  function applySession(result: Awaited<ReturnType<typeof fetchSession>>, showCompletion = false) {
    setSessionUser(result.user);
    setOnboarding(result.onboarding);
    setRiotAccounts(result.riotAccounts);
    const route = accessRouteForOnboarding(result.onboarding.state);
    if (route === "email-verification") {
      setVerificationEmail(result.user.email ?? "seu email");
      setSessionStatus("email-verification");
    } else if (route === "link-account") {
      setSessionStatus("link-account");
    } else {
      setSessionStatus(showCompletion ? "complete" : "ready");
    }
  }

  // Restaura somente o bearer cifrado pelo processo main. A chave antiga do
  // localStorage e removida sem ser lida para eliminar o legado inseguro.
  useEffect(() => {
    localStorage.removeItem("sparta:token");
    void window.sparta.session.get().then(async (storedToken) => {
      if (!storedToken) {
        setSessionStatus("auth");
        return;
      }
      try {
        const result = await fetchSession(storedToken);
        setSessionToken(storedToken);
        applySession(result);
      } catch {
        await window.sparta.session.clear();
        setSessionStatus("auth");
      }
    });
  }, []);

  useEffect(() => {
    const expire = () => {
      void window.sparta.session.clear();
      setSessionToken(null);
      setSessionUser(null);
      setOnboarding(null);
      setRiotAccounts([]);
      setSessionStatus("auth");
    };
    globalThis.addEventListener(SESSION_EXPIRED_EVENT, expire);
    return () => globalThis.removeEventListener(SESSION_EXPIRED_EVENT, expire);
  }, []);

  // Deteccao automatica de champion select via LCU (somente leitura).
  // `champSelectActive` libera a tela; fora dele ela mostra a espera.
  const [champSelectActive, setChampSelectActive] = useState(false);
  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onGameflowPhase) return;
    const unsubscribe = window.sparta.onGameflowPhase((phase) => {
      setGameflowPhase(phase);
      const previous = lastGameflowPhaseRef.current;
      lastGameflowPhaseRef.current = phase;
      const active = phase === "ChampSelect";
      setChampSelectActive(active);
      if (active) setPage("select");
      if (active && previous !== "ChampSelect") {
        setPersistedDraftSessionId(null);
        persistedDraftSessionIdRef.current = null;
        sentObservedGameRef.current = null;
      }
      const gameStarted = ["GameStart", "InProgress", "Reconnect"].includes(phase ?? "");
      const sessionRef = persistedDraftSessionIdRef.current ?? lastLcuSessionKeyRef.current;
      if (sessionToken && sessionRef && gameStarted) {
        void transitionDraftSessionStatus(sessionToken, sessionRef, "IN_GAME").catch(
          () => undefined
        );
      } else if (
        sessionToken &&
        sessionRef &&
        previous === "ChampSelect" &&
        !active &&
        !gameStarted
      ) {
        void transitionDraftSessionStatus(sessionToken, sessionRef, "ABANDONED").catch(
          () => undefined
        );
      }
      // Entrar cria uma chave nova; sair descarta. Nunca reaproveita.
      setDraftSession((current) =>
        active ? (current ?? { sessionKey: newDraftSessionKey(), source: "LCU" }) : null
      );
    });
    return unsubscribe;
  }, [sessionStatus, sessionToken]);

  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onLcuStatus) return;
    return window.sparta.onLcuStatus((status) => {
      setLcuStatus(status);
      setLeagueConnected(!["CLIENT_CLOSED", "LOCKFILE_MISSING"].includes(status));
    });
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onObservedGame) return;
    return window.sparta.onObservedGame(setObservedGame);
  }, [sessionStatus]);

  useEffect(() => {
    if (!observedGame) return;
    setDraftSession((current) =>
      current?.source === "LCU" && current.gameId !== observedGame.gameId
        ? { ...current, gameId: observedGame.gameId }
        : current
    );
  }, [observedGame]);

  useEffect(() => {
    if (draftSession?.source === "LCU") {
      setLastLcuSessionKey(draftSession.sessionKey);
      lastLcuSessionKeyRef.current = draftSession.sessionKey;
    }
  }, [draftSession]);

  useEffect(() => {
    const sessionRef = persistedDraftSessionId ?? lastLcuSessionKey;
    if (!sessionToken || !sessionRef || !observedGame) return;
    const key = `${sessionRef}:${observedGame.gameId}`;
    if (sentObservedGameRef.current === key) return;
    sentObservedGameRef.current = key;
    void observeDraftSessionGame(sessionToken, sessionRef, observedGame.gameId).catch(() => {
      sentObservedGameRef.current = null;
    });
  }, [sessionToken, persistedDraftSessionId, lastLcuSessionKey, observedGame]);

  /**
   * Modo manual: a simulação também vira sessão persistida, marcada como
   * `USER`. Uma sessão manual **nunca** é apresentada como observada pelo
   * cliente do League.
   */
  useEffect(() => {
    if (champSelectActive || !draft.playerRole || draftSession) return;
    setDraftSession({ sessionKey: newDraftSessionKey(), source: "USER" });
  }, [champSelectActive, draft.playerRole, draftSession]);

  // Ordem de pick real derivada da sessao do LCU. null sem cliente do
  // League (dev/testing) - o controle manual continua funcionando.
  const [autoPickOrder, setAutoPickOrder] = useState<number | null>(null);
  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onPickOrder) return;
    const unsubscribe = window.sparta.onPickOrder(setAutoPickOrder);
    return unsubscribe;
  }, [sessionStatus]);

  useEffect(() => {
    if (autoPickOrder === null) return;
    setDraft((current) =>
      current.pickOrder === autoPickOrder ? current : { ...current, pickOrder: autoPickOrder }
    );
  }, [autoPickOrder]);

  // Papel real do jogador (assignedPosition do LCU) - reflete troca de lane
  // ao vivo. null sem cliente do League; seletor manual continua disponivel.
  const [autoPlayerRole, setAutoPlayerRole] = useState<Role | null>(null);
  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onPlayerRole) return;
    const unsubscribe = window.sparta.onPlayerRole(setAutoPlayerRole);
    return unsubscribe;
  }, [sessionStatus]);

  useEffect(() => {
    // `null` significa "o LCU não informa posição agora" - pode ser fora do
    // champion select, ou dentro dele antes da fila atribuir. Só sobrescreve
    // a posição do draft quando ela veio do próprio LCU: uma escolha manual
    // do usuário não é apagada por um tick sem posição.
    if (autoPlayerRole === null) {
      setDraft((current) =>
        current.playerRoleSource === "LCU"
          ? { ...current, playerRole: undefined, playerRoleSource: undefined }
          : current
      );
      return;
    }
    setDraft((current) =>
      current.playerRole === autoPlayerRole && current.playerRoleSource === "LCU"
        ? current
        : { ...current, playerRole: autoPlayerRole, playerRoleSource: "LCU" }
    );
  }, [autoPlayerRole]);

  // Sair do champion select encerra a sessão observada: a posição detectada
  // não pode sobreviver como se ainda fosse atual. Reentrar consulta o
  // estado real do LCU de novo (`getLcuState` na montagem).
  useEffect(() => {
    if (champSelectActive) return;
    setDraft((current) =>
      current.playerRoleSource === "LCU"
        ? { ...current, playerRole: undefined, playerRoleSource: undefined }
        : current
    );
  }, [champSelectActive]);

  // Draft real (aliados, inimigos, banimentos) lido da sessao do LCU.
  // null fora do champion select - ai o preenchimento manual volta a valer.
  const [autoDraft, setAutoDraft] = useState<LcuDraftSnapshot | null>(null);
  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onDraftSnapshot) return;
    const unsubscribe = window.sparta.onDraftSnapshot(setAutoDraft);
    return unsubscribe;
  }, [sessionStatus]);

  // Os `on*` acima so disparam quando o valor MUDA. Abrir o Sparta ja dentro
  // de um champion select (ou recarregar o renderer no meio dele) deixaria a
  // tela vazia ate o proximo pick - por isso o estado atual e pedido uma vez
  // no monte.
  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.getLcuState) return;
    let cancelled = false;
    void window.sparta.getLcuState().then((state) => {
      if (cancelled) return;
      setLeagueConnected(!["CLIENT_CLOSED", "LOCKFILE_MISSING"].includes(state.status));
      setLcuStatus(state.status);
      setGameflowPhase(state.phase);
      if (state.phase === "ChampSelect") {
        setChampSelectActive(true);
        setPage("select");
      }
      if (state.pickOrder !== null) setAutoPickOrder(state.pickOrder);
      if (state.playerRole !== null) setAutoPlayerRole(state.playerRole);
      if (state.draft !== null) setAutoDraft(state.draft);
      if (state.observedGame !== null) setObservedGame(state.observedGame);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  // O LCU so entrega championId; o nome (que o motor usa pra casar com a
  // tabela de atributos) vem do catalogo da Data Dragon, ja carregado no
  // renderer. Sem catalogo ainda, o merge espera - melhor um tick a mais do
  // que gravar "Campeao 64" como nome.
  const championCatalog = useAsyncData<DataDragonChampionSummary[]>(
    () => (ddragonVersion ? fetchAllChampions(ddragonVersion) : undefined),
    [ddragonVersion]
  );
  const championNames = useMemo(() => {
    const names = new Map<number, string>();
    (championCatalog.data ?? []).forEach((champion) => names.set(champion.id, champion.name));
    return names;
  }, [championCatalog.data]);

  useEffect(() => {
    if (championCatalog.status === "success") {
      setDdragonCache(getLastDataDragonCacheMetadata());
    }
  }, [championCatalog.status]);

  useEffect(() => {
    if (!autoDraft || championNames.size === 0) return;

    const toPick = (member: LcuDraftMember, team: "ally" | "enemy"): DraftPick => ({
      championId: member.championId,
      championName: championNames.get(member.championId) ?? String(member.championId),
      // Sem posição atribuída pela fila o campo fica ausente. Nenhum motor
      // lê o papel de aliado ou inimigo (o confronto de rota vem de
      // `enemyLaneChampionId`), e o placeholder "MID" anterior gravava
      // posição falsa no request enviado à API.
      role: member.position,
      team
    });

    const proximo: Partial<DraftState> = {
      allies: autoDraft.allies.map((member) => toPick(member, "ally")),
      enemies: autoDraft.enemies.map((member) => toPick(member, "enemy")),
      bannedChampionIds: autoDraft.bannedChampionIds,
      enemyLaneChampionId: autoDraft.enemyLaneChampionId,
      selectedChampionId: autoDraft.selectedChampionId
    };

    setDraft((current) => {
      const igual =
        JSON.stringify({
          allies: current.allies,
          enemies: current.enemies,
          bannedChampionIds: current.bannedChampionIds,
          enemyLaneChampionId: current.enemyLaneChampionId,
          selectedChampionId: current.selectedChampionId
        }) === JSON.stringify(proximo);
      return igual ? current : { ...current, ...proximo };
    });
  }, [autoDraft, championNames]);

  async function handleAuthenticated(token: string) {
    await window.sparta.session.set(token);
    setSessionToken(token);
    try {
      applySession(await fetchSession(token));
    } catch {
      await window.sparta.session.clear();
      setSessionToken(null);
      setSessionStatus("auth");
    }
  }

  async function refreshOnboarding(showCompletion = false) {
    if (!sessionToken) return;
    applySession(await fetchSession(sessionToken), showCompletion);
  }

  async function handleLogout() {
    if (sessionToken) await logout(sessionToken).catch(() => undefined);
    await window.sparta.session.clear();
    setSessionToken(null);
    setSessionUser(null);
    setOnboarding(null);
    setRiotAccounts([]);
    setVerificationEmail("");
    setLocalPreviewToken(undefined);
    setSessionStatus("auth");
  }

  useEffect(() => {
    localStorage.setItem("sparta:sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleDashboardProfileState = useCallback(
    (state: { loading: boolean; apiAvailable: boolean; updatedAt: string | null }) => {
      setDashboardLoading(state.loading);
      setApiAvailable(state.apiAvailable);
      if (state.updatedAt) setLastProfileSync(state.updatedAt);
    },
    []
  );

  if (sessionStatus === "checking") {
    // Mesma casca das telas de login, pra a transição pro app (ou pro
    // formulário) não trocar o fundo debaixo do usuário.
    return (
      <AuthLayout splashUrl={splashUrl} title="Sparta" subtitle="Restaurando sua sessão...">
        <div style={{ marginTop: "var(--space-5)" }}>
          <Loading label="Verificando credenciais" />
        </div>
      </AuthLayout>
    );
  }

  if (sessionStatus === "auth") {
    return (
      <AuthScreen
        splashUrl={splashUrl}
        onAuthenticated={handleAuthenticated}
        onRegistrationRequested={(email, previewToken) => {
          setVerificationEmail(email);
          setLocalPreviewToken(previewToken);
          setSessionStatus("email-verification");
        }}
      />
    );
  }

  if (sessionStatus === "email-verification") {
    return (
      <EmailVerificationScreen
        splashUrl={splashUrl}
        email={verificationEmail || sessionUser?.email || "seu email"}
        initialLocalPreviewToken={localPreviewToken}
        onConfirmed={() => {
          setLocalPreviewToken(undefined);
          if (sessionToken) void refreshOnboarding();
          else setSessionStatus("auth");
        }}
        onReturnToLogin={() => void handleLogout()}
      />
    );
  }

  if (sessionStatus === "link-account" && sessionToken && onboarding) {
    return (
      <LinkRiotAccountScreen
        token={sessionToken}
        splashUrl={splashUrl}
        onboarding={onboarding}
        onRefresh={() => void refreshOnboarding(true)}
        onLogout={() => void handleLogout()}
      />
    );
  }

  if (sessionStatus === "complete" && onboarding) {
    return (
      <OnboardingCompleteScreen
        splashUrl={splashUrl}
        riotId={onboarding.riot.riotId}
        localControlledMode={onboarding.riot.localControlledMode}
        onContinue={() => setSessionStatus("ready")}
      />
    );
  }

  if (!ddragonVersion) {
    return (
      <AuthLayout
        splashUrl={splashUrl}
        title="Catálogo de jogo"
        subtitle={ddragonError ?? "Consultando a versão atual da Data Dragon..."}
      >
        {ddragonError ? (
          <button
            type="button"
            className="sp-button sp-button--primary"
            onClick={loadDataDragonVersion}
          >
            Tentar novamente
          </button>
        ) : (
          <Loading label="Carregando catálogo oficial" />
        )}
      </AuthLayout>
    );
  }

  const account = riotAccounts[0];
  const currentPage = pageContext[page];
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.developmentOnly || import.meta.env.DEV)
    }))
    .filter((group) => group.items.length > 0);
  const accountName = account
    ? `${account.gameName}#${account.tagLine}`
    : (sessionUser?.displayName ?? "Conta Sparta");

  return (
    <AppShell
      collapsed={sidebarCollapsed}
      topbar={
        <Topbar
          title={currentPage.title}
          context={currentPage.description}
          accountName={accountName}
          apiAvailable={apiAvailable}
          leagueConnected={leagueConnected}
          lastSync={lastProfileSync}
          canRefresh={page === "dashboard"}
          refreshing={dashboardLoading}
          onRefresh={() => setDashboardRefreshRequest((current) => current + 1)}
          onAccount={() => setPage("account")}
          onSettings={() => setPage("settings")}
          onLogout={() => void handleLogout()}
        />
      }
      sidebar={
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((current) => !current)}
          leagueConnected={leagueConnected}
          version={window.sparta.version}
          footer={
            <PlayerSummary
              collapsed={sidebarCollapsed}
              name={accountName}
              meta={
                onboarding?.riot.acceptedForCurrentEnvironment ? "Acesso pronto" : "Acesso restrito"
              }
            />
          }
        >
          {visibleNavGroups.map((group) => (
            <SidebarGroup key={group.label} label={group.label}>
              {group.items.map(({ page: item, label, description, icon: Icon }) => (
                <SidebarNavItem
                  key={item}
                  label={label}
                  description={description}
                  icon={<Icon size={16} />}
                  active={page === item}
                  collapsed={sidebarCollapsed}
                  live={item === "select" && champSelectActive}
                  onClick={() => setPage(item)}
                />
              ))}
            </SidebarGroup>
          ))}
        </Sidebar>
      }
    >
      {ddragonCache.state === "STALE" && (
        <GlobalNotice
          tone="attention"
          title="Catálogo oficial desatualizado"
          description={`A Data Dragon está indisponível. O Sparta preservou o catálogo local coletado em ${
            ddragonCache.collectedAt
              ? new Date(ddragonCache.collectedAt).toLocaleString("pt-BR")
              : "data desconhecida"
          }.`}
        />
      )}
      {championCatalog.status === "error" && (
        <GlobalNotice
          tone="error"
          title="Catálogo de campeões indisponível"
          description="Tente novamente quando a conexão estiver disponível."
        />
      )}
      {page === "dashboard" && (
        <DashboardScreen
          riotAccounts={riotAccounts}
          sessionToken={sessionToken!}
          ddragonVersion={ddragonVersion}
          champSelectActive={champSelectActive}
          leagueConnected={leagueConnected}
          emailVerified={Boolean(sessionUser?.emailVerifiedAt)}
          refreshRequest={dashboardRefreshRequest}
          onNavigate={setPage}
          onOpenMatch={(matchId) => {
            setPostgameInitialMatchId(matchId);
            setPage("postgame");
          }}
          onProfileState={handleDashboardProfileState}
        />
      )}
      {page === "profile" && sessionToken && (
        <ProfileScreen
          sessionToken={sessionToken}
          ddragonVersion={ddragonVersion}
          onOpenMatch={(matchId) => {
            setPostgameInitialMatchId(matchId);
            setPage("postgame");
          }}
        />
      )}
      {page === "select" && (
        <ChampionSelectScreen
          draft={draft}
          setDraft={setDraft}
          autoPickOrder={autoPickOrder}
          autoPlayerRole={autoPlayerRole}
          champSelectActive={champSelectActive}
          lcuStatus={lcuStatus}
          gameflowPhase={gameflowPhase}
          selectedChampionLocked={autoDraft?.selectedChampionLocked ?? false}
          selectedChampionName={
            draft.selectedChampionId === undefined
              ? undefined
              : championNames.get(draft.selectedChampionId)
          }
          recommendations={recommendationsQuery.data?.primaryRecommendations ?? []}
          alternatives={recommendationsQuery.data?.alternatives ?? []}
          poolSummary={recommendationsQuery.data?.poolSummary ?? null}
          recommendationsStatus={recommendationsQuery.status}
          noAccountLinked={riotAccounts.length === 0}
          ddragonVersion={ddragonVersion}
          riotAccounts={riotAccounts}
          sessionToken={sessionToken}
          onPoolChanged={() => setPoolRevision((current) => current + 1)}
          draftAutoFilled={autoDraft !== null}
        />
      )}
      {page === "pregame" && (
        <PreGameScreen
          draft={draft}
          ddragonVersion={ddragonVersion}
          sessionToken={sessionToken}
          playerId={account?.puuid}
        />
      )}
      {page === "postgame" && (
        <PostGameScreen
          riotAccounts={riotAccounts}
          sessionToken={sessionToken}
          ddragonVersion={ddragonVersion}
          initialMatchId={postgameInitialMatchId}
        />
      )}
      {page === "drafts" && (
        <DraftHistoryScreen
          sessionToken={sessionToken}
          ddragonVersion={ddragonVersion}
          onOpenMatch={(matchId) => {
            setPostgameInitialMatchId(matchId);
            setPage("postgame");
          }}
        />
      )}
      {page === "growth" && (
        <GrowthJourneyScreen riotAccounts={riotAccounts} sessionToken={sessionToken} />
      )}
      {page === "motor" && (
        <MotorHistoryScreen riotAccounts={riotAccounts} sessionToken={sessionToken} />
      )}
      {page === "calibration" && sessionToken && <CalibrationLabScreen token={sessionToken} />}
      {page === "settings" && (
        <SettingsScreen ddragonVersion={ddragonVersion} sessionToken={sessionToken} />
      )}
      {page === "account" && sessionToken && sessionUser && onboarding && (
        <AccountScreen
          token={sessionToken}
          user={sessionUser}
          onboarding={onboarding}
          onSessionRotated={(token, email, previewToken) => {
            void window.sparta.session.set(token);
            setSessionToken(token);
            setVerificationEmail(email);
            setLocalPreviewToken(previewToken);
            setSessionStatus("email-verification");
          }}
          onOnboardingChanged={() => void refreshOnboarding()}
          onLogout={() => void handleLogout()}
        />
      )}
    </AppShell>
  );
}
