import { app, BrowserWindow, ipcMain } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { derivePickOrder, LcuReadOnlyClient, type LcuGameflowPhase } from "@sparta/riot";

const GAMEFLOW_POLL_INTERVAL_MS = 2500;

/**
 * Baixa a splash art de uma skin pro disco (userData/skins), pra aplicar o
 * tema funcionar offline depois da primeira vez - unica escrita em disco do
 * app hoje. Renderer nao tem acesso a `fs` (contextIsolation), entao pede
 * via IPC request/response (ipcRenderer.invoke), diferente do padrao
 * push-only ja usado pelo gameflow-phase.
 */
function registerSkinDownloadHandler() {
  ipcMain.handle("sparta:download-skin", async (_event, url: string, fileName: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao baixar a imagem (${response.status}).`);
    const buffer = Buffer.from(await response.arrayBuffer());

    const skinsDir = join(app.getPath("userData"), "skins");
    await mkdir(skinsDir, { recursive: true });
    const filePath = join(skinsDir, fileName);
    await writeFile(filePath, buffer);

    return filePath;
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
 * Poll local e somente leitura do gameflow e (quando em champion select) da
 * ordem de pick do cliente League of Legends. Usado apenas para refletir
 * estado na UI do Sparta (trocar de aba, mostrar a ordem de pick real em
 * vez do input manual). Nao envia nenhuma acao ao cliente (ver
 * docs/riot-compliance.md e packages/riot/src/lcu).
 */
function startGameflowWatcher() {
  const client = new LcuReadOnlyClient();
  let lastPhase: LcuGameflowPhase | null = null;
  let lastPickOrder: number | null = null;

  function broadcast(channel: string, payload: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload);
    }
  }

  setInterval(() => {
    void client.getGameflowPhase().then(async (phase) => {
      if (phase !== lastPhase) {
        lastPhase = phase;
        broadcast("sparta:gameflow-phase", phase);
      }

      if (phase !== "ChampSelect") {
        if (lastPickOrder !== null) {
          lastPickOrder = null;
          broadcast("sparta:pick-order", null);
        }
        return;
      }

      const snapshot = await client.getChampionSelectSession();
      // sessionExists pode piscar false momentaneamente durante a transicao
      // pra ChampSelect - mantem o ultimo valor conhecido em vez de resetar
      // pro manual a toa; derivePickOrder ja volta undefined nesse caso.
      const pickOrder = derivePickOrder(snapshot) ?? lastPickOrder;
      if (pickOrder !== lastPickOrder) {
        lastPickOrder = pickOrder ?? null;
        broadcast("sparta:pick-order", lastPickOrder);
      }
    });
  }, GAMEFLOW_POLL_INTERVAL_MS);
}

void app.whenReady().then(() => {
  createWindow();
  startGameflowWatcher();
  registerSkinDownloadHandler();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
