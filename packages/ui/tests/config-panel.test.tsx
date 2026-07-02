import type { MoveConfig, Pipeline, WatchConfig } from "@sortflow/engine";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
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

describe("ConfigPanel: Browse button", () => {
  it("Browse button on Move node calls pickFolder and sets destination", async () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    const pickSpy = vi
      .spyOn(api, "pickFolder")
      .mockResolvedValue("/Users/demo/Picked");
    render(<ConfigPanel />);
    const browseBtn = screen.getByRole("button", { name: /browse/i });
    await act(async () => {
      fireEvent.click(browseBtn);
    });
    await screen.findByDisplayValue("/Users/demo/Picked");
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.destination).toBe("/Users/demo/Picked");
    pickSpy.mockRestore();
  });

  it("Browse cancel (pickFolder returns null) does not change destination", async () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    vi.spyOn(api, "pickFolder").mockResolvedValue(null);
    render(<ConfigPanel />);
    const browseBtn = screen.getByRole("button", { name: /browse/i });
    await act(async () => {
      fireEvent.click(browseBtn);
    });
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.destination).toBe("~/Docs");
    vi.restoreAllMocks();
  });
});

const watchDemo: Pipeline = {
  nodes: [
    {
      id: "w1",
      kind: "watch",
      config: { path: "~/Downloads", recursive: false, scanExisting: false },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

describe("ConfigPanel: watch node", () => {
  it("shows scanExisting checkbox for watch nodes", () => {
    useFlowStore.getState().loadPipeline(watchDemo);
    useFlowStore.getState().setSelected("w1");
    render(<ConfigPanel />);
    expect(
      screen.getByLabelText(/sort existing files when applied/i),
    ).toBeTruthy();
  });

  it("toggling scanExisting updates toPipeline() watch config", () => {
    useFlowStore.getState().loadPipeline(watchDemo);
    useFlowStore.getState().setSelected("w1");
    render(<ConfigPanel />);
    const cb = screen.getByLabelText(
      /sort existing files when applied/i,
    ) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as WatchConfig;
    expect(cfg.scanExisting).toBe(true);
  });
});

describe("ConfigPanel: destination chips", () => {
  // loadRecents() catches localStorage errors and returns [] — defaults always appear.
  it("renders default chips when no recents exist", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    expect(screen.getByRole("button", { name: /Documents/i })).toBeTruthy();
  });

  it("clicking a chip sets the destination", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    const chip = screen.getByRole("button", { name: /Documents/i });
    fireEvent.click(chip);
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.destination).toBe("~/Documents");
  });
});
