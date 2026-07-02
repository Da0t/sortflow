import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type FsEntry, api } from "../src/bridge";
import { FOLDER_MIME } from "../src/lib/folderDrop";
import { FilesView } from "../src/panels/FilesView";
import { useFlowStore } from "../src/store";

const DOWNLOADS: FsEntry[] = [
  { name: "Stuff", path: "/u/Downloads/Stuff", isDirectory: true },
  { name: "report.pdf", path: "/u/Downloads/report.pdf", isDirectory: false },
];
const DESKTOP: FsEntry[] = [
  { name: "School", path: "/u/Desktop/School", isDirectory: true },
];

function mockListing() {
  vi.spyOn(api, "listEntries").mockImplementation(async (path: string) =>
    path.includes("Desktop") ? DESKTOP : DOWNLOADS,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FilesView", () => {
  it("lists both panes, folders first", async () => {
    mockListing();
    render(<FilesView />);
    expect(await screen.findByText("Stuff")).toBeTruthy();
    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(await screen.findByText("School")).toBeTruthy();
  });

  it("dropping an entry on a folder performs a journaled move", async () => {
    mockListing();
    const move = vi.spyOn(api, "moveEntry").mockResolvedValue({ error: null });
    render(<FilesView />);
    const target = (await screen.findByText("School")).closest(
      "button",
    ) as HTMLButtonElement;
    fireEvent.drop(target, {
      dataTransfer: {
        getData: (t: string) =>
          t === FOLDER_MIME ? "/u/Downloads/report.pdf" : "",
      },
    });
    await waitFor(() => {
      expect(move).toHaveBeenCalledWith(
        "/u/Downloads/report.pdf",
        "/u/Desktop/School",
      );
    });
  });

  it("shows the error when a move is refused", async () => {
    mockListing();
    vi.spyOn(api, "moveEntry").mockResolvedValue({
      error: "Can't move a folder into itself",
    });
    render(<FilesView />);
    const target = (await screen.findByText("School")).closest(
      "button",
    ) as HTMLButtonElement;
    fireEvent.drop(target, {
      dataTransfer: {
        getData: (t: string) => (t === FOLDER_MIME ? "/u/Desktop" : ""),
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
