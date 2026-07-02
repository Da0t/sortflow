import { join } from "node:path";
import { Engine, type Pipeline } from "@sortflow/engine";
import { BrowserWindow, app } from "electron";
import { loadPipeline, registerIpc } from "./ipc";

let win: BrowserWindow | null = null;
const updateBadge: (count: number) => void = () => {}; // becomes the tray badge in Task 18

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Sortflow",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.SORTFLOW_DEV) {
    void w.loadURL("http://localhost:5173");
  } else {
    void w.loadFile(join(process.resourcesPath, "ui", "index.html"));
  }
  return w;
}

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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
  });
});

// Keep running in the background when the window closes (tray app; Task 18 adds the tray icon).
app.on("window-all-closed", () => {
  /* do not quit */
});
