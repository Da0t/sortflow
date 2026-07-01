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

const draft = (moveNodeId = "m1") => ({
  filePath: "/in/a.txt",
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
});
