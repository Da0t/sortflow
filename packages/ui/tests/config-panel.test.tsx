import type { MoveConfig, Pipeline } from "@sortflow/engine";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../src/bridge";
import { ConfigPanel } from "../src/panels/ConfigPanel";
import { useFlowStore } from "../src/store";

const demo: Pipeline = {
  nodes: [
    {
      id: "m1",
      kind: "move",
      config: { destination: "~/Docs", auto: false },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

describe("ConfigPanel", () => {
  it("shows a hint when nothing is selected", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected(null);
    render(<ConfigPanel />);
    expect(screen.getByText(/select a node/i)).toBeTruthy();
  });

  it("edits the selected move node config", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    const dest = screen.getByLabelText(/destination/i) as HTMLInputElement;
    expect(dest.value).toBe("~/Docs");
    fireEvent.change(dest, { target: { value: "~/Sorted/{category}" } });
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.destination).toBe("~/Sorted/{category}");
  });

  it("shows an error message when setPipeline rejects", async () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    vi.spyOn(api, "setPipeline").mockRejectedValueOnce(
      new Error("IPC channel closed"),
    );
    render(<ConfigPanel />);
    fireEvent.click(screen.getByText(/save & apply/i));
    expect(await screen.findByText(/IPC channel closed/i)).toBeTruthy();
    vi.restoreAllMocks();
  });
});
