import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { type FSWatcher, watch } from "chokidar";
import type { IncomingFile, WatchConfig } from "./types";

export interface WatcherOptions {
  stabilityThreshold?: number;
  pollInterval?: number;
}

export class FolderWatcher {
  private watchers: FSWatcher[] = [];

  constructor(
    private onFile: (watchNodeId: string, file: IncomingFile) => void,
    private options: WatcherOptions = {},
    private onError?: (nodeId: string, err: Error) => void,
  ) {}

  watch(nodeId: string, cfg: WatchConfig): void {
    // Expand a leading ~ so hand-typed paths like ~/Downloads work.
    const root = cfg.path.startsWith("~")
      ? join(homedir(), cfg.path.slice(1))
      : cfg.path;
    const w = watch(root, {
      ignoreInitial: !cfg.scanExisting,
      depth: cfg.recursive ? undefined : 0,
      awaitWriteFinish: {
        stabilityThreshold: this.options.stabilityThreshold ?? 1500,
        pollInterval: this.options.pollInterval ?? 100,
      },
    });
    w.on("add", async (path: string) => {
      try {
        const s = await stat(path);
        this.onFile(nodeId, {
          path,
          name: basename(path),
          ext: extname(path).toLowerCase(),
          bytes: s.size,
          mtimeMs: s.mtimeMs,
          birthtimeMs: s.birthtimeMs || undefined,
        });
      } catch {
        // file vanished between event and stat — nothing to do
      }
    });
    if (cfg.includeFolders) {
      const resolvedRoot = resolve(root);
      w.on("addDir", async (path: string) => {
        // Only immediate children: never the watched root itself, and never
        // nested folders (moving those would fight the recursive file watch).
        if (
          resolve(path) === resolvedRoot ||
          resolve(dirname(path)) !== resolvedRoot
        ) {
          return;
        }
        try {
          const s = await stat(path);
          this.onFile(nodeId, {
            path,
            name: basename(path),
            ext: "",
            bytes: 0,
            mtimeMs: s.mtimeMs,
            birthtimeMs: s.birthtimeMs || undefined,
            isDirectory: true,
          });
        } catch {
          // folder vanished between event and stat — nothing to do
        }
      });
    }
    w.on("error", (err: unknown) => {
      // Consuming the 'error' event prevents an unhandled-error crash; forwarding
      // it (watched dir deleted, permission denied) makes the failure visible.
      this.onError?.(
        nodeId,
        err instanceof Error ? err : new Error(String(err)),
      );
    });
    this.watchers.push(w);
  }

  async close(): Promise<void> {
    await Promise.all(this.watchers.map((w) => w.close()));
    this.watchers = [];
  }
}
