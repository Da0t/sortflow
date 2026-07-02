import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Classifier } from "../src/classify";
import { Engine } from "../src/engine";
import { ProposalStore } from "../src/proposals";
import type {
  FilterConfig,
  IncomingFile,
  Pipeline,
  Proposal,
} from "../src/types";

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

  it("folders become proposals but never auto-execute; approve moves the whole folder", async () => {
    const { inbox, dest } = await setup(true);
    if (!engine) throw new Error("setup failed");
    const p: Pipeline = {
      nodes: [
        {
          id: "w1",
          kind: "watch",
          config: { path: inbox, recursive: false, includeFolders: true },
          position: { x: 0, y: 0 },
        },
        {
          id: "m1",
          kind: "move",
          config: { destination: dest, auto: true },
          position: { x: 1, y: 0 },
        },
      ],
      edges: [{ id: "e1", source: "w1", sourceHandle: "out", target: "m1" }],
    };
    await engine.start(p);
    await sleep(300);

    const next = nextProposal(engine);
    await mkdir(join(inbox, "Trip Photos"));
    await writeFile(join(inbox, "Trip Photos", "pic.txt"), "x");
    const proposal = await next;

    expect(proposal.fileName).toBe("Trip Photos");
    expect(proposal.destDir).toBe(dest);
    // The move node is automatic, but folders always wait for review.
    await sleep(400);
    expect(
      engine.listProposals().find((q) => q.id === proposal.id)?.status,
    ).toBe("pending");
    expect(existsSync(join(inbox, "Trip Photos"))).toBe(true);

    await engine.approve(proposal.id);
    expect(existsSync(join(dest, "Trip Photos", "pic.txt"))).toBe(true);

    await engine.undo(proposal.id);
    expect(existsSync(join(inbox, "Trip Photos", "pic.txt"))).toBe(true);
  }, 15_000);

  it("re-points pending proposals at the current pipeline on start", async () => {
    const { root, inbox, dest, pipeline } = await setup(false);
    if (!engine) throw new Error("setup failed");
    await engine.start(pipeline);
    await sleep(300);

    const next = nextProposal(engine);
    await writeFile(join(inbox, "note.txt"), "hi");
    const proposal = await next;
    expect(proposal.destDir).toBe(dest);
    await engine.stop();

    // The user re-points the Move node (e.g. at Desktop) and re-applies:
    // the pending proposal must follow the pipeline, not stay frozen.
    const newDest = join(root, "desktop-sorted");
    const repointed: Pipeline = {
      ...pipeline,
      nodes: pipeline.nodes.map((n) =>
        n.kind === "move"
          ? { ...n, config: { destination: newDest, auto: false } }
          : n,
      ),
    };
    engine = new Engine({ dataDir: join(root, "data"), watcherOptions: FAST });
    await engine.start(repointed);
    const pending = engine
      .listProposals()
      .filter((p) => p.status === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].destDir).toBe(newDest);

    // A pending proposal whose move node vanished is dropped entirely.
    await engine.stop();
    const watchOnly: Pipeline = {
      nodes: pipeline.nodes.filter((n) => n.kind === "watch"),
      edges: [],
    };
    engine = new Engine({ dataDir: join(root, "data"), watcherOptions: FAST });
    await engine.start(watchOnly);
    expect(
      engine.listProposals().filter((p) => p.status === "pending"),
    ).toHaveLength(0);
  }, 15_000);

  it("moveManually journals a manual move that undo can reverse", async () => {
    const { inbox, dest, pipeline } = await setup(false);
    if (!engine) throw new Error("setup failed");
    await engine.start(pipeline);
    await writeFile(join(inbox, "manual.txt"), "x");

    const entry = await engine.moveManually(join(inbox, "manual.txt"), dest);
    expect(entry.status).toBe("done");
    expect(entry.moveNodeId).toBe("manual");
    expect(existsSync(join(dest, "manual.txt"))).toBe(true);

    await engine.undo(entry.id);
    expect(existsSync(join(inbox, "manual.txt"))).toBe(true);
  }, 15_000);

  it("undoAllDone reverses every completed move", async () => {
    const { inbox, dest, pipeline, engine } = await setup(false);
    await engine.start(pipeline);
    await sleep(300);

    let next = nextProposal(engine);
    await writeFile(join(inbox, "one.txt"), "1");
    const p1 = await next;
    next = nextProposal(engine);
    await writeFile(join(inbox, "two.txt"), "2");
    const p2 = await next;

    await engine.approve(p1.id);
    await engine.approve(p2.id);
    expect(existsSync(join(dest, "one.txt"))).toBe(true);
    expect(existsSync(join(dest, "two.txt"))).toBe(true);

    expect(await engine.undoAllDone()).toBe(2);
    expect(existsSync(join(inbox, "one.txt"))).toBe(true);
    expect(existsSync(join(inbox, "two.txt"))).toBe(true);
    // Nothing left to undo.
    expect(await engine.undoAllDone()).toBe(0);
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

  it("a routing error surfaces as nodeStatus error instead of crashing", async () => {
    const { inbox, pipeline, engine } = await setup(false);
    await engine.start(pipeline); // valid glob filter passes validation
    await sleep(300);

    // Corrupt the live filter into an invalid regex, simulating a bad config
    // that slipped past validation (the engine holds the pipeline by reference).
    const f1 = pipeline.nodes.find((n) => n.id === "f1");
    const cfg = (f1 as { config: FilterConfig }).config;
    cfg.regex = true;
    cfg.namePattern = "[";

    const errored = new Promise<{ id: string; level: string }>((resolve) => {
      engine.on("nodeStatus", (id: string, level: string) => {
        if (level === "error") resolve({ id, level });
      });
    });
    const file: IncomingFile = {
      path: join(inbox, "note.txt"),
      name: "note.txt",
      ext: ".txt",
      bytes: 1,
      mtimeMs: 0,
    };
    await (
      engine as unknown as {
        handleFile(id: string, f: IncomingFile): Promise<void>;
      }
    ).handleFile("w1", file);

    const evt = await errored;
    expect(evt.id).toBe("w1");
    expect(evt.level).toBe("error");
    expect(engine.listProposals()).toHaveLength(0);
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

  it("fileYYYY token produces a 4-digit-year folder in the proposal", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-filedate-"));
    const inbox = join(root, "inbox");
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
          config: { destination: join(root, "{fileYYYY}"), auto: false },
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
        throw new Error("no classify");
      },
    };
    engine = new Engine({
      dataDir: join(root, "data"),
      classifier: neverClassify,
      watcherOptions: FAST,
    });
    await engine.start(pipeline);
    await sleep(300);

    const proposalP = nextProposal(engine);
    await writeFile(join(inbox, "file.txt"), "hi");
    const proposal = await proposalP;

    // destDir should end with a 4-digit year (e.g. /tmp/.../2026)
    expect(/\d{4}$/.test(proposal.destDir)).toBe(true);
  }, 15_000);

  it("scanExisting: 2 pre-existing files produce 2 proposals without new arrivals", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-scan-"));
    const inbox = join(root, "inbox");
    const dest = join(root, "sorted");
    await mkdir(inbox, { recursive: true });
    await writeFile(join(inbox, "a.txt"), "aaa");
    await writeFile(join(inbox, "b.txt"), "bbb");

    const pipeline: Pipeline = {
      nodes: [
        {
          id: "w1",
          kind: "watch",
          config: { path: inbox, recursive: false, scanExisting: true },
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
          config: { destination: dest, auto: false },
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
        throw new Error("no classify");
      },
    };
    engine = new Engine({
      dataDir: join(root, "data"),
      classifier: neverClassify,
      watcherOptions: FAST,
    });
    await engine.start(pipeline);
    await sleep(800);

    const proposals = engine.listProposals();
    expect(proposals).toHaveLength(2);
    expect(proposals.every((p) => p.status === "pending")).toBe(true);
  }, 15_000);

  it("scanExisting: restart engine does not duplicate pending proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-dedup-"));
    const inbox = join(root, "inbox");
    const dest = join(root, "sorted");
    await mkdir(inbox, { recursive: true });
    await writeFile(join(inbox, "file.txt"), "content");

    const pipeline: Pipeline = {
      nodes: [
        {
          id: "w1",
          kind: "watch",
          config: { path: inbox, recursive: false, scanExisting: true },
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
          config: { destination: dest, auto: false },
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
        throw new Error("no classify");
      },
    };

    // First engine run — creates one proposal
    engine = new Engine({
      dataDir: join(root, "data"),
      classifier: neverClassify,
      watcherOptions: FAST,
    });
    await engine.start(pipeline);
    await sleep(800);
    expect(engine.listProposals()).toHaveLength(1);
    await engine.stop();

    // Second engine run on same dataDir — must not add a duplicate
    engine = new Engine({
      dataDir: join(root, "data"),
      classifier: neverClassify,
      watcherOptions: FAST,
    });
    await engine.start(pipeline);
    await sleep(800);

    expect(engine.listProposals()).toHaveLength(1);
  }, 15_000);
});

describe("Engine: renamePattern", () => {
  it("proposal.targetName contains expanded pattern + original extension", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-pattern-"));
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
          config: {
            destination: dest,
            auto: false,
            renamePattern: "{fileYYYY}-{fileMM} {name}",
          },
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
        throw new Error("no classify");
      },
    };
    engine = new Engine({
      dataDir: join(root, "data"),
      classifier: neverClassify,
      watcherOptions: FAST,
      now: () => new Date(2026, 6, 1).getTime(),
    });
    await engine.start(pipeline);
    await sleep(300);

    const proposalP = nextProposal(engine);
    await writeFile(join(inbox, "report.txt"), "hi");
    const proposal = await proposalP;

    // targetName should be "YYYY-MM report.txt"
    expect(proposal.targetName).toMatch(/^\d{4}-\d{2} report\.txt$/);
  }, 15_000);

  it("after approve, file exists at dest under the targetName", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-approve-"));
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
          config: {
            destination: dest,
            auto: false,
            renamePattern: "archived-{name}",
          },
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
        throw new Error("no classify");
      },
    };
    engine = new Engine({
      dataDir: join(root, "data"),
      classifier: neverClassify,
      watcherOptions: FAST,
    });
    await engine.start(pipeline);
    await sleep(300);

    const proposalP = nextProposal(engine);
    await writeFile(join(inbox, "note.txt"), "hello");
    const proposal = await proposalP;

    expect(proposal.targetName).toBe("archived-note.txt");
    await engine.approve(proposal.id);
    expect(existsSync(join(dest, "archived-note.txt"))).toBe(true);
    expect(existsSync(join(inbox, "note.txt"))).toBe(false);
  }, 15_000);
});

describe("Engine: renameProposal", () => {
  it("renames a pending proposal and persists across store reload", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-proposal-"));
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
          config: { destination: dest, auto: false },
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
        throw new Error("no classify");
      },
    };
    engine = new Engine({
      dataDir: join(root, "data"),
      classifier: neverClassify,
      watcherOptions: FAST,
    });
    await engine.start(pipeline);
    await sleep(300);

    const proposalP = nextProposal(engine);
    await writeFile(join(inbox, "note.txt"), "content");
    const proposal = await proposalP;

    await engine.renameProposal(proposal.id, "new-name.txt");
    expect(
      engine.listProposals().find((p) => p.id === proposal.id)?.targetName,
    ).toBe("new-name.txt");

    // persists: reload the store from disk
    const store2 = new ProposalStore(join(root, "data", "proposals.json"));
    await store2.load();
    expect(store2.get(proposal.id)?.targetName).toBe("new-name.txt");
  }, 15_000);

  it("renameProposal strips illegal chars and preserves original extension", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-sanitize-"));
    engine = new Engine({ dataDir: join(root, "data") });
    const p = await engine.proposalStore.add(
      {
        filePath: "/in/report.pdf",
        fileName: "report.pdf",
        destDir: "/out",
        moveNodeId: "m1",
        routeNodeIds: [],
      },
      1,
    );
    // illegal chars stripped; extension forced back to .pdf
    await engine.renameProposal(p.id, "my/file.docx");
    expect(engine.listProposals().find((x) => x.id === p.id)?.targetName).toBe(
      "myfile.pdf",
    );
  }, 15_000);

  it("renameProposal no-ops on non-pending proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-noop-"));
    engine = new Engine({ dataDir: join(root, "data") });
    const p = await engine.proposalStore.add(
      {
        filePath: "/in/note.txt",
        fileName: "note.txt",
        destDir: "/out",
        moveNodeId: "m1",
        routeNodeIds: [],
      },
      1,
    );
    await engine.proposalStore.setStatus(p.id, "executed");
    await engine.renameProposal(p.id, "changed.txt"); // should be silently ignored
    expect(
      engine.listProposals().find((x) => x.id === p.id)?.targetName,
    ).toBeUndefined();
  }, 15_000);

  it("after renameProposal then approve, file moves under new name", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "sortflow-rename-approve-manual-"),
    );
    const src = join(root, "in");
    const dest = join(root, "out");
    await mkdir(src, { recursive: true });
    await writeFile(join(src, "note.txt"), "hello");

    engine = new Engine({ dataDir: join(root, "data") });
    const p = await engine.proposalStore.add(
      {
        filePath: join(src, "note.txt"),
        fileName: "note.txt",
        destDir: dest,
        moveNodeId: "m1",
        routeNodeIds: [],
      },
      1,
    );
    await engine.renameProposal(p.id, "renamed.txt");
    await engine.approve(p.id);
    expect(existsSync(join(dest, "renamed.txt"))).toBe(true);
    expect(existsSync(join(src, "note.txt"))).toBe(false);
  }, 15_000);
});
