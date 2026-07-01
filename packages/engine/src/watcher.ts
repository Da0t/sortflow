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
  ) {}

  watch(nodeId: string, cfg: WatchConfig): void {
    const w = watch(cfg.path, {
      ignoreInitial: true,
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
        });
      } catch {
        // file vanished between event and stat — nothing to do
      }
    });
    this.watchers.push(w);
  }

  async close(): Promise<void> {
    await Promise.all(this.watchers.map((w) => w.close()));
    this.watchers = [];
  }
}
