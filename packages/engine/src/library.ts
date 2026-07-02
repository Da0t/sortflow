import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Pipeline } from "./types";

/** One saved pipeline in the library. */
export interface PipelineRecord {
  id: string;
  name: string;
  /** Enabled pipelines all run at once (merged into a single engine graph). */
  enabled: boolean;
  pipeline: Pipeline;
}

/** Lightweight view of a record for list UIs (no graph payload). */
export interface PipelineSummary {
  id: string;
  name: string;
  enabled: boolean;
}

/** What the pipeline switcher UI needs to render itself. */
export interface PipelineLibrarySummary {
  activeId: string;
  pipelines: PipelineSummary[];
}

interface LibraryFile {
  version: 1;
  activeId: string;
  pipelines: PipelineRecord[];
}

const EMPTY_PIPELINE: Pipeline = { nodes: [], edges: [] };

/** Concatenate several pipelines into one engine graph. Node ids are unique
 * across the library (they are generated per node, never copied), so the
 * merged graph validates like any hand-built multi-watch pipeline. */
export function mergePipelines(pipelines: Pipeline[]): Pipeline {
  return {
    nodes: pipelines.flatMap((p) => p.nodes),
    edges: pipelines.flatMap((p) => p.edges),
  };
}

/**
 * Warn when two enabled pipelines watch the same folder. The engine handles
 * the overlap safely (the first pending proposal for a file wins), but it
 * usually means duplicate rules the user forgot about.
 */
export function detectWatchOverlaps(
  records: PipelineRecord[],
  home = homedir(),
): string[] {
  const namesByPath = new Map<string, Set<string>>();
  for (const record of records) {
    if (!record.enabled) continue;
    for (const node of record.pipeline.nodes) {
      if (node.kind !== "watch") continue;
      const raw = (node.config as { path?: string }).path ?? "";
      if (!raw) continue;
      const path = raw.replace(/^~/, home).replace(/\/+$/, "");
      const names = namesByPath.get(path) ?? new Set();
      names.add(record.name);
      namesByPath.set(path, names);
    }
  }
  const warnings: string[] = [];
  for (const [path, names] of namesByPath) {
    if (names.size > 1) {
      warnings.push(
        `${[...names].map((n) => `"${n}"`).join(" and ")} both watch ${path} — whichever rule matches a file first wins`,
      );
    }
  }
  return warnings;
}

/**
 * Persistent library of named pipelines (pipelines.json). Exactly one is
 * "active" (open in the editor); any number can be enabled (running).
 * Every mutation persists to disk before returning.
 */
export class PipelineLibrary {
  private constructor(
    private filePath: string,
    private state: LibraryFile,
  ) {}

  /**
   * Load the library from `dataDir`, migrating a legacy single-pipeline
   * `pipeline.json` into the first record when no library file exists yet.
   * The library is never empty: a fresh install gets one empty pipeline.
   */
  static async load(dataDir: string): Promise<PipelineLibrary> {
    const filePath = join(dataDir, "pipelines.json");
    try {
      const state = JSON.parse(await readFile(filePath, "utf8")) as LibraryFile;
      if (state.pipelines.length === 0) {
        state.pipelines = [PipelineLibrary.freshRecord("My Pipeline")];
      }
      if (!state.pipelines.some((r) => r.id === state.activeId)) {
        state.activeId = state.pipelines[0].id;
      }
      return new PipelineLibrary(filePath, state);
    } catch {
      // No library yet — migrate the legacy single pipeline if present.
      let legacy = EMPTY_PIPELINE;
      try {
        legacy = JSON.parse(
          await readFile(join(dataDir, "pipeline.json"), "utf8"),
        ) as Pipeline;
      } catch {
        // Fresh install.
      }
      const record = PipelineLibrary.freshRecord("My Pipeline", legacy);
      const library = new PipelineLibrary(filePath, {
        version: 1,
        activeId: record.id,
        pipelines: [record],
      });
      await library.save();
      return library;
    }
  }

  private static freshRecord(
    name: string,
    pipeline: Pipeline = EMPTY_PIPELINE,
  ): PipelineRecord {
    return {
      id: randomUUID(),
      name,
      enabled: true,
      pipeline: structuredClone(pipeline),
    };
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  summary(): PipelineLibrarySummary {
    return {
      activeId: this.state.activeId,
      pipelines: this.state.pipelines.map(({ id, name, enabled }) => ({
        id,
        name,
        enabled,
      })),
    };
  }

  active(): PipelineRecord {
    const record = this.state.pipelines.find(
      (r) => r.id === this.state.activeId,
    );
    // load() guarantees activeId points at an existing record.
    return record as PipelineRecord;
  }

  get(id: string): PipelineRecord | undefined {
    return this.state.pipelines.find((r) => r.id === id);
  }

  /** Pipelines that should be running, in library order. */
  enabledPipelines(): Pipeline[] {
    return this.state.pipelines.filter((r) => r.enabled).map((r) => r.pipeline);
  }

  /** Snapshot of every record (for overlap checks and the like). */
  records(): PipelineRecord[] {
    return [...this.state.pipelines];
  }

  async setActive(id: string): Promise<PipelineRecord> {
    const record = this.get(id);
    if (!record) throw new Error(`unknown pipeline ${id}`);
    this.state.activeId = id;
    await this.save();
    return record;
  }

  /** Create a new empty pipeline, make it active, and return it. */
  async create(name?: string): Promise<PipelineRecord> {
    const record = PipelineLibrary.freshRecord(
      name?.trim() || `Pipeline ${this.state.pipelines.length + 1}`,
    );
    this.state.pipelines.push(record);
    this.state.activeId = record.id;
    await this.save();
    return record;
  }

  async rename(id: string, name: string): Promise<void> {
    const record = this.get(id);
    if (!record) throw new Error(`unknown pipeline ${id}`);
    const trimmed = name.trim();
    if (trimmed) record.name = trimmed;
    await this.save();
  }

  /** Persist a pipeline graph into its record (draft save — no run change). */
  async savePipeline(id: string, pipeline: Pipeline): Promise<void> {
    const record = this.get(id);
    if (!record) throw new Error(`unknown pipeline ${id}`);
    record.pipeline = pipeline;
    await this.save();
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const record = this.get(id);
    if (!record) throw new Error(`unknown pipeline ${id}`);
    record.enabled = enabled;
    await this.save();
  }

  /**
   * Delete a pipeline. The library never goes empty (a fresh record replaces
   * the last one) and the active id always stays valid.
   */
  async remove(id: string): Promise<void> {
    this.state.pipelines = this.state.pipelines.filter((r) => r.id !== id);
    if (this.state.pipelines.length === 0) {
      this.state.pipelines = [PipelineLibrary.freshRecord("My Pipeline")];
    }
    if (this.state.activeId === id) {
      this.state.activeId = this.state.pipelines[0].id;
    }
    await this.save();
  }
}
