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

  it("rejects every pending proposal via Reject all", async () => {
    const two: Proposal[] = [
      {
        id: "p-1",
        filePath: "/x/a.png",
        fileName: "a.png",
        destDir: "/dest",
        moveNodeId: "m1",
        routeNodeIds: [],
        createdAt: 1,
        status: "pending",
      },
      {
        id: "p-2",
        filePath: "/x/b.png",
        fileName: "b.png",
        destDir: "/dest",
        moveNodeId: "m1",
        routeNodeIds: [],
        createdAt: 2,
        status: "pending",
      },
    ];
    vi.spyOn(api, "listProposals").mockResolvedValue(two);
    const rejectSpy = vi.spyOn(api, "reject").mockResolvedValue(undefined);
    render(<ReviewTray />);
    fireEvent.click(
      await screen.findByRole("button", { name: /reject all \(2\)/i }),
    );
    await waitFor(() => {
      expect(rejectSpy).toHaveBeenCalledWith("p-1");
      expect(rejectSpy).toHaveBeenCalledWith("p-2");
    });
  });

  it("offers to restore rejected proposals", async () => {
    const rejected: Proposal = {
      id: "r-1",
      filePath: "/x/a.png",
      fileName: "a.png",
      destDir: "/dest",
      moveNodeId: "m1",
      routeNodeIds: [],
      createdAt: 1,
      status: "rejected",
    };
    vi.spyOn(api, "listProposals").mockResolvedValue([rejected]);
    const spy = vi.spyOn(api, "restoreRejected").mockResolvedValue(1);
    render(<ReviewTray />);
    expect(await screen.findByText(/1 rejected/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
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
