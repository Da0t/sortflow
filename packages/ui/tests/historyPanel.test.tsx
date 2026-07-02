import type { JournalEntry } from "@sortflow/engine";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/bridge";
import { HistoryPanel } from "../src/panels/HistoryPanel";

const done = (id: string): JournalEntry => ({
  id,
  ts: 1,
  from: `/in/${id}.txt`,
  to: `/out/${id}.txt`,
  moveNodeId: "m1",
  status: "done",
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HistoryPanel", () => {
  it("undoes every completed move via Undo all after confirmation", async () => {
    vi.spyOn(api, "listJournal").mockResolvedValue([done("a"), done("b")]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const spy = vi.spyOn(api, "undoAll").mockResolvedValue(2);
    render(<HistoryPanel />);
    fireEvent.click(
      await screen.findByRole("button", { name: /undo all \(2\)/i }),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
  });

  it("does nothing when the confirmation is declined", async () => {
    vi.spyOn(api, "listJournal").mockResolvedValue([done("a"), done("b")]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const spy = vi.spyOn(api, "undoAll");
    render(<HistoryPanel />);
    fireEvent.click(
      await screen.findByRole("button", { name: /undo all \(2\)/i }),
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("hides Undo all when only one move is undoable", async () => {
    vi.spyOn(api, "listJournal").mockResolvedValue([done("a")]);
    render(<HistoryPanel />);
    await screen.findByText(/\/in\/a\.txt/);
    expect(screen.queryByRole("button", { name: /undo all/i })).toBeNull();
  });
});
