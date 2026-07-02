import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Proposal, ProposalStatus } from "./types";

export class ProposalStore {
  private items: Proposal[] = [];

  constructor(private filePath: string) {}

  async load(): Promise<void> {
    try {
      this.items = JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as Proposal[];
    } catch {
      this.items = [];
    }
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.items, null, 2), "utf8");
  }

  list(): Proposal[] {
    return [...this.items];
  }

  get(id: string): Proposal | undefined {
    return this.items.find((p) => p.id === id);
  }

  async add(
    p: Omit<Proposal, "id" | "createdAt" | "status">,
    now: number,
  ): Promise<Proposal> {
    const proposal: Proposal = {
      ...p,
      id: randomUUID(),
      createdAt: now,
      status: "pending",
    };
    this.items.push(proposal);
    await this.save();
    return proposal;
  }

  async setStatus(
    id: string,
    status: ProposalStatus,
    error?: string,
  ): Promise<void> {
    const p = this.get(id);
    if (!p) throw new Error(`unknown proposal ${id}`);
    p.status = status;
    if (error !== undefined) p.error = error;
    await this.save();
  }

  /** Delete a proposal record entirely (stale-pending cleanup). */
  async remove(id: string): Promise<void> {
    const before = this.items.length;
    this.items = this.items.filter((p) => p.id !== id);
    if (this.items.length !== before) await this.save();
  }

  /** Flip every rejected proposal back to pending — the rescue path for a
   * bulk mis-rejection. A rejected proposal whose file is already queued
   * (e.g. re-proposed by a scanExisting sweep after the rejection) is
   * dropped instead of restored, so a file never ends up pending twice.
   * Returns how many were restored. */
  async restoreRejected(): Promise<number> {
    const pendingPaths = new Set(
      this.items.filter((p) => p.status === "pending").map((p) => p.filePath),
    );
    let restored = 0;
    let dropped = 0;
    const kept: Proposal[] = [];
    for (const p of this.items) {
      if (p.status === "rejected") {
        if (pendingPaths.has(p.filePath)) {
          dropped++;
          continue;
        }
        p.status = "pending";
        pendingPaths.add(p.filePath);
        restored++;
      }
      kept.push(p);
    }
    this.items = kept;
    if (restored > 0 || dropped > 0) await this.save();
    return restored;
  }

  /** Remove redundant pending proposals that point at the same file, keeping
   * the newest (it reflects the current pipeline's routing). Approving two
   * would move the file once and fail once. Returns how many were removed. */
  async prunePendingDuplicates(): Promise<number> {
    const newestByPath = new Map<string, Proposal>();
    for (const p of this.items) {
      if (p.status !== "pending") continue;
      const seen = newestByPath.get(p.filePath);
      if (!seen || p.createdAt > seen.createdAt) {
        newestByPath.set(p.filePath, p);
      }
    }
    const before = this.items.length;
    this.items = this.items.filter(
      (p) => p.status !== "pending" || newestByPath.get(p.filePath) === p,
    );
    const removed = before - this.items.length;
    if (removed > 0) await this.save();
    return removed;
  }

  /**
   * Rename a pending proposal's target file name. The file on disk is not
   * touched; the new name takes effect when the proposal is approved.
   */
  async rename(id: string, newName: string): Promise<Proposal> {
    const name = newName.trim();
    if (!name || name === "." || name === ".." || /[/\\]/.test(name)) {
      throw new Error(`invalid file name: ${JSON.stringify(newName)}`);
    }
    const p = this.get(id);
    if (!p) throw new Error(`unknown proposal ${id}`);
    if (p.status !== "pending") {
      throw new Error(`cannot rename ${id}: proposal is ${p.status}`);
    }
    p.targetName = name;
    await this.save();
    return p;
  }

  async update(id: string, patch: Partial<Proposal>): Promise<void> {
    const p = this.get(id);
    if (!p) throw new Error(`unknown proposal ${id}`);
    Object.assign(p, patch);
    await this.save();
  }

  /** Consecutive approved/executed for a move node, newest first, broken by a rejection. */
  approvalStreak(moveNodeId: string): number {
    const decided = this.items
      .filter(
        (p) =>
          p.moveNodeId === moveNodeId &&
          p.status !== "pending" &&
          p.status !== "failed",
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    let streak = 0;
    for (const p of decided) {
      if (p.status === "rejected") break;
      streak++;
    }
    return streak;
  }
}
