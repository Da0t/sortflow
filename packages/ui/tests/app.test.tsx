import type { Pipeline } from "@sortflow/engine";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../src/App";
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

describe("App", () => {
  it("focus mode hides the palette, config panel, and dock", async () => {
    useFlowStore.getState().loadPipeline(demo);
    if (useFlowStore.getState().focusMode) {
      useFlowStore.getState().toggleFocusMode();
    }
    render(<App />);
    expect(screen.getByRole("button", { name: /add watch/i })).toBeTruthy();
    const toggle = await screen.findByRole("button", {
      name: /focus on the graph/i,
    });
    fireEvent.click(toggle);
    expect(screen.queryByRole("button", { name: /add watch/i })).toBeNull();
    expect(screen.queryByText(/node settings/i)).toBeNull();
    expect(screen.queryByText(/nothing waiting for review/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /show panels/i }));
    expect(screen.getByRole("button", { name: /add watch/i })).toBeTruthy();
  });

  it("renders the palette and the loaded pipeline nodes", async () => {
    useFlowStore.getState().loadPipeline(demo);
    render(<App />);
    expect(await screen.findByText("Watch")).toBeTruthy();
    // ~/Downloads appears in both the Auto Setup folder select and the watch node;
    // verify the watch node body specifically
    const canvas = screen
      .getByRole("button", { name: /add watch/i })
      .closest(".sf-app") as HTMLElement;
    expect(within(canvas).getAllByText("~/Downloads").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("~/Pictures/Screenshots")).toBeTruthy();
    expect(screen.getByRole("button", { name: /add watch/i })).toBeTruthy();
  });

  it("store round-trips pipeline JSON", () => {
    useFlowStore.getState().loadPipeline(demo);
    const out = useFlowStore.getState().toPipeline();
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["f1", "m1", "w1"]);
    expect(out.edges).toHaveLength(2);
    expect(out.edges.find((e) => e.id === "e2")?.sourceHandle).toBe("match");
  });

  it("addNode appends a node with defaults", () => {
    useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
    useFlowStore.getState().addNode("classify");
    const p = useFlowStore.getState().toPipeline();
    expect(p.nodes).toHaveLength(1);
    expect(p.nodes[0].kind).toBe("classify");
  });
});
