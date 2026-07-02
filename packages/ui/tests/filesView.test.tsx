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

describe("FilesView (node tree)", () => {
  it("renders the Home node with its files and folders", async () => {
    mockListing();
    render(<FilesView />);
    expect(await screen.findByText("Documents")).toBeTruthy();
    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
  });

  // React Flow keeps nodes visibility:hidden until measured, and jsdom's
  // stubbed ResizeObserver never measures — hidden elements have no
  // accessible name, so in-node buttons are queried by attribute instead.
  it("opening a subfolder spawns it as a connected node", async () => {
    mockListing();
    const { container } = render(<FilesView />);
    await screen.findByText("Documents");
    fireEvent.click(
      container.querySelector(
        'button[aria-label="Open Documents"]',
      ) as HTMLElement,
    );
    // The folder now exists as its own node card, listing its contents.
    await screen.findByText("School");
    expect(container.querySelector('[data-path="/u/Documents"]')).toBeTruthy();
    // And can be closed again.
    fireEvent.click(
      container.querySelector(
        'button[aria-label="Close Documents"]',
      ) as HTMLElement,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-path="/u/Documents"]')).toBeNull(),
    );
  });

  it("dropping an entry on a folder node performs a journaled move", async () => {
    mockListing();
    const move = vi.spyOn(api, "moveEntry").mockResolvedValue({ error: null });
    const { container } = render(<FilesView />);
    await screen.findByText("Documents");
    fireEvent.click(
      container.querySelector(
        'button[aria-label="Open Documents"]',
      ) as HTMLElement,
    );
    await screen.findByText("School");
    const card = container.querySelector(
      '[data-path="/u/Documents"]',
    ) as HTMLElement;
    fireEvent.drop(card, {
      dataTransfer: {
        getData: (t: string) => (t === FOLDER_MIME ? "/u/report.pdf" : ""),
      },
    });
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
    const home = container.querySelector('[data-path="~"]') as HTMLElement;
    fireEvent.drop(home, {
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
