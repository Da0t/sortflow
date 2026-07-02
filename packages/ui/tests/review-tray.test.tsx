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

describe("ReviewTray: rename at review", () => {
  afterEach(() => vi.restoreAllMocks());

  const base: Proposal = {
    id: "r-1",
    filePath: "/in/Screenshot 2026-06-30.png",
    fileName: "Screenshot 2026-06-30.png",
    destDir: "/out/Screenshots",
    moveNodeId: "m1",
    routeNodeIds: [],
    createdAt: 1,
    status: "pending",
  };

  it("renames a pending proposal via the pencil button and Enter", async () => {
    let list: Proposal[] = [{ ...base }];
    vi.spyOn(api, "listProposals").mockImplementation(async () => list);
    const renameSpy = vi
      .spyOn(api, "renameProposal")
      .mockImplementation(async (id, name) => {
        list = list.map((p) => (p.id === id ? { ...p, targetName: name } : p));
        return list[0];
      });
    render(<ReviewTray />);
    await waitFor(() =>
      expect(screen.getByText(/Screenshot 2026-06-30\.png/)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^rename/i }));
    const input = screen.getByLabelText(/new name for/i) as HTMLInputElement;
    expect(input.value).toBe("Screenshot 2026-06-30.png");
    fireEvent.change(input, { target: { value: "vacation.png" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(renameSpy).toHaveBeenCalledWith("r-1", "vacation.png"),
    );
    await waitFor(() => expect(screen.getByText(/vacation\.png/)).toBeTruthy());
  });

  it("Escape cancels the rename without calling the api", async () => {
    vi.spyOn(api, "listProposals").mockResolvedValue([{ ...base }]);
    const renameSpy = vi.spyOn(api, "renameProposal");
    render(<ReviewTray />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^rename/i })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^rename/i }));
    const input = screen.getByLabelText(/new name for/i);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(renameSpy).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/new name for/i)).toBeNull();
  });
});
