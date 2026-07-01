import { describe, expect, it } from "vitest";
import { routeFile } from "../src/route";
import type { IncomingFile, Pipeline } from "../src/types";

const pipeline: Pipeline = {
  nodes: [
    {
      id: "w1",
      kind: "watch",
      config: { path: "/in", recursive: false },
      position: { x: 0, y: 0 },
    },
    {
      id: "f1",
      kind: "filter",
      config: { extensions: [".png"] },
      position: { x: 0, y: 0 },
    },
    {
      id: "c1",
      kind: "classify",
      config: { categories: ["School", "Receipts"], model: "m" },
      position: { x: 0, y: 0 },
    },
    {
      id: "mShots",
      kind: "move",
      config: { destination: "~/Pictures/Screenshots", auto: false },
      position: { x: 0, y: 0 },
    },
    {
      id: "mSchool",
      kind: "move",
      config: { destination: "~/Docs/School", auto: false },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [
    { id: "e1", source: "w1", sourceHandle: "out", target: "f1" },
    { id: "e2", source: "f1", sourceHandle: "match", target: "mShots" },
    { id: "e3", source: "f1", sourceHandle: "else", target: "c1" },
    { id: "e4", source: "c1", sourceHandle: "School", target: "mSchool" },
  ],
};

const png: IncomingFile = {
  path: "/in/shot.png",
  name: "shot.png",
  ext: ".png",
  bytes: 10,
  mtimeMs: 0,
};
const pdf: IncomingFile = {
  path: "/in/hw.pdf",
  name: "hw.pdf",
  ext: ".pdf",
  bytes: 10,
  mtimeMs: 0,
};

const classifyAs = (answer: string) => async () => answer;

describe("routeFile", () => {
  it("routes through filter match to a move node", async () => {
    const r = await routeFile(pipeline, "w1", png, classifyAs("School"), 0);
    expect(r).toEqual({
      moveNodeId: "mShots",
      nodePath: ["w1", "f1", "mShots"],
      category: undefined,
    });
  });

  it("routes filter else into classify and takes the category edge", async () => {
    const r = await routeFile(pipeline, "w1", pdf, classifyAs("School"), 0);
    expect(r.moveNodeId).toBe("mSchool");
    expect(r.category).toBe("School");
    expect(r.nodePath).toEqual(["w1", "f1", "c1", "mSchool"]);
  });

  it("dead-ends when the taken handle has no edge (Receipts unwired)", async () => {
    const r = await routeFile(pipeline, "w1", pdf, classifyAs("Receipts"), 0);
    expect(r.moveNodeId).toBeNull();
    expect(r.category).toBe("Receipts");
  });

  it("dead-ends on unsure with no unsure edge, category stays undefined", async () => {
    const r = await routeFile(pipeline, "w1", pdf, classifyAs("unsure"), 0);
    expect(r.moveNodeId).toBeNull();
    expect(r.category).toBeUndefined();
  });

  it("dead-ends when the watch node has no outgoing edge", async () => {
    const lonely: Pipeline = { nodes: [pipeline.nodes[0]], edges: [] };
    const r = await routeFile(lonely, "w1", png, classifyAs("School"), 0);
    expect(r).toEqual({
      moveNodeId: null,
      nodePath: ["w1"],
      category: undefined,
    });
  });
});
