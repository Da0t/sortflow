import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Classifier } from "../src/classify";
import { Engine } from "../src/engine";
import type { Pipeline, Proposal } from "../src/types";

const FAST = { stabilityThreshold: 200, pollInterval: 50 };
let engine: Engine | undefined;

afterEach(async () => {
  await engine?.stop();
  engine = undefined;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup(auto: boolean) {
  const root = await mkdtemp(join(tmpdir(), "sortflow-engine-"));
  const inbox = join(root, "inbox");
  const dest = join(root, "sorted");
  await mkdir(inbox, { recursive: true });
  const pipeline: Pipeline = {
    nodes: [
      {
        id: "w1",
        kind: "watch",
        config: { path: inbox, recursive: false },
        position: { x: 0, y: 0 },
      },
      {
        id: "f1",
        kind: "filter",
        config: { extensions: [".txt"] },
        position: { x: 0, y: 0 },
      },
      {
        id: "m1",
        kind: "move",
        config: { destination: dest, auto },
        position: { x: 0, y: 0 },
      },
    ],
    edges: [
      { id: "e1", source: "w1", sourceHandle: "out", target: "f1" },
      { id: "e2", source: "f1", sourceHandle: "match", target: "m1" },
    ],
  };
  const neverClassify: Classifier = {
    classify: async () => {
      throw new Error("classifier must not be called for this pipeline");
    },
  };
  engine = new Engine({
    dataDir: join(root, "data"),
    classifier: neverClassify,
    watcherOptions: FAST,
  });
  return { root, inbox, dest, pipeline, engine };
}

function nextProposal(e: Engine): Promise<Proposal> {
  return new Promise((resolve) => e.once("proposal", resolve));
}

describe("Engine", () => {
  it("rejects an invalid pipeline at start", async () => {
    const { engine, pipeline } = await setup(false);
    const bad: Pipeline = {
      ...pipeline,
      edges: [{ id: "x", source: "w1", sourceHandle: "nope", target: "f1" }],
    };
    await expect(engine.start(bad)).rejects.toThrow(/invalid pipeline/);
  });

  it("proposes, then approve executes the move and undo restores it", async () => {
    const { inbox, dest, pipeline, engine } = await setup(false);
    await engine.start(pipeline);
    await sleep(300);

    const proposalP = nextProposal(engine);
    await writeFile(join(inbox, "note.txt"), "hi");
    const proposal = await proposalP;

    expect(proposal.status).toBe("pending");
    expect(proposal.destDir).toBe(dest);
    expect(proposal.routeNodeIds).toEqual(["w1", "f1", "m1"]);
    expect(existsSync(join(inbox, "note.txt"))).toBe(true); // review-first: not moved yet

    await engine.approve(proposal.id);
    expect(existsSync(join(dest, "note.txt"))).toBe(true);
    expect(engine.listProposals()[0].status).toBe("executed");

    await engine.undo(proposal.id);
    expect(existsSync(join(inbox, "note.txt"))).toBe(true);
  }, 15_000);

  it("auto move nodes execute without approval and emit executed", async () => {
    const { inbox, dest, pipeline, engine } = await setup(true);
    await engine.start(pipeline);
    await sleep(300);

    const executed = new Promise<void>((resolve) =>
      engine.once("executed", () => resolve()),
    );
    await writeFile(join(inbox, "auto.txt"), "zoom");
    await executed;

    expect(existsSync(join(dest, "auto.txt"))).toBe(true);
    expect(engine.listProposals()[0].status).toBe("executed");
  }, 15_000);

  it("serializes concurrent approvals so no move ever overwrites another", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-concurrent-"));
    const srcA = join(root, "a");
    const srcB = join(root, "b");
    const dest = join(root, "dest");
    await mkdir(srcA, { recursive: true });
    await mkdir(srcB, { recursive: true });
    await writeFile(join(srcA, "x.txt"), "AAA");
    await writeFile(join(srcB, "x.txt"), "BBB");

    engine = new Engine({ dataDir: join(root, "data") });
    const add = (from: string) =>
      engine?.proposalStore.add(
        {
          filePath: from,
          fileName: "x.txt",
          destDir: dest,
          moveNodeId: "m1",
          routeNodeIds: [],
        },
        1,
      );
    const p1 = await add(join(srcA, "x.txt"));
    const p2 = await add(join(srcB, "x.txt"));

    // Both approved at once. Without serialization both compute "x.txt" as the
    // unique destination and the second move overwrites the first (data loss).
    await Promise.all([
      engine.approve((p1 as { id: string }).id),
      engine.approve((p2 as { id: string }).id),
    ]);

    const names = (await readdir(dest)).sort();
    expect(names).toEqual(["x (1).txt", "x.txt"]);
    const contents = new Set(
      await Promise.all(names.map((n) => readFile(join(dest, n), "utf8"))),
    );
    expect(contents).toEqual(new Set(["AAA", "BBB"]));
  }, 15_000);

  it("non-matching files dead-end untouched", async () => {
    const { inbox, pipeline, engine } = await setup(false);
    await engine.start(pipeline);
    await sleep(300);

    await writeFile(join(inbox, "photo.jpg"), "x");
    await sleep(800);

    expect(engine.listProposals()).toHaveLength(0);
    expect(existsSync(join(inbox, "photo.jpg"))).toBe(true);
  }, 15_000);
});
