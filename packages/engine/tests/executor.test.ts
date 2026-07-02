import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MoveFailedError, executeMove, undoMove } from "../src/executor";
import { Journal } from "../src/journal";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "sortflow-exec-"));
  const src = join(dir, "in");
  const dst = join(dir, "out");
  await mkdir(src, { recursive: true });
  const journal = new Journal(join(dir, "journal.jsonl"));
  const from = join(src, "a.txt");
  await writeFile(from, "hello");
  return { dir, src, dst, journal, from };
}

describe("executeMove", () => {
  it("moves the file, journaling intent then done", async () => {
    const { dst, journal, from } = await setup();
    const done = await executeMove(
      { id: "j1", from, toDir: dst, moveNodeId: "m1" },
      journal,
    );
    expect(done.status).toBe("done");
    expect(existsSync(from)).toBe(false);
    expect(await readFile(done.to, "utf8")).toBe("hello");
    const statuses = (await journal.readAll()).map((e) => e.status);
    expect(statuses).toEqual(["intent", "done"]);
  });

  it("suffixes on collision instead of overwriting", async () => {
    const { dst, journal, from } = await setup();
    await mkdir(dst, { recursive: true });
    await writeFile(join(dst, "a.txt"), "existing");
    const done = await executeMove(
      { id: "j1", from, toDir: dst, moveNodeId: "m1" },
      journal,
    );
    expect(done.to).toBe(join(dst, "a (1).txt"));
    expect(await readFile(join(dst, "a.txt"), "utf8")).toBe("existing");
  });

  it("retries retryable errors then succeeds", async () => {
    const { dst, journal, from } = await setup();
    let calls = 0;
    const flaky = async (f: string, t: string) => {
      calls++;
      if (calls < 3) {
        const err = new Error("busy") as NodeJS.ErrnoException;
        err.code = "EBUSY";
        throw err;
      }
      const { rename } = await import("node:fs/promises");
      await rename(f, t);
    };
    const done = await executeMove(
      { id: "j1", from, toDir: dst, moveNodeId: "m1" },
      journal,
      {
        renameFn: flaky,
        backoffMs: 1,
      },
    );
    expect(done.status).toBe("done");
    expect(calls).toBe(3);
  });

  it("journals failed and throws MoveFailedError on permanent errors", async () => {
    const { dst, journal, from } = await setup();
    const broken = async () => {
      const err = new Error("nope") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    };
    await expect(
      executeMove({ id: "j1", from, toDir: dst, moveNodeId: "m1" }, journal, {
        renameFn: broken,
      }),
    ).rejects.toBeInstanceOf(MoveFailedError);
    const statuses = (await journal.readAll()).map((e) => e.status);
    expect(statuses).toEqual(["intent", "failed"]);
  });
});

describe("undoMove", () => {
  it("moves the file back and journals undone", async () => {
    const { dst, journal, from } = await setup();
    const done = await executeMove(
      { id: "j1", from, toDir: dst, moveNodeId: "m1" },
      journal,
    );
    const undone = await undoMove("j1", journal);
    expect(undone.status).toBe("undone");
    expect(existsSync(from)).toBe(true);
    expect(existsSync(done.to)).toBe(false);
  });

  it("refuses to undo entries that are not done", async () => {
    const { journal } = await setup();
    await expect(undoMove("ghost", journal)).rejects.toThrow(/cannot undo/);
  });

  it("recreates a deleted source directory when undoing", async () => {
    const { src, dst, journal, from } = await setup();
    const done = await executeMove(
      { id: "j1", from, toDir: dst, moveNodeId: "m1" },
      journal,
    );
    await rm(src, { recursive: true, force: true }); // original dir is gone
    const undone = await undoMove("j1", journal);
    expect(undone.status).toBe("undone");
    expect(existsSync(from)).toBe(true); // dir recreated, file restored
    expect(existsSync(done.to)).toBe(false);
  });
});

describe("executeMove: targetName", () => {
  it("targetName overrides the source basename for the destination", async () => {
    const { dst, journal, from } = await setup();
    const done = await executeMove(
      {
        id: "j1",
        from,
        toDir: dst,
        moveNodeId: "m1",
        targetName: "renamed.txt",
      },
      journal,
    );
    expect(done.status).toBe("done");
    expect(done.to).toBe(join(dst, "renamed.txt"));
    expect(existsSync(from)).toBe(false);
  });

  it("targetName collision gets suffixed", async () => {
    const { dst, journal, from } = await setup();
    await mkdir(dst, { recursive: true });
    await writeFile(join(dst, "renamed.txt"), "existing");
    const done = await executeMove(
      {
        id: "j1",
        from,
        toDir: dst,
        moveNodeId: "m1",
        targetName: "renamed.txt",
      },
      journal,
    );
    expect(done.to).toBe(join(dst, "renamed (1).txt"));
  });
});
