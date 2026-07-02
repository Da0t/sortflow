import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProposalStore } from "../src/proposals";

async function store(): Promise<{ s: ProposalStore; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), "sortflow-props-"));
  const file = join(dir, "sub", "proposals.json");
  const s = new ProposalStore(file);
  await s.load();
  return { s, file };
}

const draft = (moveNodeId = "m1", filePath = "/in/a.txt") => ({
  filePath,
  fileName: "a.txt",
  destDir: "/out",
  moveNodeId,
  routeNodeIds: ["w1", "m1"],
});

describe("ProposalStore", () => {
  it("adds pending proposals with generated ids", async () => {
    const { s } = await store();
    const p = await s.add(draft(), 100);
    expect(p.status).toBe("pending");
    expect(p.createdAt).toBe(100);
    expect(p.id).toBeTruthy();
    expect(s.list()).toHaveLength(1);
  });

  it("persists across load", async () => {
    const { s, file } = await store();
    await s.add(draft(), 100);
    const s2 = new ProposalStore(file);
    await s2.load();
    expect(s2.list()).toHaveLength(1);
  });

  it("setStatus updates and records errors; unknown id throws", async () => {
    const { s } = await store();
    const p = await s.add(draft(), 100);
    await s.setStatus(p.id, "failed", "disk full");
    expect(s.get(p.id)?.error).toBe("disk full");
    await expect(s.setStatus("ghost", "approved")).rejects.toThrow(
      /unknown proposal/,
    );
  });

  it("approvalStreak counts consecutive approvals newest-first and stops at a rejection", async () => {
    const { s } = await store();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await s.add(draft(), i)).id);
    await s.setStatus(ids[0], "executed");
    await s.setStatus(ids[1], "rejected");
    await s.setStatus(ids[2], "approved");
    await s.setStatus(ids[3], "executed");
    // ids[4] stays pending — skipped
    expect(s.approvalStreak("m1")).toBe(2); // ids[3], ids[2], then rejection at ids[1]
    expect(s.approvalStreak("other")).toBe(0);
  });

  it("restoreRejected flips only rejected proposals back to pending", async () => {
    const { s, file } = await store();
    const a = await s.add(draft("m1", "/in/a.txt"), 1);
    const b = await s.add(draft("m1", "/in/b.txt"), 2);
    const c = await s.add(draft("m1", "/in/c.txt"), 3);
    await s.setStatus(a.id, "rejected");
    await s.setStatus(b.id, "rejected");
    await s.setStatus(c.id, "executed");
    expect(await s.restoreRejected()).toBe(2);
    const statuses = s.list().map((p) => p.status);
    expect(statuses.filter((st) => st === "pending")).toHaveLength(2);
    expect(statuses).toContain("executed");
    // Persisted: a reload sees the restored proposals as pending.
    const reloaded = new ProposalStore(file);
    await reloaded.load();
    expect(reloaded.list().filter((p) => p.status === "pending")).toHaveLength(
      2,
    );
    // Nothing rejected left — a second restore is a no-op.
    expect(await s.restoreRejected()).toBe(0);
  });

  it("restoreRejected drops rejected duplicates of files already pending", async () => {
    const { s } = await store();
    // File was proposed, rejected, then re-proposed by a scanExisting sweep.
    const old = await s.add(draft("m1", "/in/x.txt"), 1);
    await s.setStatus(old.id, "rejected");
    await s.add(draft("m1", "/in/x.txt"), 2); // the fresh pending one
    const lone = await s.add(draft("m1", "/in/y.txt"), 3);
    await s.setStatus(lone.id, "rejected");
    expect(await s.restoreRejected()).toBe(1); // only y.txt restored
    const pendingPaths = s
      .list()
      .filter((p) => p.status === "pending")
      .map((p) => p.filePath)
      .sort();
    expect(pendingPaths).toEqual(["/in/x.txt", "/in/y.txt"]); // no duplicates
    expect(s.list().filter((p) => p.status === "rejected")).toHaveLength(0);
  });

  it("prunePendingDuplicates keeps only the newest pending per file", async () => {
    const { s } = await store();
    await s.add(draft("m1", "/in/x.txt"), 1);
    const newer = await s.add(draft("m2", "/in/x.txt"), 5);
    const executed = await s.add(draft("m1", "/in/x.txt"), 3);
    await s.setStatus(executed.id, "executed");
    await s.add(draft("m1", "/in/y.txt"), 2);
    expect(await s.prunePendingDuplicates()).toBe(1);
    const pending = s.list().filter((p) => p.status === "pending");
    expect(pending).toHaveLength(2);
    expect(pending.find((p) => p.filePath === "/in/x.txt")?.id).toBe(newer.id);
    // Non-pending records are untouched.
    expect(s.list().filter((p) => p.status === "executed")).toHaveLength(1);
    expect(await s.prunePendingDuplicates()).toBe(0);
  });

  it("update patches the proposal and persists across reload", async () => {
    const { s, file } = await store();
    const p = await s.add(draft(), 100);
    await s.update(p.id, { targetName: "renamed.txt" });
    expect(s.get(p.id)?.targetName).toBe("renamed.txt");

    // persists
    const s2 = new ProposalStore(file);
    await s2.load();
    expect(s2.get(p.id)?.targetName).toBe("renamed.txt");
  });

  it("update on unknown id throws", async () => {
    const { s } = await store();
    await expect(s.update("ghost", { targetName: "x.txt" })).rejects.toThrow(
      /unknown proposal/,
    );
  });
});

describe("ProposalStore: rename", () => {
  it("sets targetName on a pending proposal and persists it", async () => {
    const { s, file } = await store();
    const p = await s.add(draft(), 100);
    const renamed = await s.rename(p.id, "better name.txt");
    expect(renamed.targetName).toBe("better name.txt");
    expect(renamed.fileName).toBe("a.txt"); // original name untouched
    const s2 = new ProposalStore(file);
    await s2.load();
    expect(s2.get(p.id)?.targetName).toBe("better name.txt");
  });

  it("trims surrounding whitespace", async () => {
    const { s } = await store();
    const p = await s.add(draft(), 100);
    const renamed = await s.rename(p.id, "  spaced.txt  ");
    expect(renamed.targetName).toBe("spaced.txt");
  });

  it("rejects empty, dot, and path-traversal names", async () => {
    const { s } = await store();
    const p = await s.add(draft(), 100);
    await expect(s.rename(p.id, "")).rejects.toThrow(/invalid file name/);
    await expect(s.rename(p.id, "   ")).rejects.toThrow(/invalid file name/);
    await expect(s.rename(p.id, ".")).rejects.toThrow(/invalid file name/);
    await expect(s.rename(p.id, "..")).rejects.toThrow(/invalid file name/);
    await expect(s.rename(p.id, "a/b.txt")).rejects.toThrow(
      /invalid file name/,
    );
    await expect(s.rename(p.id, "a\\b.txt")).rejects.toThrow(
      /invalid file name/,
    );
  });

  it("refuses to rename a non-pending proposal", async () => {
    const { s } = await store();
    const p = await s.add(draft(), 100);
    await s.setStatus(p.id, "executed");
    await expect(s.rename(p.id, "late.txt")).rejects.toThrow(/executed/);
  });

  it("throws for an unknown id", async () => {
    const { s } = await store();
    await expect(s.rename("nope", "x.txt")).rejects.toThrow(/unknown/);
  });
});
