import type { Pipeline } from "@sortflow/engine";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/bridge";
import { PipelineTabs } from "../src/panels/PipelineTabs";
import { useFlowStore } from "../src/store";

const demo: Pipeline = {
  nodes: [
    {
      id: "w1",
      kind: "watch",
      config: { path: "~/Downloads", recursive: false },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

const EMPTY: Pipeline = { nodes: [], edges: [] };

const TWO = {
  activeId: "p1",
  pipelines: [
    { id: "p1", name: "My Pipeline", enabled: true },
    { id: "p2", name: "Screenshots", enabled: false },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PipelineTabs", () => {
  it("renders one tab per pipeline", async () => {
    vi.spyOn(api, "listPipelines").mockResolvedValue(TWO);
    render(<PipelineTabs />);
    expect(await screen.findByText("My Pipeline")).toBeTruthy();
    expect(screen.getByText("Screenshots")).toBeTruthy();
  });

  it("switching tabs stashes the canvas as a draft and loads the target", async () => {
    useFlowStore.getState().loadPipeline(demo);
    vi.spyOn(api, "listPipelines").mockResolvedValue(TWO);
    const spy = vi.spyOn(api, "switchPipeline").mockResolvedValue({
      state: { ...TWO, activeId: "p2" },
      pipeline: EMPTY,
    });
    render(<PipelineTabs />);
    fireEvent.click(await screen.findByText("Screenshots"));
    await screen.findByRole("tab", { name: "Screenshots", selected: true });
    expect(spy).toHaveBeenCalledWith(
      "p2",
      expect.objectContaining({
        nodes: [expect.objectContaining({ id: "w1" })],
      }),
    );
    expect(useFlowStore.getState().nodes).toHaveLength(0);
  });

  it("clicking the active tab does nothing", async () => {
    vi.spyOn(api, "listPipelines").mockResolvedValue(TWO);
    const spy = vi.spyOn(api, "switchPipeline");
    render(<PipelineTabs />);
    fireEvent.click(await screen.findByText("My Pipeline"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("creates a new pipeline and loads its empty canvas", async () => {
    useFlowStore.getState().loadPipeline(demo);
    vi.spyOn(api, "listPipelines").mockResolvedValue(TWO);
    vi.spyOn(api, "createPipeline").mockResolvedValue({
      state: {
        activeId: "p3",
        pipelines: [
          ...TWO.pipelines,
          { id: "p3", name: "Pipeline 3", enabled: true },
        ],
      },
      pipeline: EMPTY,
    });
    render(<PipelineTabs />);
    await screen.findByText("My Pipeline");
    fireEvent.click(screen.getByRole("button", { name: /new pipeline/i }));
    expect(await screen.findByText("Pipeline 3")).toBeTruthy();
    expect(useFlowStore.getState().nodes).toHaveLength(0);
  });

  it("renames via double-click and Enter", async () => {
    vi.spyOn(api, "listPipelines").mockResolvedValue(TWO);
    const spy = vi.spyOn(api, "renamePipeline").mockResolvedValue({
      ...TWO,
      pipelines: [
        { id: "p1", name: "Downloads", enabled: true },
        TWO.pipelines[1],
      ],
    });
    render(<PipelineTabs />);
    fireEvent.doubleClick(await screen.findByText("My Pipeline"));
    const input = screen.getByLabelText(/pipeline name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Downloads" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("Downloads")).toBeTruthy();
    expect(spy).toHaveBeenCalledWith("p1", "Downloads");
  });

  it("toggles a pipeline on and surfaces validation problems", async () => {
    vi.spyOn(api, "listPipelines").mockResolvedValue(TWO);
    vi.spyOn(api, "setPipelineEnabled").mockResolvedValue({
      state: TWO,
      problems: ["duplicate node id: w1"],
    });
    render(<PipelineTabs />);
    await screen.findByText("Screenshots");
    fireEvent.click(
      screen.getByRole("button", { name: /turn screenshots on/i }),
    );
    expect(await screen.findByText(/duplicate node id/i)).toBeTruthy();
  });

  it("deletes a pipeline after confirmation and loads the new active one", async () => {
    useFlowStore.getState().loadPipeline(demo);
    vi.spyOn(api, "listPipelines").mockResolvedValue({
      ...TWO,
      activeId: "p1",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(api, "deletePipeline").mockResolvedValue({
      state: {
        activeId: "p2",
        pipelines: [{ id: "p2", name: "Screenshots", enabled: false }],
      },
      pipeline: EMPTY,
    });
    render(<PipelineTabs />);
    await screen.findByText("My Pipeline");
    fireEvent.click(
      screen.getByRole("button", { name: /delete my pipeline/i }),
    );
    expect(
      await screen.findByRole("tab", { name: "Screenshots" }),
    ).toBeTruthy();
    expect(screen.queryByText("My Pipeline")).toBeNull();
    expect(useFlowStore.getState().nodes).toHaveLength(0);
  });

  it("does not delete when the confirmation is declined", async () => {
    vi.spyOn(api, "listPipelines").mockResolvedValue(TWO);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const spy = vi.spyOn(api, "deletePipeline");
    render(<PipelineTabs />);
    await screen.findByText("My Pipeline");
    fireEvent.click(
      screen.getByRole("button", { name: /delete my pipeline/i }),
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
