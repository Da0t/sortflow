import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { previewPipeline } from "../src/preview";
import type { Pipeline } from "../src/types";

async function tempFiles(files: string[], subdirs: string[] = []) {
  const dir = await mkdtemp(join(tmpdir(), "sortflow-preview-"));
  for (const sub of subdirs) await mkdir(join(dir, sub), { recursive: true });
  for (const f of files) await writeFile(join(dir, f), "x", "utf8");
  return dir;
}

function chainPipeline(watchPath: string): Pipeline {
  return {
    nodes: [
      {
        id: "w1",
        kind: "watch",
        config: { path: watchPath, recursive: false },
        position: { x: 0, y: 0 },
      },
      {
        id: "f-png",
        kind: "filter",
        config: { extensions: [".png"] },
        position: { x: 1, y: 0 },
      },
      {
        id: "m-png",
        kind: "move",
        config: { destination: "~/Shots", auto: false },
        position: { x: 2, y: 0 },
      },
      {
        id: "f-pdf",
        kind: "filter",
        config: { extensions: [".pdf"] },
        position: { x: 1, y: 1 },
      },
      {
        id: "m-pdf",
        kind: "move",
        config: { destination: "~/Docs", auto: false },
        position: { x: 2, y: 1 },
      },
    ],
    edges: [
      { id: "e1", source: "w1", sourceHandle: "out", target: "f-png" },
      { id: "e2", source: "f-png", sourceHandle: "match", target: "m-png" },
      { id: "e3", source: "f-png", sourceHandle: "else", target: "f-pdf" },
      { id: "e4", source: "f-pdf", sourceHandle: "match", target: "m-pdf" },
    ],
  };
}

describe("previewPipeline", () => {
  it("counts files per move destination without moving anything", async () => {
    const dir = await tempFiles(["a.png", "b.png", "c.pdf", "d.txt"]);
    const preview = await previewPipeline(chainPipeline(dir));
    expect(preview.total).toBe(4);
    expect(preview.wouldMove).toBe(3);
    expect(preview.unmatched).toBe(1);
    expect(preview.needsClassify).toBe(0);
    expect(preview.truncated).toBe(false);
    expect(preview.buckets).toEqual([
      { moveNodeId: "m-png", destination: "~/Shots", count: 2 },
      { moveNodeId: "m-pdf", destination: "~/Docs", count: 1 },
    ]);
  });

  it("counts files reaching a classify node separately", async () => {
    const dir = await tempFiles(["a.png", "b.pdf"]);
    const pipeline: Pipeline = {
      nodes: [
        {
          id: "w1",
          kind: "watch",
          config: { path: dir, recursive: false },
          position: { x: 0, y: 0 },
        },
        {
          id: "c1",
          kind: "classify",
          config: { categories: ["Memes"], model: "llama3.2:3b" },
          position: { x: 1, y: 0 },
        },
      ],
      edges: [{ id: "e1", source: "w1", sourceHandle: "out", target: "c1" }],
    };
    const preview = await previewPipeline(pipeline);
    expect(preview.needsClassify).toBe(2);
    expect(preview.wouldMove).toBe(0);
    expect(preview.unmatched).toBe(0);
  });

  it("only descends into subfolders when the watch is recursive", async () => {
    const dir = await tempFiles(["top.png"], ["sub"]);
    await writeFile(join(dir, "sub", "nested.png"), "x", "utf8");

    const flat = await previewPipeline(chainPipeline(dir));
    expect(flat.total).toBe(1);

    const pipeline = chainPipeline(dir);
    pipeline.nodes[0].config = { path: dir, recursive: true };
    const deep = await previewPipeline(pipeline);
    expect(deep.total).toBe(2);
  });

  it("stops at maxFiles and reports truncation", async () => {
    const dir = await tempFiles(["a.png", "b.png", "c.png"]);
    const preview = await previewPipeline(chainPipeline(dir), { maxFiles: 2 });
    expect(preview.total).toBe(2);
    expect(preview.truncated).toBe(true);
  });

  it("expands ~ in the watch path via opts.home", async () => {
    const dir = await tempFiles(["a.png"]);
    const pipeline = chainPipeline("~/inbox");
    const preview = await previewPipeline(pipeline, {
      home: dir.replace(/\/$/, ""),
    });
    // ~/inbox does not exist under the temp home — no files, no crash.
    expect(preview.total).toBe(0);

    pipeline.nodes[0].config = { path: "~", recursive: false };
    const found = await previewPipeline(pipeline, { home: dir });
    expect(found.total).toBe(1);
  });

  it("returns an empty preview for an unreadable folder", async () => {
    const preview = await previewPipeline(
      chainPipeline("/definitely/not/a/real/folder"),
    );
    expect(preview).toMatchObject({ total: 0, wouldMove: 0, unmatched: 0 });
  });
});
