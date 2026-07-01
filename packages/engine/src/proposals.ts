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
