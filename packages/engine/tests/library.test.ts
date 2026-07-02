import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PipelineLibrary, mergePipelines } from "../src/library";
import type { Pipeline } from "../src/types";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "sortflow-library-"));
}

const demo: Pipeline = {
  nodes: [
    {
      id: "w1",
      kind: "watch",
      config: { path: "~/Downloads", recursive: false },
      position: { x: 0, y: 0 },
    },
    {
      id: "m1",
      kind: "move",
      config: { destination: "~/Sorted", auto: false },
      position: { x: 200, y: 0 },
    },
  ],
  edges: [{ id: "e1", source: "w1", sourceHandle: "out", target: "m1" }],
};

describe("mergePipelines", () => {
  it("concatenates nodes and edges of all pipelines", () => {
    const other: Pipeline = {
      nodes: [
        {
          id: "w2",
          kind: "watch",
          config: { path: "~/Desktop", recursive: false },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [],
    };
    const merged = mergePipelines([demo, other]);
    expect(merged.nodes.map((n) => n.id)).toEqual(["w1", "m1", "w2"]);
    expect(merged.edges).toHaveLength(1);
  });

  it("merges zero pipelines into an empty pipeline", () => {
    expect(mergePipelines([])).toEqual({ nodes: [], edges: [] });
  });
});

describe("PipelineLibrary", () => {
  it("creates a single empty enabled pipeline on a fresh install", async () => {
    const lib = await PipelineLibrary.load(await tempDir());
    const summary = lib.summary();
    expect(summary.pipelines).toHaveLength(1);
    expect(summary.pipelines[0].name).toBe("My Pipeline");
    expect(summary.pipelines[0].enabled).toBe(true);
    expect(summary.activeId).toBe(summary.pipelines[0].id);
    expect(lib.active().pipeline).toEqual({ nodes: [], edges: [] });
  });

  it("migrates a legacy pipeline.json into the first record", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "pipeline.json"), JSON.stringify(demo), "utf8");
    const lib = await PipelineLibrary.load(dir);
    expect(lib.active().pipeline).toEqual(demo);
    // Persisted: a reload sees the same library without the legacy file.
    const reloaded = await PipelineLibrary.load(dir);
    expect(reloaded.active().pipeline).toEqual(demo);
    expect(reloaded.summary().activeId).toBe(lib.summary().activeId);
  });

  it("creates, switches, renames, and persists across reloads", async () => {
    const dir = await tempDir();
    const lib = await PipelineLibrary.load(dir);
    const first = lib.active();
    const second = await lib.create();
    expect(second.name).toBe("Pipeline 2");
    expect(lib.summary().activeId).toBe(second.id);
    await lib.savePipeline(second.id, demo);
    await lib.rename(second.id, "Screenshots");
    await lib.setActive(first.id);
    const reloaded = await PipelineLibrary.load(dir);
    expect(reloaded.summary().activeId).toBe(first.id);
    const names = reloaded.summary().pipelines.map((p) => p.name);
    expect(names).toEqual(["My Pipeline", "Screenshots"]);
    expect(reloaded.get(second.id)?.pipeline).toEqual(demo);
  });

  it("ignores blank names on create and rename", async () => {
    const lib = await PipelineLibrary.load(await tempDir());
    const record = await lib.create("   ");
    expect(record.name).toBe("Pipeline 2");
    await lib.rename(record.id, "  ");
    expect(lib.get(record.id)?.name).toBe("Pipeline 2");
  });

  it("enabledPipelines returns only enabled graphs in order", async () => {
    const lib = await PipelineLibrary.load(await tempDir());
    const first = lib.active();
    await lib.savePipeline(first.id, demo);
    const second = await lib.create();
    await lib.setEnabled(first.id, false);
    expect(lib.enabledPipelines()).toEqual([second.pipeline]);
    await lib.setEnabled(first.id, true);
    expect(lib.enabledPipelines()).toEqual([demo, second.pipeline]);
  });

  it("removing the active pipeline activates the first remaining one", async () => {
    const lib = await PipelineLibrary.load(await tempDir());
    const first = lib.active();
    const second = await lib.create();
    await lib.remove(second.id);
    expect(lib.summary().activeId).toBe(first.id);
    expect(lib.summary().pipelines).toHaveLength(1);
  });

  it("removing the last pipeline leaves a fresh empty one", async () => {
    const dir = await tempDir();
    const lib = await PipelineLibrary.load(dir);
    const only = lib.active();
    await lib.savePipeline(only.id, demo);
    await lib.remove(only.id);
    const summary = lib.summary();
    expect(summary.pipelines).toHaveLength(1);
    expect(summary.pipelines[0].id).not.toBe(only.id);
    expect(lib.active().pipeline).toEqual({ nodes: [], edges: [] });
  });

  it("repairs a dangling activeId on load", async () => {
    const dir = await tempDir();
    const lib = await PipelineLibrary.load(dir);
    const raw = JSON.parse(
      await readFile(join(dir, "pipelines.json"), "utf8"),
    ) as { activeId: string };
    raw.activeId = "gone";
    await writeFile(
      join(dir, "pipelines.json"),
      JSON.stringify({ ...raw, activeId: "gone" }),
      "utf8",
    );
    const reloaded = await PipelineLibrary.load(dir);
    const summary = reloaded.summary();
    expect(summary.activeId).toBe(summary.pipelines[0].id);
  });

  it("throws on mutations against unknown ids", async () => {
    const lib = await PipelineLibrary.load(await tempDir());
    await expect(lib.setActive("nope")).rejects.toThrow(/unknown pipeline/);
    await expect(lib.rename("nope", "x")).rejects.toThrow(/unknown pipeline/);
    await expect(
      lib.savePipeline("nope", { nodes: [], edges: [] }),
    ).rejects.toThrow(/unknown pipeline/);
    await expect(lib.setEnabled("nope", true)).rejects.toThrow(
      /unknown pipeline/,
    );
  });
});
