import { describe, expect, it } from "vitest";
import { edgeFrom, nodeById, validatePipeline } from "../src/graph";
import type { Pipeline } from "../src/types";

const valid: Pipeline = {
  nodes: [
    {
      id: "w1",
      kind: "watch",
      config: { path: "/tmp/in", recursive: false },
      position: { x: 0, y: 0 },
    },
    {
      id: "f1",
      kind: "filter",
      config: { extensions: [".pdf"] },
      position: { x: 200, y: 0 },
    },
    {
      id: "c1",
      kind: "classify",
      config: { categories: ["School", "Receipts"], model: "llama3.2:3b" },
      position: { x: 200, y: 150 },
    },
    {
      id: "m1",
      kind: "move",
      config: { destination: "~/Docs/PDFs", auto: false },
      position: { x: 400, y: 0 },
    },
    {
      id: "m2",
      kind: "move",
      config: { destination: "~/Docs/{category}", auto: false },
      position: { x: 400, y: 150 },
    },
  ],
  edges: [
    { id: "e1", source: "w1", sourceHandle: "out", target: "f1" },
    { id: "e2", source: "f1", sourceHandle: "match", target: "m1" },
    { id: "e3", source: "f1", sourceHandle: "else", target: "c1" },
    { id: "e4", source: "c1", sourceHandle: "School", target: "m2" },
  ],
};

describe("validatePipeline", () => {
  it("accepts a valid pipeline", () => {
    expect(validatePipeline(valid)).toEqual([]);
  });

  it("rejects duplicate node ids", () => {
    const p: Pipeline = { ...valid, nodes: [...valid.nodes, valid.nodes[0]] };
    expect(validatePipeline(p).join()).toContain("duplicate node id: w1");
  });

  it("rejects edges to unknown nodes", () => {
    const p: Pipeline = {
      ...valid,
      edges: [{ id: "x", source: "w1", sourceHandle: "out", target: "ghost" }],
    };
    expect(validatePipeline(p).join()).toContain("unknown target ghost");
  });

  it("rejects a source handle the node does not have", () => {
    const p: Pipeline = {
      ...valid,
      edges: [{ id: "x", source: "f1", sourceHandle: "banana", target: "m1" }],
    };
    expect(validatePipeline(p).join()).toContain("no output 'banana'");
  });

  it("rejects classify handles outside categories + unsure", () => {
    const p: Pipeline = {
      ...valid,
      edges: [{ id: "x", source: "c1", sourceHandle: "Taxes", target: "m2" }],
    };
    expect(validatePipeline(p).join()).toContain("no output 'Taxes'");
  });

  it("allows the implicit unsure handle on classify", () => {
    const p: Pipeline = {
      ...valid,
      edges: [
        ...valid.edges,
        { id: "x", source: "c1", sourceHandle: "unsure", target: "m1" },
      ],
    };
    expect(validatePipeline(p)).toEqual([]);
  });

  it("rejects two edges from the same handle", () => {
    const p: Pipeline = {
      ...valid,
      edges: [
        ...valid.edges,
        { id: "x", source: "w1", sourceHandle: "out", target: "c1" },
      ],
    };
    expect(validatePipeline(p).join()).toContain("multiple edges leave w1:out");
  });

  it("rejects edges into a watch node", () => {
    const p: Pipeline = {
      ...valid,
      edges: [
        ...valid.edges,
        { id: "x", source: "f1", sourceHandle: "else", target: "w1" },
      ],
    };
    expect(validatePipeline(p).length).toBeGreaterThan(0);
  });

  it("rejects a filter node whose regex namePattern is invalid", () => {
    const p: Pipeline = {
      ...valid,
      nodes: valid.nodes.map((n) =>
        n.id === "f1" ? { ...n, config: { namePattern: "[", regex: true } } : n,
      ),
    };
    expect(validatePipeline(p).join()).toContain("invalid regex '['");
  });

  it("accepts a valid regex namePattern", () => {
    const p: Pipeline = {
      ...valid,
      nodes: valid.nodes.map((n) =>
        n.id === "f1"
          ? { ...n, config: { namePattern: "^report.*\\.pdf$", regex: true } }
          : n,
      ),
    };
    expect(validatePipeline(p)).toEqual([]);
  });

  it("rejects cycles", () => {
    const p: Pipeline = {
      nodes: [
        { id: "f1", kind: "filter", config: {}, position: { x: 0, y: 0 } },
        { id: "f2", kind: "filter", config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: "e1", source: "f1", sourceHandle: "match", target: "f2" },
        { id: "e2", source: "f2", sourceHandle: "match", target: "f1" },
      ],
    };
    expect(validatePipeline(p).join()).toContain("cycle");
  });
});

describe("graph lookups", () => {
  it("edgeFrom finds the edge leaving a handle", () => {
    expect(edgeFrom(valid, "f1", "match")?.target).toBe("m1");
    expect(edgeFrom(valid, "f1", "nope")).toBeUndefined();
  });
  it("nodeById finds nodes", () => {
    expect(nodeById(valid, "c1")?.kind).toBe("classify");
  });
});
