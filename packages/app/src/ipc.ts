import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import {
  Engine,
  OllamaGenerator,
  type Pipeline,
  type PipelineLibrary,
  detectWatchOverlaps,
  mergePipelines,
  previewPipeline,
  scanFolder,
  suggestPipeline,
  validatePipeline,
} from "@sortflow/engine";
import { type BrowserWindow, dialog, ipcMain } from "electron";

export function registerIpc(
  engine: Engine,
  library: PipelineLibrary,
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

  // Quiesce the old engine before swapping: drop its listeners so draining
  // moves can't emit onto stale handlers, then stop() (which drains the move
  // mutex) before the new engine takes over — running the merged graph of
  // every enabled pipeline in the library.
  const restartEngine = async () => {
    current.removeAllListeners();
    await current.stop();
    current = new Engine({ dataDir });
    wire(current);
    await current.start(mergePipelines(library.enabledPipelines()));
    onPending(pendingCount());
  };

  /** Enabled graphs with the active pipeline's graph replaced by `draft`. */
  const mergedWithDraft = (draft: Pipeline): Pipeline => {
    const { activeId, pipelines } = library.summary();
    const others = pipelines
      .filter((p) => p.enabled && p.id !== activeId)
      .flatMap((p) => {
        const record = library.get(p.id);
        return record ? [record.pipeline] : [];
      });
    return mergePipelines([draft, ...others]);
  };

  ipcMain.handle("pipeline:get", () => library.active().pipeline);

  ipcMain.handle("pipeline:set", async (_evt, pipeline: Pipeline) => {
    // Validate the merged graph so cross-pipeline conflicts surface too.
    const problems = validatePipeline(mergedWithDraft(pipeline));
    if (problems.length > 0) return { problems, warnings: [] };
    await library.savePipeline(library.summary().activeId, pipeline);
    await restartEngine();
    return { problems: [], warnings: detectWatchOverlaps(library.records()) };
  });

  ipcMain.handle("pipeline:preview", async (_evt, pipeline: Pipeline) => {
    const problems = validatePipeline(pipeline);
    if (problems.length > 0) return { problems };
    return { problems: [], preview: await previewPipeline(pipeline) };
  });

  ipcMain.handle(
    "pipeline:generate",
    async (_evt, description: string, destBase?: string, model?: string) => {
      // Ground the model in the user's real folder names so drafted
      // destinations reuse them instead of inventing new spellings.
      const home = os.homedir();
      const listDirs = async (p: string) => {
        try {
          return (await readdir(p, { withFileTypes: true }))
            .filter((d) => d.isDirectory() && !d.name.startsWith("."))
            .map((d) => d.name)
            .slice(0, 30);
        } catch {
          return [];
        }
      };
      const existingFolders: string[] = [];
      if (destBase) {
        const kids = await listDirs(destBase.replace(/^~/, home));
        if (kids.length > 0)
          existingFolders.push(`${destBase}: ${kids.join(", ")}`);
      }
      const homeKids = await listDirs(home);
      if (homeKids.length > 0)
        existingFolders.push(`~: ${homeKids.join(", ")}`);
      try {
        const pipeline = await new OllamaGenerator().generate(
          description,
          model ?? "llama3.2:3b",
          { destBase, existingFolders },
        );
        return { pipeline, error: null };
      } catch (err) {
        return {
          pipeline: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle("pipelines:list", () => library.summary());

  // Switching/creating carries the editor's unsaved graph as `draft` so tab
  // changes never lose work. Drafts are persisted but the running engine only
  // changes on Save & Apply, enable/disable, or delete.
  ipcMain.handle(
    "pipelines:setActive",
    async (_evt, id: string, draft?: Pipeline) => {
      if (draft) await library.savePipeline(library.summary().activeId, draft);
      const record = await library.setActive(id);
      return { state: library.summary(), pipeline: record.pipeline };
    },
  );

  ipcMain.handle("pipelines:create", async (_evt, draft?: Pipeline) => {
    if (draft) await library.savePipeline(library.summary().activeId, draft);
    // A new pipeline starts empty, so the running engine needs no restart.
    const record = await library.create();
    return { state: library.summary(), pipeline: record.pipeline };
  });

  ipcMain.handle("pipelines:rename", async (_evt, id: string, name: string) => {
    await library.rename(id, name);
    return library.summary();
  });

  ipcMain.handle("pipelines:delete", async (_evt, id: string) => {
    const wasEnabled = library.get(id)?.enabled ?? false;
    await library.remove(id);
    if (wasEnabled) {
      // Shrinking the merged graph is safe unless another stored draft is
      // invalid; in that case keep the old engine running untouched.
      const problems = validatePipeline(
        mergePipelines(library.enabledPipelines()),
      );
      if (problems.length === 0) await restartEngine();
    }
    return { state: library.summary(), pipeline: library.active().pipeline };
  });

  ipcMain.handle(
    "pipelines:setEnabled",
    async (_evt, id: string, enabled: boolean) => {
      await library.setEnabled(id, enabled);
      const problems = validatePipeline(
        mergePipelines(library.enabledPipelines()),
      );
      if (problems.length > 0) {
        // The stored draft can't run — revert so the toggle reflects reality.
        await library.setEnabled(id, !enabled);
        return { state: library.summary(), problems, warnings: [] };
      }
      await restartEngine();
      return {
        state: library.summary(),
        problems: [],
        warnings: detectWatchOverlaps(library.records()),
      };
    },
  );

  ipcMain.handle("proposals:list", () => current.listProposals());
  ipcMain.handle("proposals:approve", async (_evt, id: string) => {
    await current.approve(id);
    onPending(pendingCount());
  });
  ipcMain.handle("proposals:reject", async (_evt, id: string) => {
    await current.reject(id);
    onPending(pendingCount());
  });
  ipcMain.handle("proposals:restoreRejected", async () => {
    const count = await current.restoreRejected();
    onPending(pendingCount());
    return count;
  });
  ipcMain.handle("proposals:rename", (_evt, id: string, newName: string) =>
    current.renameProposal(id, newName),
  );
  ipcMain.handle("journal:list", () => current.listJournal());
  ipcMain.handle("journal:undo", (_evt, id: string) => current.undo(id));
  ipcMain.handle("journal:undoAll", () => current.undoAllDone());
  ipcMain.handle("streak:get", (_evt, moveNodeId: string) =>
    current.approvalStreak(moveNodeId),
  );

  ipcMain.handle(
    "autosetup:scan",
    async (_evt, dir: string, destBase?: string) => {
      const expanded = dir.startsWith("~")
        ? dir.replace(/^~/, os.homedir())
        : dir;
      const scan = await scanFolder(expanded);
      const pipeline = suggestPipeline(expanded, scan, { destBase });
      return { scan, pipeline };
    },
  );

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

  ipcMain.handle("fs:listFolders", async (_evt, path?: string) => {
    const base = (path ?? "~").replace(/^~/, os.homedir());
    try {
      const entries = await readdir(base, { withFileTypes: true });
      // Deliberately no per-child probe: reading INTO ~/Documents etc. at
      // launch would fire macOS permission prompts before the user touches
      // the feature. Every folder is treated as expandable; expanding an
      // empty one just shows "No subfolders".
      return entries
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => ({
          name: d.name,
          path: join(base, d.name),
          hasChildren: true,
        }))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
    } catch {
      return [];
    }
  });

  return { pendingCount };
}
