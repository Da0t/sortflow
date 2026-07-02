import type { Proposal } from "@sortflow/engine";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/bridge";
import { ReviewTray } from "../src/panels/ReviewTray";

describe("ReviewTray", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists pending proposals and approves on click", async () => {
    render(<ReviewTray />);
    await waitFor(() =>
      expect(screen.getByText(/Screenshot 2026-06-30\.png/)).toBeTruthy(),
    );
    const approveSpy = vi.spyOn(api, "approve");
    fireEvent.click(screen.getAllByRole("button", { name: /^approve$/i })[0]);
    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith("demo-1"));
  });

  it("surfaces failed proposals with their error and no action buttons", async () => {
    const failed: Proposal = {
      id: "f-1",
      filePath: "/x/broken.txt",
      fileName: "broken.txt",
      destDir: "/dest",
      moveNodeId: "m1",
      routeNodeIds: [],
      createdAt: 1,
      status: "failed",
      error: "EACCES: permission denied",
    };
    vi.spyOn(api, "listProposals").mockResolvedValue([failed]);
    render(<ReviewTray />);
    await waitFor(() =>
      expect(screen.getByText(/EACCES: permission denied/)).toBeTruthy(),
    );
    expect(screen.getByText("failed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
  });
});
