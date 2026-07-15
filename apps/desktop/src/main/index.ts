import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { LcuReadOnlyClient, type LcuGameflowPhase } from "@sparta/riot";

const GAMEFLOW_POLL_INTERVAL_MS = 2500;

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
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

/**
 * Poll local e somente leitura do gameflow do cliente League of Legends.
 * Usado apenas para avisar a renderer quando o jogador entra em champion
 * select, para trocar a aba automaticamente. Nao envia nenhuma acao ao
 * cliente (ver docs/riot-compliance.md e packages/riot/src/lcu).
 */
function startGameflowWatcher() {
  const client = new LcuReadOnlyClient();
  let lastPhase: LcuGameflowPhase | null = null;

  setInterval(() => {
    void client.getGameflowPhase().then((phase) => {
      if (phase === lastPhase) return;
      lastPhase = phase;
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("sparta:gameflow-phase", phase);
      }
    });
  }, GAMEFLOW_POLL_INTERVAL_MS);
}

void app.whenReady().then(() => {
  createWindow();
  startGameflowWatcher();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
