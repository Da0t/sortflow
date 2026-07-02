import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type FsEntry, api } from "../src/bridge";
import { FOLDER_MIME } from "../src/lib/folderDrop";
import { FilesView } from "../src/panels/FilesView";
import { useFlowStore } from "../src/store";

const HOME_ENTRIES: FsEntry[] = [
  { name: "Documents", path: "/u/Documents", isDirectory: true },
  { name: "report.pdf", path: "/u/report.pdf", isDirectory: false },
];
const DOCS_ENTRIES: FsEntry[] = [
  { name: "School", path: "/u/Documents/School", isDirectory: true },
  { name: "essay.txt", path: "/u/Documents/essay.txt", isDirectory: false },
];

function mockListing() {
  vi.spyOn(api, "listEntries").mockImplementation(async (path: string) =>
    path.startsWith("/u/Documents") ? DOCS_ENTRIES : HOME_ENTRIES,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FilesView (bubbles)", () => {
  it("shows folders as bubbles and keeps files tucked inside counts", async () => {
    mockListing();
    render(<FilesView />);
    expect(await screen.findByText("Home")).toBeTruthy();
    expect(await screen.findByText("Documents")).toBeTruthy();
    // Files are not drawn until their folder is hovered.
    expect(screen.queryByText("report.pdf")).toBeNull();
  });

  it("hovering a bubble fans out its contents as chips", async () => {
    mockListing();
    const { container } = render(<FilesView />);
    await screen.findByText("Documents");
    fireEvent.mouseEnter(
      container.querySelector('[title="/u/Documents"]') as HTMLElement,
    );
    expect(await screen.findByText("School")).toBeTruthy();
    expect(screen.getByText("essay.txt")).toBeTruthy();
  });

  it("clicking a folder chip pins the branch open", async () => {
    mockListing();
    const { container } = render(<FilesView />);
    await screen.findByText("Documents");
    fireEvent.mouseEnter(
      container.querySelector('[title="/u/Documents"]') as HTMLElement,
    );
    fireEvent.click(await screen.findByText("School"));
    // The branch is pinned: School is now a bubble, the file chip is gone.
    expect(await screen.findByText("School")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("essay.txt")).toBeNull());
  });

  it("dropping an entry on a bubble performs a journaled move", async () => {
    mockListing();
    const move = vi.spyOn(api, "moveEntry").mockResolvedValue({ error: null });
    const { container } = render(<FilesView />);
    await screen.findByText("Documents");
    fireEvent.drop(
      container.querySelector('[title="/u/Documents"]') as HTMLElement,
      {
        dataTransfer: {
          getData: (t: string) => (t === FOLDER_MIME ? "/u/report.pdf" : ""),
        },
      },
    );
    await waitFor(() => {
      expect(move).toHaveBeenCalledWith("/u/report.pdf", "/u/Documents");
    });
  });

  it("shows the error when a move is refused", async () => {
    mockListing();
    vi.spyOn(api, "moveEntry").mockResolvedValue({
      error: "Can't move a folder into itself",
    });
    const { container } = render(<FilesView />);
    await screen.findByText("Documents");
    fireEvent.drop(
      container.querySelector('[title="/u/Documents"]') as HTMLElement,
      {
        dataTransfer: {
          getData: (t: string) => (t === FOLDER_MIME ? "/u/Documents" : ""),
        },
      },
    );
    expect(
      await screen.findByText(/can't move a folder into itself/i),
    ).toBeTruthy();
  });

  it("the back button returns to the canvas view", async () => {
    mockListing();
    useFlowStore.getState().setView("files");
    render(<FilesView />);
    fireEvent.click(await screen.findByRole("button", { name: /pipelines/i }));
    expect(useFlowStore.getState().view).toBe("canvas");
  });
});
