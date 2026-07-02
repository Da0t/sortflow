import type { MoveConfig, Pipeline } from "@sortflow/engine";
import { describe, expect, it } from "vitest";
import { useFlowStore } from "../src/store";

const demo: Pipeline = {
  nodes: [
    {
      id: "w1",
      kind: "watch",
      config: { path: "~/Downloads", recursive: false },
      position: { x: 0, y: 0 },
    },
    {
      id: "f1",
      kind: "filter",
      config: { extensions: [".png"] },
      position: { x: 250, y: 0 },
    },
    {
      id: "m1",
      kind: "move",
      config: { destination: "~/Pictures/Screenshots", auto: false },
      position: { x: 500, y: 0 },
    },
  ],
  edges: [
    { id: "e1", source: "w1", sourceHandle: "out", target: "f1" },
    { id: "e2", source: "f1", sourceHandle: "match", target: "m1" },
  ],
};

describe("store: removeEdge", () => {
  it("removes exactly the target edge, leaving others intact", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().removeEdge("e1");
    const pipeline = useFlowStore.getState().toPipeline();
    expect(pipeline.edges).toHaveLength(1);
    expect(pipeline.edges[0].id).toBe("e2");
  });

  it("is a no-op when the edge id does not exist", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().removeEdge("nonexistent");
    const pipeline = useFlowStore.getState().toPipeline();
    expect(pipeline.edges).toHaveLength(2);
  });

  it("toPipeline reflects the removal", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().removeEdge("e2");
    const pipeline = useFlowStore.getState().toPipeline();
    expect(pipeline.edges.find((e) => e.id === "e2")).toBeUndefined();
  });
});

describe("store: dirty tracking", () => {
  it("edits mark the canvas dirty; loading a pipeline resets it", () => {
    useFlowStore.getState().loadPipeline(demo);
    expect(useFlowStore.getState().dirty).toBe(false);
    useFlowStore.getState().addNode("move");
    expect(useFlowStore.getState().dirty).toBe(true);
    useFlowStore.getState().loadPipeline(demo);
    expect(useFlowStore.getState().dirty).toBe(false);
    useFlowStore
      .getState()
      .updateConfig("m1", { destination: "~/Elsewhere", auto: false });
    expect(useFlowStore.getState().dirty).toBe(true);
  });
});

describe("store: replaceEdge", () => {
  it("rewires source/target/sourceHandle while keeping the same id", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().replaceEdge("e1", {
      source: "w1",
      sourceHandle: "out",
      target: "m1",
      targetHandle: null,
    });
    const pipeline = useFlowStore.getState().toPipeline();
    const edge = pipeline.edges.find((e) => e.id === "e1");
    expect(edge).toBeDefined();
    expect(edge?.source).toBe("w1");
    expect(edge?.target).toBe("m1");
    expect(edge?.sourceHandle).toBe("out");
  });

  it("keeps edge count the same after replaceEdge", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().replaceEdge("e2", {
      source: "w1",
      sourceHandle: "out",
      target: "m1",
      targetHandle: null,
    });
    const pipeline = useFlowStore.getState().toPipeline();
    expect(pipeline.edges).toHaveLength(2);
  });

  it("toPipeline reflects updated source and target", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().replaceEdge("e1", {
      source: "f1",
      sourceHandle: "match",
      target: "m1",
      targetHandle: null,
    });
    const pipeline = useFlowStore.getState().toPipeline();
    const edge = pipeline.edges.find((e) => e.id === "e1");
    expect(edge?.source).toBe("f1");
    expect(edge?.sourceHandle).toBe("match");
    expect(edge?.target).toBe("m1");
  });
});

describe("store: addNode overrides", () => {
  it("zero-arg call still uses default config", () => {
    useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
    useFlowStore.getState().addNode("move");
    const p = useFlowStore.getState().toPipeline();
    expect(p.nodes).toHaveLength(1);
    expect((p.nodes[0].config as MoveConfig).destination).toBe(
      "~/Documents/Sorted/{category}",
    );
  });

  it("overrides.config merges over defaults", () => {
    useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
    useFlowStore
      .getState()
      .addNode("move", { config: { destination: "/tmp/sorted", auto: false } });
    const p = useFlowStore.getState().toPipeline();
    expect((p.nodes[0].config as MoveConfig).destination).toBe("/tmp/sorted");
  });

  it("overrides.position replaces the default stagger position", () => {
    useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
    useFlowStore.getState().addNode("move", { position: { x: 999, y: 888 } });
    const p = useFlowStore.getState().toPipeline();
    expect(p.nodes[0].position).toEqual({ x: 999, y: 888 });
  });

  it("overrides.config does not affect a subsequent zero-arg addNode", () => {
    useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
    useFlowStore
      .getState()
      .addNode("move", { config: { destination: "/custom", auto: true } });
    useFlowStore.getState().addNode("move");
    const p = useFlowStore.getState().toPipeline();
    expect((p.nodes[1].config as MoveConfig).destination).toBe(
      "~/Documents/Sorted/{category}",
    );
  });
});

describe("store: removeNode", () => {
  it("removes the node and every edge connected to it", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().removeNode("f1");
    const pipeline = useFlowStore.getState().toPipeline();
    expect(pipeline.nodes.map((n) => n.id)).toEqual(["w1", "m1"]);
    expect(pipeline.edges).toHaveLength(0);
  });

  it("keeps unrelated edges intact", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().removeNode("m1");
    const pipeline = useFlowStore.getState().toPipeline();
    expect(pipeline.edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("clears the selection when the selected node is removed", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("f1");
    useFlowStore.getState().removeNode("f1");
    expect(useFlowStore.getState().selectedId).toBeNull();
  });

  it("preserves the selection when a different node is removed", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("w1");
    useFlowStore.getState().removeNode("f1");
    expect(useFlowStore.getState().selectedId).toBe("w1");
  });
});
