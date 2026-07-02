import { readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import {
  Engine,
  type Pipeline,
  scanFolder,
  suggestPipeline,
  validatePipeline,
} from "@sortflow/engine";
import { type BrowserWindow, dialog, ipcMain } from "electron";

const EMPTY: Pipeline = { nodes: [], edges: [] };

export async function loadPipeline(dataDir: string): Promise<Pipeline> {
  try {
    return JSON.parse(
      await readFile(join(dataDir, "pipeline.json"), "utf8"),
    ) as Pipeline;
  } catch {
    return EMPTY;
  }
}

export function registerIpc(
  engine: Engine,
  dataDir: string,
  getWin: () => BrowserWindow | null,
  onPending: (count: number) => void = () => {},
): { pendingCount: () => number } {
  let current = engine;

  const pendingCount = () =>
    current.listProposals().filter((p) => p.status === "pending").length;
  const send = (channel: string, ...args: unknown[]) =>
    getWin()?.webContents.send(channel, ...args);
  const wire = (e: Engine) => {
    e.on("proposal", (p) => {
      send("engine:proposal", p);
      onPending(pendingCount());
    });
    e.on("executed", (p) => {
      send("engine:executed", p);
      onPending(pendingCount());
    });
    e.on("stuck", (p, message) => {
      send("engine:stuck", p, message);
      onPending(pendingCount());
    });
    e.on("nodeStatus", (nodeId, status, message) =>
      send("engine:nodeStatus", nodeId, status, message),
    );
  };
  wire(current);

  ipcMain.handle("pipeline:get", () => loadPipeline(dataDir));

  ipcMain.handle("pipeline:set", async (_evt, pipeline: Pipeline) => {
    const problems = validatePipeline(pipeline);
    if (problems.length > 0) return { problems };
    await writeFile(
      join(dataDir, "pipeline.json"),
      JSON.stringify(pipeline, null, 2),
      "utf8",
    );
    // Quiesce the old engine before swapping: drop its listeners so draining
    // moves can't emit onto stale handlers, then stop() (which drains the move
    // mutex) before the new engine takes over.
    current.removeAllListeners();
    await current.stop();
    current = new Engine({ dataDir });
    wire(current);
    await current.start(pipeline);
    onPending(pendingCount());
    return { problems: [] };
  });

  ipcMain.handle("proposals:list", () => current.listProposals());
  ipcMain.handle("proposals:approve", async (_evt, id: string) => {
    await current.approve(id);
    onPending(pendingCount());
  });
  ipcMain.handle("proposals:reject", async (_evt, id: string) => {
    await current.reject(id);
    onPending(pendingCount());
  });
  ipcMain.handle("journal:list", () => current.listJournal());
  ipcMain.handle("journal:undo", (_evt, id: string) => current.undo(id));
  ipcMain.handle("streak:get", (_evt, moveNodeId: string) =>
    current.approvalStreak(moveNodeId),
  );

  ipcMain.handle("autosetup:scan", async (_evt, dir: string) => {
    const expanded = dir.startsWith("~")
      ? dir.replace(/^~/, os.homedir())
      : dir;
    const scan = await scanFolder(expanded);
    const pipeline = suggestPipeline(expanded, scan);
    return { scan, pipeline };
  });

  ipcMain.handle("dialog:pickFolder", async (_evt, defaultPath?: string) => {
    const win = getWin();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      ...(defaultPath ? { defaultPath } : {}),
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("fs:isDirectory", async (_evt, path: string) => {
    try {
      return (await stat(path)).isDirectory();
    } catch {
      return false;
    }
  });

  return { pendingCount };
}
