import { join } from "node:path";
import { Engine, type Pipeline } from "@sortflow/engine";
import { BrowserWindow, app } from "electron";
import { loadPipeline, registerIpc } from "./ipc";
import { createTray } from "./tray";

let win: BrowserWindow | null = null;
let updateBadge: (count: number) => void = () => {};
let quitting = false;

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Sortflow",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.SORTFLOW_DEV) {
    void w.loadURL("http://localhost:5173");
  } else {
    void w.loadFile(join(process.resourcesPath, "ui", "index.html"));
  }
  w.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      w.hide();
    }
  });
  return w;
}

app.on("before-quit", () => {
  quitting = true;
});

app.whenReady().then(async () => {
  const dataDir = app.getPath("userData");
  const engine = new Engine({ dataDir });
  const pipeline: Pipeline = await loadPipeline(dataDir);
  registerIpc(
    engine,
    dataDir,
    () => win,
    (count) => updateBadge(count),
  );
  try {
    await engine.start(pipeline);
  } catch (err) {
    console.error("engine failed to start with saved pipeline:", err);
  }
  win = createWindow();
  const tray = createTray(() => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
    else win?.show();
  });
  updateBadge = (count) => tray.setTitle(count > 0 ? `⚑ ${count}` : "⚑");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
  });
});

// Keep running in the background when the window closes (tray app).
app.on("window-all-closed", () => {
  /* do not quit */
});
