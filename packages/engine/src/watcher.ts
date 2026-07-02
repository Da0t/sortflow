import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
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
    const w = watch(cfg.path, {
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
