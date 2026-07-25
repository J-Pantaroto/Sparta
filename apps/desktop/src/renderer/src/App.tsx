import type { DraftState, PickRecommendation, Role } from "@sparta/core";
import { useEffect, useState } from "react";
import { navGroups, type Page } from "./app/navigation";
import { useAsyncData } from "./hooks/use-async-data";
import {
  fetchDraftRecommendations,
  fetchSession,
  SESSION_TOKEN_KEY,
  type RiotAccountSummary,
  type SessionUser
} from "./services/api-client";
import { fetchLatestDataDragonVersion } from "./services/datadragon";
import { AuthScreen } from "./features/AuthScreen";
import { ChampionSelectScreen } from "./features/ChampionSelectScreen";
import { DashboardScreen } from "./features/DashboardScreen";
import { GrowthJourneyScreen } from "./features/GrowthJourneyScreen";
import { LinkRiotAccountScreen } from "./features/LinkRiotAccountScreen";
import { PostGameScreen } from "./features/PostGameScreen";
import { PreGameScreen } from "./features/PreGameScreen";
import { ProfileScreen } from "./features/ProfileScreen";
import { SettingsScreen } from "./features/SettingsScreen";
import { FeaturedChampionProvider, useFeaturedChampion } from "./theme/featured-champion-context";
import { AppShell, PlayerSummary, Sidebar, SidebarGroup, SidebarNavItem } from "./ui";

type SessionStatus = "checking" | "auth" | "link-account" | "ready";

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
    playerRole: "MID",
    pickOrder: 1,
    allies: [],
    enemies: [],
    bannedChampionIds: []
  });

  const [ddragonVersion, setDdragonVersion] = useState<string>("14.14.1");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("checking");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [riotAccounts, setRiotAccounts] = useState<RiotAccountSummary[]>([]);

  const recommendationsQuery = useAsyncData<PickRecommendation[]>(
    () =>
      sessionToken
        ? fetchDraftRecommendations(sessionToken, draft).then((result) => result.recommendations)
        : undefined,
    [sessionToken, draft]
  );

  // Versao real do Data Dragon (com fallback silencioso se offline).
  useEffect(() => {
    void fetchLatestDataDragonVersion().then(setDdragonVersion);
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
      const active = phase === "ChampSelect";
      setChampSelectActive(active);
      if (active) setPage("select");
    });
    return unsubscribe;
  }, [sessionStatus]);

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
    setDraft((current) => (current.pickOrder === autoPickOrder ? current : { ...current, pickOrder: autoPickOrder }));
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
    if (autoPlayerRole === null) return;
    setDraft((current) =>
      current.playerRole === autoPlayerRole ? current : { ...current, playerRole: autoPlayerRole }
    );
  }, [autoPlayerRole]);

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
    return <div className="auth-shell" style={{ backgroundImage: `url(${splashUrl})` }} />;
  }

  if (sessionStatus === "auth") {
    return (
      <AuthScreen splashUrl={splashUrl} onAuthenticated={handleAuthenticated} onSkip={() => setSessionStatus("ready")} />
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

  const account = riotAccounts[0];

  return (
    <AppShell
      sidebar={
        <Sidebar
          footer={
            <PlayerSummary
              artUrl={splashUrl}
              name={account ? `${account.gameName}#${account.tagLine}` : (sessionUser?.displayName ?? "Convidado")}
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
      {page === "dashboard" && (
        <DashboardScreen
          riotAccounts={riotAccounts}
          ddragonVersion={ddragonVersion}
          champSelectActive={champSelectActive}
          onNavigate={setPage}
        />
      )}
      {page === "profile" && <ProfileScreen riotAccounts={riotAccounts} ddragonVersion={ddragonVersion} />}
      {page === "select" && (
        <ChampionSelectScreen
          draft={draft}
          setDraft={setDraft}
          autoPickOrder={autoPickOrder}
          autoPlayerRole={autoPlayerRole}
          champSelectActive={champSelectActive}
          recommendations={recommendationsQuery.data ?? []}
          recommendationsStatus={recommendationsQuery.status}
          noAccountLinked={riotAccounts.length === 0}
          ddragonVersion={ddragonVersion}
        />
      )}
      {page === "pregame" && <PreGameScreen draft={draft} ddragonVersion={ddragonVersion} />}
      {page === "postgame" && (
        <PostGameScreen riotAccounts={riotAccounts} sessionToken={sessionToken} ddragonVersion={ddragonVersion} />
      )}
      {page === "growth" && <GrowthJourneyScreen riotAccounts={riotAccounts} />}
      {page === "settings" && <SettingsScreen ddragonVersion={ddragonVersion} sessionToken={sessionToken} />}
    </AppShell>
  );
}
