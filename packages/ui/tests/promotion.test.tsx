import type { Pipeline } from "@sortflow/engine";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("promotion offer", () => {
  it("offers Make automatic when the streak reaches the threshold", async () => {
    vi.spyOn(api, "approvalStreak").mockResolvedValue(12);
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    await waitFor(() =>
      expect(screen.getByText(/approved 12 in a row/i)).toBeTruthy(),
    );
    expect(
      screen.getByRole("button", { name: /make automatic/i }),
    ).toBeTruthy();
  });

  it("does not offer below the threshold", async () => {
    vi.spyOn(api, "approvalStreak").mockResolvedValue(3);
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    await waitFor(() =>
      expect(screen.getByText(/approved 3 in a row/i)).toBeTruthy(),
    );
    expect(
      screen.queryByRole("button", { name: /make automatic/i }),
    ).toBeNull();
  });
});
