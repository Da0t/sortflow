import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { matchesFilter } from "./filter";
import { edgeFrom, nodeById } from "./graph";
import type {
  FilterConfig,
  IncomingFile,
  MoveConfig,
  Pipeline,
  WatchConfig,
} from "./types";

/** Files one Move node would receive, keyed by its raw destination (tokens
 * like {fileYYYY} are left visible — expansion depends on each file). */
export interface PreviewBucket {
  moveNodeId: string;
  destination: string;
  count: number;
}

export interface PipelinePreview {
  /** Files examined across all watched folders. */
  total: number;
  /** Files that routed all the way to a Move node. */
  wouldMove: number;
  /** Files that reached an AI classify node — destination depends on the
   * category Ollama assigns, so they are counted rather than routed. */
  needsClassify: number;
  /** Files that matched no rule and would stay put. */
  unmatched: number;
  buckets: PreviewBucket[];
  /** True when the scan stopped at the file cap. */
  truncated: boolean;
}

const MAX_FILES = 2000;

async function listFiles(
  dir: string,
  recursive: boolean,
  cap: number,
): Promise<{ files: IncomingFile[]; truncated: boolean }> {
  const files: IncomingFile[] = [];
  const queue = [dir];
  let truncated = false;
  while (queue.length > 0) {
    if (files.length >= cap) {
      truncated = true;
      break;
    }
    const current = queue.shift() as string;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue; // unreadable folder — preview what we can
    }
    for (const entry of entries) {
      if (files.length >= cap) {
        truncated = true;
        break;
      }
      if (entry.name.startsWith(".")) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) queue.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const s = await stat(full);
        const dotIdx = entry.name.lastIndexOf(".");
        files.push({
          path: full,
          name: entry.name,
          ext: dotIdx > 0 ? entry.name.slice(dotIdx).toLowerCase() : "",
          bytes: s.size,
          mtimeMs: s.mtimeMs,
          birthtimeMs: s.birthtimeMs || undefined,
        });
      } catch {
        // File vanished mid-scan.
      }
    }
  }
  return { files, truncated };
}

/**
 * Dry-run: scan every watched folder and report where the pipeline WOULD
 * route each file, without moving anything or creating proposals. Classify
 * nodes are not resolved (that would need Ollama per file) — files reaching
 * one are reported under needsClassify instead.
 */
export async function previewPipeline(
  pipeline: Pipeline,
  opts: { home?: string; now?: () => number; maxFiles?: number } = {},
): Promise<PipelinePreview> {
  const home = opts.home ?? homedir();
  const now = opts.now ?? Date.now;
  const maxFiles = opts.maxFiles ?? MAX_FILES;

  let total = 0;
  let needsClassify = 0;
  let unmatched = 0;
  let truncated = false;
  const counts = new Map<string, number>();

  for (const watch of pipeline.nodes.filter((n) => n.kind === "watch")) {
    const cfg = watch.config as WatchConfig;
    const dir = cfg.path.replace(/^~/, home);
    const scan = await listFiles(dir, cfg.recursive, maxFiles);
    truncated = truncated || scan.truncated;

    for (const file of scan.files) {
      total++;
      let edge = edgeFrom(pipeline, watch.id, "out");
      let routed = false;
      while (edge) {
        const node = nodeById(pipeline, edge.target);
        if (!node) break;
        if (node.kind === "filter") {
          const handle = matchesFilter(file, node.config as FilterConfig, now())
            ? "match"
            : "else";
          edge = edgeFrom(pipeline, node.id, handle);
        } else if (node.kind === "classify") {
          needsClassify++;
          routed = true;
          break;
        } else if (node.kind === "move") {
          counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
          routed = true;
          break;
        } else {
          break;
        }
      }
      if (!routed) unmatched++;
    }
  }

  const buckets: PreviewBucket[] = [...counts]
    .map(([moveNodeId, count]) => ({
      moveNodeId,
      destination:
        (nodeById(pipeline, moveNodeId)?.config as MoveConfig)?.destination ??
        "?",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    wouldMove: buckets.reduce((sum, b) => sum + b.count, 0),
    needsClassify,
    unmatched,
    buckets,
    truncated,
  };
}
