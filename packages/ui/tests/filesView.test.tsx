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
];

function mockListing() {
  vi.spyOn(api, "listEntries").mockImplementation(async (path: string) =>
    path === "/u/Documents" ? DOCS_ENTRIES : HOME_ENTRIES,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FilesView (connected tree)", () => {
  it("renders one tree rooted at Home with files and folders", async () => {
    mockListing();
    render(<FilesView />);
    expect(await screen.findByText("Documents")).toBeTruthy();
    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
  });

  it("expands and collapses branches in place", async () => {
    mockListing();
    render(<FilesView />);
    fireEvent.click(await screen.findByText("Documents"));
    expect(await screen.findByText("School")).toBeTruthy();
    fireEvent.click(screen.getByText("Documents"));
    await waitFor(() => expect(screen.queryByText("School")).toBeNull());
  });

  it("dragging a file onto a folder row performs a journaled move", async () => {
    mockListing();
    const move = vi.spyOn(api, "moveEntry").mockResolvedValue({ error: null });
    render(<FilesView />);
    const folderRow = (await screen.findByText("Documents")).closest(
      "button",
    ) as HTMLButtonElement;
    fireEvent.drop(folderRow, {
      dataTransfer: {
        getData: (t: string) => (t === FOLDER_MIME ? "/u/report.pdf" : ""),
      },
    });
    await waitFor(() => {
      expect(move).toHaveBeenCalledWith("/u/report.pdf", "/u/Documents");
    });
  });

  it("dropping on the Home header moves into the home folder", async () => {
    mockListing();
    const move = vi.spyOn(api, "moveEntry").mockResolvedValue({ error: null });
    render(<FilesView />);
    const home = (await screen.findByText("Home")).closest(
      "button",
    ) as HTMLButtonElement;
    fireEvent.drop(home, {
      dataTransfer: {
        getData: (t: string) =>
          t === FOLDER_MIME ? "/u/Documents/School" : "",
      },
    });
    await waitFor(() => {
      expect(move).toHaveBeenCalledWith("/u/Documents/School", "~");
    });
  });

  it("shows the error when a move is refused", async () => {
    mockListing();
    vi.spyOn(api, "moveEntry").mockResolvedValue({
      error: "Can't move a folder into itself",
    });
    render(<FilesView />);
    const folderRow = (await screen.findByText("Documents")).closest(
      "button",
    ) as HTMLButtonElement;
    fireEvent.drop(folderRow, {
      dataTransfer: {
        getData: (t: string) => (t === FOLDER_MIME ? "/u/Documents" : ""),
      },
    });
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
