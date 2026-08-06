import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { URL } from "node:url";
import {
  deriveDraftSnapshot,
  derivePickOrder,
  derivePlayerRole,
  fetchWithPolicy,
  HTTP_TIMEOUTS,
  isSameDraftSnapshot,
  LcuReadOnlyClient,
  type LcuDraftSnapshot,
  type LcuGameflowPhase,
  type LcuObservedGame,
  type LcuReadStatus
} from "@sparta/riot";
import type { Role } from "@sparta/core";

/**
 * O Electron deriva `app.getName()` do campo `name` do `package.json`
 * empacotado, que aqui e `@sparta/desktop` — nome de pacote do workspace, nao
 * nome de produto. Sem esta chamada, `app.getPath("userData")` vira
 * `%APPDATA%\@sparta\desktop`: a barra do escopo vira subpasta, e o usuario
 * ganha um diretorio `@sparta` solto em AppData com o nome interno do
 * monorepo. Achado ao validar a instalacao do candidato 0.9.0.
 *
 * Precisa vir **antes** de qualquer leitura de `userData` (o download de skin
 * escreve la) e antes do `whenReady`. Trocar isso depois de publicado
 * significaria abandonar os dados de quem ja tivesse instalado; como nada foi
 * publicado ainda, a correcao nao exige migracao.
 */
app.setName("Sparta");

const GAMEFLOW_POLL_INTERVAL_MS = 2500;

/**
 * O bearer de sessao nunca e persistido pelo renderer. No Windows, o
 * `safeStorage` usa DPAPI e vincula o ciphertext ao usuario do sistema. Se a
 * criptografia nao estiver disponivel, o app mantem apenas a sessao em
 * memoria em vez de gravar texto puro.
 */
function registerProtectedSessionStore() {
  const sessionPath = join(app.getPath("userData"), "session-token.bin");
  ipcMain.handle("sparta:session:get", async () => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(await readFile(sessionPath));
    } catch {
      return null;
    }
  });
  ipcMain.handle("sparta:session:set", async (_event, token: string) => {
    if (!safeStorage.isEncryptionAvailable() || typeof token !== "string" || token.length > 8_192) {
      return false;
    }
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(sessionPath, safeStorage.encryptString(token));
    return true;
  });
  ipcMain.handle("sparta:session:clear", async () => {
    await rm(sessionPath, { force: true });
  });
}

function registerRiotAuthorizationHandler() {
  ipcMain.handle("sparta:riot-auth:open", async (_event, target: string) => {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== "auth.riotgames.com") {
      throw new Error("Destino de autorizacao Riot nao permitido.");
    }
    await shell.openExternal(url.toString());
  });
}

/**
 * Baixa a splash art de uma skin pro disco (userData/skins), pra aplicar o
 * tema funcionar offline depois da primeira vez - unica escrita em disco do
 * app hoje. Renderer nao tem acesso a `fs` (contextIsolation), entao pede
 * via IPC request/response (ipcRenderer.invoke), diferente do padrao
 * push-only ja usado pelo gameflow-phase.
 *
 * Devolve um **data URL** (nao um caminho de disco). `file://` nao carrega
 * no renderer - a pagina roda em `http://localhost` (dev) ou no bundle, e o
 * Chromium bloqueia `file://` cross-origin; um esquema proprio registrado
 * via `protocol.handle` tambem nao e roteado a partir de uma origem http
 * (testado: o handler nunca era chamado). O data URL funciona em qualquer
 * origem, e o arquivo em disco continua sendo a copia offline.
 */
function registerSkinDownloadHandler() {
  ipcMain.handle("sparta:download-skin", async (_event, url: string, fileName: string) => {
    const parsedUrl = new URL(url);
    const allowedHosts = new Set(["ddragon.leagueoflegends.com", "raw.communitydragon.org"]);
    if (parsedUrl.protocol !== "https:" || !allowedHosts.has(parsedUrl.hostname)) {
      throw new Error("Fonte de imagem não permitida.");
    }
    // A CDN da Data Dragon (Akamai) responde 403 pra requisicoes sem
    // User-Agent - o fetch do processo main (Node/Electron) nao manda um por
    // padrao, entao o download quebrava (bug real reportado). Um UA de
    // navegador resolve.
    const response = await fetchWithPolicy(url, {
      integration: "REMOTE_ASSET",
      timeoutMs: HTTP_TIMEOUTS.remoteAssetMs,
      throwOnHttpError: true,
      request: {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Sparta-Desktop" }
      }
    });
    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/"))
      throw new Error("A fonte externa não devolveu uma imagem válida.");
    const buffer = Buffer.from(await response.arrayBuffer());

    const safeName = basename(fileName);
    const skinsDir = join(app.getPath("userData"), "skins");
    await mkdir(skinsDir, { recursive: true });
    await writeFile(join(skinsDir, safeName), buffer);

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 720,
    title: "Sparta",
    backgroundColor: "#050505",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Explícito de propósito. O Electron já usa `true` por padrão nesta
      // configuração — e é por causa dele que o preload precisa ser CommonJS
      // (o loader do renderer sandboxed não entende ESM, bug real corrigido
      // numa sessão anterior). Declarar deixa a dependência visível: quem
      // mexer no formato do preload vê o motivo aqui.
      sandbox: true
    }
  });

  // Sparta não abre janela nenhuma a partir do renderer. Sem este handler, um
  // `window.open` (ou conteúdo injetado que o provoque) criaria uma
  // `BrowserWindow` nova com as preferências padrão, fora da CSP desta
  // janela. Negar por padrão é o comportamento correto, e um link legítimo
  // futuro deve passar por `shell.openExternal` com destino conferido.
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // A janela do app não navega para fora dela mesma. Sem esta guarda, uma
  // navegação induzida no renderer substituiria a aplicação inteira por
  // conteúdo externo, mantendo o preload e o bridge no lugar.
  window.webContents.on("will-navigate", (event, targetUrl) => {
    const allowed = process.env.ELECTRON_RENDERER_URL;
    const isDevServer = allowed !== undefined && targetUrl.startsWith(allowed);
    if (!isDevServer && !targetUrl.startsWith("file://")) {
      event.preventDefault();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

/**
 * Poll local e somente leitura do gameflow e (quando em champion select) da
 * ordem de pick do cliente League of Legends. Usado apenas para refletir
 * estado na UI do Sparta (trocar de aba, mostrar a ordem de pick real em
 * vez do input manual). Nao envia nenhuma acao ao cliente (ver
 * docs/riot-compliance.md e packages/riot/src/lcu).
 */
/**
 * Ultimo estado lido do LCU. O watcher transmite so quando algo muda - sem
 * isto, um renderer que monta depois (recarga, ou o app aberto ja dentro do
 * champion select) ficaria sem estado nenhum ate a proxima mudanca.
 */
interface LcuState {
  status: LcuReadStatus;
  phase: LcuGameflowPhase | null;
  pickOrder: number | null;
  playerRole: Role | null;
  draft: LcuDraftSnapshot | null;
  observedGame: LcuObservedGame | null;
}

let lcuState: LcuState = {
  status: "CLIENT_CLOSED",
  phase: null,
  pickOrder: null,
  playerRole: null,
  draft: null,
  observedGame: null
};

function registerLcuStateHandler() {
  ipcMain.handle("sparta:lcu-state", () => lcuState);
}

function startGameflowWatcher() {
  const client = new LcuReadOnlyClient();
  let lastPhase: LcuGameflowPhase | null = null;
  let lastPickOrder: number | null = null;
  let lastPlayerRole: Role | null = null;
  let lastDraft: LcuDraftSnapshot | undefined;
  let lastObservedGame: LcuObservedGame | undefined;

  function broadcast(channel: string, payload: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload);
    }
  }

  function clearObservedState(status: LcuReadStatus, phase: LcuGameflowPhase | null = null) {
    if (lastPhase !== phase) {
      lastPhase = phase;
      broadcast("sparta:gameflow-phase", phase);
    }
    if (lastPickOrder !== null) broadcast("sparta:pick-order", null);
    if (lastPlayerRole !== null) broadcast("sparta:player-role", null);
    if (lastDraft !== undefined) broadcast("sparta:draft-snapshot", null);
    if (lastObservedGame !== undefined) broadcast("sparta:observed-game", null);
    lastPickOrder = null;
    lastPlayerRole = null;
    lastDraft = undefined;
    lastObservedGame = undefined;
    lcuState = {
      status,
      phase,
      pickOrder: null,
      playerRole: null,
      draft: null,
      observedGame: null
    };
  }

  async function poll() {
    const phaseResult = await client.getGameflowPhase();
    if (phaseResult.status !== "OK") {
      clearObservedState(phaseResult.status);
      return;
    }
    const phase = phaseResult.data;
    if (phase !== lastPhase) {
      lastPhase = phase;
      broadcast("sparta:gameflow-phase", phase);
    }
    lcuState = { ...lcuState, status: "OK", phase: lastPhase };

    const observesGame = ["ChampSelect", "GameStart", "InProgress", "Reconnect"].includes(phase);
    if (observesGame) {
      const gameResult = await client.getObservedGame();
      if (gameResult.status === "OK") {
        const observedGame = gameResult.data;
        if (observedGame?.gameId !== lastObservedGame?.gameId) {
          lastObservedGame = observedGame;
          broadcast("sparta:observed-game", observedGame ?? null);
        }
        lcuState = { ...lcuState, observedGame: observedGame ?? null };
      }
    }

    if (phase !== "ChampSelect") {
      if (!observesGame) {
        clearObservedState("OUTSIDE_CHAMP_SELECT", phase);
        return;
      }
      if (lastPickOrder !== null) broadcast("sparta:pick-order", null);
      if (lastPlayerRole !== null) broadcast("sparta:player-role", null);
      if (lastDraft !== undefined) broadcast("sparta:draft-snapshot", null);
      lastPickOrder = null;
      lastPlayerRole = null;
      lastDraft = undefined;
      lcuState = {
        ...lcuState,
        status: "OUTSIDE_CHAMP_SELECT",
        phase,
        pickOrder: null,
        playerRole: null,
        draft: null
      };
      return;
    }

    const sessionResult = await client.getChampionSelectSession();
    if (sessionResult.status !== "OK") {
      clearObservedState(sessionResult.status, phase);
      return;
    }
    const snapshot = sessionResult.data;
    const pickOrder = derivePickOrder(snapshot);
    if (pickOrder !== lastPickOrder) {
      lastPickOrder = pickOrder ?? null;
      broadcast("sparta:pick-order", lastPickOrder);
    }

    const playerRole = derivePlayerRole(snapshot);
    if (playerRole !== lastPlayerRole) {
      lastPlayerRole = playerRole ?? null;
      broadcast("sparta:player-role", lastPlayerRole);
    }

    const draft = deriveDraftSnapshot(snapshot);
    if (!isSameDraftSnapshot(draft, lastDraft)) {
      lastDraft = draft;
      broadcast("sparta:draft-snapshot", draft ?? null);
    }

    lcuState = {
      status: "OK",
      phase: lastPhase,
      pickOrder: lastPickOrder,
      playerRole: lastPlayerRole,
      draft: lastDraft ?? null,
      observedGame: lastObservedGame ?? null
    };
  }

  function schedulePoll() {
    void poll()
      .catch(() => clearObservedState("ENDPOINT_UNAVAILABLE"))
      .finally(() => globalThis.setTimeout(schedulePoll, GAMEFLOW_POLL_INTERVAL_MS));
  }
  schedulePoll();
}

void app.whenReady().then(() => {
  registerProtectedSessionStore();
  registerRiotAuthorizationHandler();
  createWindow();
  registerLcuStateHandler();
  startGameflowWatcher();
  registerSkinDownloadHandler();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
