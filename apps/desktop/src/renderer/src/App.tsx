import type {
  CacheMetadata,
  DraftPick,
  DraftRecommendationResponse,
  DraftState,
  Role
} from "@sparta/core";
import type {
  LcuDraftMember,
  LcuDraftSnapshot,
  LcuGameflowPhase,
  LcuObservedGame
} from "@sparta/riot";
import { useEffect, useMemo, useRef, useState } from "react";
import { navGroups, type Page } from "./app/navigation";
import { useAsyncData } from "./hooks/use-async-data";
import {
  fetchDraftRecommendations,
  fetchSession,
  observeDraftSessionGame,
  SESSION_TOKEN_KEY,
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
import { ChampionSelectScreen } from "./features/ChampionSelectScreen";
import { DashboardScreen } from "./features/DashboardScreen";
import { DraftHistoryScreen } from "./features/DraftHistoryScreen";
import { GrowthJourneyScreen } from "./features/GrowthJourneyScreen";
import { MotorHistoryScreen } from "./features/MotorHistoryScreen";
import { LinkRiotAccountScreen } from "./features/LinkRiotAccountScreen";
import { PostGameScreen } from "./features/PostGameScreen";
import { PreGameScreen } from "./features/PreGameScreen";
import { ProfileScreen } from "./features/ProfileScreen";
import { SettingsScreen } from "./features/SettingsScreen";
import { FeaturedChampionProvider, useFeaturedChampion } from "./theme/featured-champion-context";
import {
  AppShell,
  AuthLayout,
  Loading,
  PlayerSummary,
  Sidebar,
  SidebarGroup,
  SidebarNavItem
} from "./ui";

type SessionStatus = "checking" | "auth" | "link-account" | "ready";

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
  const [riotAccounts, setRiotAccounts] = useState<RiotAccountSummary[]>([]);
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
    () =>
      sessionToken && draft.playerRole
        ? fetchDraftRecommendations(sessionToken, draft, draftSession ?? undefined)
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

  // Restaura sessao salva localmente, se existir.
  useEffect(() => {
    const storedToken = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!storedToken) {
      setSessionStatus("auth");
      return;
    }
    fetchSession(storedToken)
      .then((result) => {
        setSessionToken(storedToken);
        setSessionUser(result.user);
        setRiotAccounts(result.riotAccounts);
        setSessionStatus(result.riotAccounts.length > 0 ? "ready" : "link-account");
      })
      .catch(() => {
        localStorage.removeItem(SESSION_TOKEN_KEY);
        setSessionStatus("auth");
      });
  }, []);

  // Deteccao automatica de champion select via LCU (somente leitura).
  // `champSelectActive` libera a tela; fora dele ela mostra a espera.
  const [champSelectActive, setChampSelectActive] = useState(false);
  useEffect(() => {
    if (sessionStatus !== "ready" || !window.sparta?.onGameflowPhase) return;
    const unsubscribe = window.sparta.onGameflowPhase((phase) => {
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

  function handleAuthenticated(token: string) {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    setSessionToken(token);
    fetchSession(token)
      .then((result) => {
        setSessionUser(result.user);
        setRiotAccounts(result.riotAccounts);
        setSessionStatus(result.riotAccounts.length > 0 ? "ready" : "link-account");
      })
      .catch(() => setSessionStatus("link-account"));
  }

  function handleLinked(account: RiotAccountSummary) {
    setRiotAccounts((current) => [...current, account]);
    setSessionStatus("ready");
  }

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
        onSkip={() => setSessionStatus("ready")}
      />
    );
  }

  if (sessionStatus === "link-account" && sessionToken) {
    return (
      <LinkRiotAccountScreen
        token={sessionToken}
        splashUrl={splashUrl}
        onLinked={handleLinked}
        onSkip={() => setSessionStatus("ready")}
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

  return (
    <AppShell
      sidebar={
        <Sidebar
          footer={
            <PlayerSummary
              artUrl={splashUrl}
              name={
                account
                  ? `${account.gameName}#${account.tagLine}`
                  : (sessionUser?.displayName ?? "Convidado")
              }
              meta={account ? account.platformRegion.toUpperCase() : "Sem conta Riot vinculada"}
            />
          }
        >
          {navGroups.map((group) => (
            <SidebarGroup key={group.label} label={group.label}>
              {group.items.map(({ page: item, label, icon: Icon }) => (
                <SidebarNavItem
                  key={item}
                  label={label}
                  icon={<Icon size={16} />}
                  active={page === item}
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
        <div
          role="status"
          style={{
            margin: "var(--space-4)",
            padding: "var(--space-3)",
            border: "1px solid var(--color-warning)",
            borderRadius: "var(--radius-md)"
          }}
        >
          Data Dragon indisponível: usando catálogo local desatualizado, coletado em{" "}
          {ddragonCache.collectedAt
            ? new Date(ddragonCache.collectedAt).toLocaleString("pt-BR")
            : "data desconhecida"}
          .
        </div>
      )}
      {championCatalog.status === "error" && (
        <div role="alert" style={{ margin: "var(--space-4)", color: "var(--color-danger)" }}>
          O catálogo de campeões está indisponível: {championCatalog.error}
        </div>
      )}
      {page === "dashboard" && (
        <DashboardScreen
          riotAccounts={riotAccounts}
          ddragonVersion={ddragonVersion}
          champSelectActive={champSelectActive}
          onNavigate={setPage}
        />
      )}
      {page === "profile" && (
        <ProfileScreen riotAccounts={riotAccounts} ddragonVersion={ddragonVersion} />
      )}
      {page === "select" && (
        <ChampionSelectScreen
          draft={draft}
          setDraft={setDraft}
          autoPickOrder={autoPickOrder}
          autoPlayerRole={autoPlayerRole}
          champSelectActive={champSelectActive}
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
          onOpenMatch={(matchId) => {
            setPostgameInitialMatchId(matchId);
            setPage("postgame");
          }}
        />
      )}
      {page === "growth" && <GrowthJourneyScreen riotAccounts={riotAccounts} />}
      {page === "motor" && (
        <MotorHistoryScreen riotAccounts={riotAccounts} sessionToken={sessionToken} />
      )}
      {page === "settings" && (
        <SettingsScreen ddragonVersion={ddragonVersion} sessionToken={sessionToken} />
      )}
    </AppShell>
  );
}
