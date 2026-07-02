import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, parse } from "node:path";
import { type Classifier, OllamaClassifier } from "./classify";
import { MoveFailedError, executeMove, undoMove } from "./executor";
import { nodeById, validatePipeline } from "./graph";
import { Journal } from "./journal";
import { expandDestination, expandRename } from "./move";
import { ProposalStore } from "./proposals";
import { ClassifyQueue } from "./queue";
import { routeFile } from "./route";
import type {
  IncomingFile,
  JournalEntry,
  MoveConfig,
  Pipeline,
  Proposal,
  WatchConfig,
} from "./types";
import { FolderWatcher, type WatcherOptions } from "./watcher";

export interface EngineOptions {
  dataDir: string;
  classifier?: Classifier;
  watcherOptions?: WatcherOptions;
  cooldownMs?: number;
  now?: () => number;
}

export type NodeStatusLevel = "ok" | "warning" | "error";

export class Engine extends EventEmitter {
  readonly journal: Journal;
  readonly proposalStore: ProposalStore;
  private classifier: Classifier;
  private queue: ClassifyQueue;
  private watcher: FolderWatcher;
  private pipeline: Pipeline = { nodes: [], edges: [] };
  private now: () => number;
  /** Serializes every file move (approve + undo) so two moves can never run
   * concurrently and race the unique-destination check into an overwrite. */
  private moveChain: Promise<unknown> = Promise.resolve();
  /** Set by stop(); drops watcher work that arrives during a hot-swap. */
  private stopped = false;

  constructor(opts: EngineOptions) {
    super();
    this.now = opts.now ?? Date.now;
    this.journal = new Journal(join(opts.dataDir, "journal.jsonl"));
    this.proposalStore = new ProposalStore(
      join(opts.dataDir, "proposals.json"),
    );
    this.classifier = opts.classifier ?? new OllamaClassifier();
    this.queue = new ClassifyQueue(this.classifier, opts.cooldownMs ?? 2000);
    this.watcher = new FolderWatcher(
      (nodeId, file) => {
        void this.handleFile(nodeId, file);
      },
      opts.watcherOptions,
      (nodeId, err) => {
        this.emit("nodeStatus", nodeId, "error", err.message);
      },
    );
  }

  async start(pipeline: Pipeline): Promise<void> {
    const problems = validatePipeline(pipeline);
    if (problems.length > 0)
      throw new Error(`invalid pipeline: ${problems.join("; ")}`);
    this.pipeline = pipeline;
    await this.journal.reconcile(this.now());
    await this.proposalStore.load();
    // Heal duplicate pending proposals (e.g. a rejected batch re-proposed by
    // a scanExisting sweep, then restored) — a file may only be queued once.
    await this.proposalStore.prunePendingDuplicates();
    // Destinations are frozen at proposal time; re-align pending proposals
    // with the pipeline that is actually about to run.
    await this.refreshPendingProposals();
    for (const node of pipeline.nodes) {
      if (node.kind === "watch")
        this.watcher.watch(node.id, node.config as WatchConfig);
    }
    await this.reportClassifierHealth();
  }

  private async reportClassifierHealth(): Promise<void> {
    const classifyNodes = this.pipeline.nodes.filter(
      (n) => n.kind === "classify",
    );
    if (classifyNodes.length === 0) return;
    const ok =
      this.classifier instanceof OllamaClassifier
        ? await this.classifier.ping()
        : true;
    for (const node of classifyNodes) {
      this.emit(
        "nodeStatus",
        node.id,
        ok ? "ok" : "warning",
        ok ? undefined : "Ollama unreachable — files will route to unsure",
      );
    }
  }

  /**
   * Re-align pending proposals with the current pipeline. Destinations are
   * expanded when a proposal is created, so a pipeline edit (e.g. re-pointing
   * every Move node at ~/Desktop) must update what an approval will execute.
   * Pending proposals whose move node vanished or whose file is gone are
   * dropped — the watcher re-proposes them under the current rules.
   */
  private async refreshPendingProposals(): Promise<void> {
    for (const p of this.proposalStore.list()) {
      if (p.status !== "pending") continue;
      const moveNode = nodeById(this.pipeline, p.moveNodeId);
      let fileStat: Stats | undefined;
      try {
        fileStat = await stat(p.filePath);
      } catch {
        // File is no longer where the proposal expects it.
      }
      if (!moveNode || !fileStat) {
        await this.proposalStore.remove(p.id);
        continue;
      }
      const cfg = moveNode.config as MoveConfig;
      if (cfg.destination.includes("{category}") && p.category === undefined) {
        continue; // legacy record — the category cannot be re-resolved
      }
      const destDir = expandDestination(cfg.destination, {
        category: p.category,
        date: new Date(this.now()),
        ext: extname(p.fileName).toLowerCase(),
        home: homedir(),
        fileDate: new Date(fileStat.birthtimeMs || fileStat.mtimeMs),
      });
      if (destDir !== p.destDir) {
        await this.proposalStore.update(p.id, { destDir });
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.watcher.close();
    // Drain any in-flight move so a hot-swap does not leave a move executing
    // against a discarded engine. moveChain never rejects (see runExclusive).
    await this.moveChain;
  }

  /** Runs a move exclusively: waits for any in-flight move (success or failure)
   * before starting, so file moves are strictly serialized within one Engine. */
  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.moveChain.then(() => task());
    // Keep the chain alive regardless of this task's outcome.
    this.moveChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async handleFile(
    watchNodeId: string,
    file: IncomingFile,
  ): Promise<void> {
    if (this.stopped) return;
    try {
      const route = await routeFile(
        this.pipeline,
        watchNodeId,
        file,
        (f, cfg) => this.queue.enqueue(f, cfg),
        this.now(),
      );
      if (!route.moveNodeId) return;
      const moveNode = nodeById(this.pipeline, route.moveNodeId);
      if (!moveNode) return;
      const cfg = moveNode.config as MoveConfig;
      const destDir = expandDestination(cfg.destination, {
        category: route.category,
        date: new Date(this.now()),
        ext: file.ext,
        home: homedir(),
        fileDate: new Date(file.birthtimeMs ?? file.mtimeMs),
      });
      // Duplicate-proposal guard: skip if a pending proposal already exists
      // for this file (e.g. engine restart re-scans with scanExisting: true).
      const alreadyPending = this.proposalStore
        .list()
        .some((p) => p.filePath === file.path && p.status === "pending");
      if (alreadyPending) return;
      // Optional automatic rename: expand the move node's pattern into a new
      // stem, keeping the file's original extension.
      let targetName: string | undefined;
      if (cfg.renamePattern) {
        const parsed = parse(file.name);
        targetName =
          expandRename(cfg.renamePattern, {
            stem: parsed.name,
            fileDate: new Date(file.birthtimeMs ?? file.mtimeMs),
            moveDate: new Date(this.now()),
          }) + parsed.ext;
      }
      const proposal = await this.proposalStore.add(
        {
          filePath: file.path,
          fileName: file.name,
          destDir,
          targetName,
          category: route.category,
          moveNodeId: route.moveNodeId,
          routeNodeIds: route.nodePath,
        },
        this.now(),
      );
      this.emit("proposal", proposal);
      // Folders are never auto-executed: moving a whole directory is
      // higher-stakes than one file, so it always goes through review.
      if (cfg.auto && !file.isDirectory) await this.approve(proposal.id);
    } catch (err) {
      // A routing failure (e.g. a bad user-typed regex that slipped past
      // validation) must never become an unhandled rejection that kills the
      // process — surface it on the originating watch node instead.
      const message = err instanceof Error ? err.message : String(err);
      this.emit("nodeStatus", watchNodeId, "error", message);
    }
  }

  async approve(proposalId: string): Promise<void> {
    const p = this.proposalStore.get(proposalId);
    if (!p || p.status !== "pending") return;
    await this.proposalStore.setStatus(proposalId, "approved");
    try {
      const entry = await this.runExclusive(() =>
        executeMove(
          {
            id: proposalId,
            from: p.filePath,
            toDir: p.destDir,
            moveNodeId: p.moveNodeId,
            targetName: p.targetName,
          },
          this.journal,
          { now: this.now },
        ),
      );
      await this.proposalStore.setStatus(proposalId, "executed");
      this.emit(
        "executed",
        this.proposalStore.get(proposalId) as Proposal,
        entry,
      );
    } catch (err) {
      const message =
        err instanceof MoveFailedError ? err.message : String(err);
      await this.proposalStore.setStatus(proposalId, "failed", message);
      this.emit(
        "stuck",
        this.proposalStore.get(proposalId) as Proposal,
        message,
      );
    }
  }

  async reject(proposalId: string): Promise<void> {
    await this.proposalStore.setStatus(proposalId, "rejected");
  }

  /** Bring every rejected proposal back to pending for another look. */
  async restoreRejected(): Promise<number> {
    return this.proposalStore.restoreRejected();
  }

  /**
   * Change the file name a pending proposal will move the file to.
   * Forgiving by design: illegal characters are stripped, the original
   * extension is always preserved, and non-pending proposals are left
   * untouched (the tray may race an auto-approve).
   */
  async renameProposal(
    proposalId: string,
    newName: string,
  ): Promise<Proposal | undefined> {
    const p = this.proposalStore.get(proposalId);
    if (!p || p.status !== "pending") return p;
    const ext = extname(p.fileName);
    let stem = newName.replace(/[/\\:*?"<>|]/g, "").trim();
    if (ext && stem.toLowerCase().endsWith(ext.toLowerCase())) {
      stem = stem.slice(0, -ext.length);
    } else {
      const typedExt = extname(stem);
      if (typedExt) stem = stem.slice(0, -typedExt.length);
    }
    stem = stem.replace(/^\.+/, "").trim();
    if (!stem) return p;
    return this.proposalStore.rename(proposalId, stem + ext);
  }

  async undo(journalEntryId: string): Promise<JournalEntry> {
    return this.runExclusive(() =>
      undoMove(journalEntryId, this.journal, { now: this.now }),
    );
  }

  /** Undo every completed move in the journal, newest first. Moves that can
   * no longer be reversed (file renamed or deleted by hand) are skipped.
   * Returns how many were undone. */
  async undoAllDone(): Promise<number> {
    const entries = [...(await this.journal.latestById()).values()]
      .filter((e) => e.status === "done")
      .sort((a, b) => b.ts - a.ts);
    let undone = 0;
    for (const entry of entries) {
      try {
        await this.undo(entry.id);
        undone++;
      } catch {
        // Skip and keep going — partial recovery beats none.
      }
    }
    return undone;
  }

  listProposals(): Proposal[] {
    return this.proposalStore.list();
  }

  async listJournal(): Promise<JournalEntry[]> {
    return [...(await this.journal.latestById()).values()];
  }

  approvalStreak(moveNodeId: string): number {
    return this.proposalStore.approvalStreak(moveNodeId);
  }
}
