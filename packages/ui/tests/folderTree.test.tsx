import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/bridge";
import { FOLDER_MIME } from "../src/lib/folderDrop";
import { FolderTree } from "../src/panels/FolderTree";

const ROOTS = [
  { name: "Documents", path: "/u/Documents", hasChildren: true },
  { name: "Downloads", path: "/u/Downloads", hasChildren: false },
];
const KIDS = [
  { name: "Invoices", path: "/u/Documents/Invoices", hasChildren: false },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FolderTree", () => {
  it("lists root folders from the api", async () => {
    vi.spyOn(api, "listFolders").mockResolvedValue(ROOTS);
    render(<FolderTree />);
    expect(await screen.findByText("Documents")).toBeTruthy();
    expect(screen.getByText("Downloads")).toBeTruthy();
  });

  it("expands a folder and lazily loads its children", async () => {
    const spy = vi
      .spyOn(api, "listFolders")
      .mockImplementation(async (path?: string) =>
        path === "/u/Documents" ? KIDS : ROOTS,
      );
    render(<FolderTree />);
    fireEvent.click(await screen.findByText("Documents"));
    expect(await screen.findByText("Invoices")).toBeTruthy();
    expect(spy).toHaveBeenCalledWith("/u/Documents");
  });

  it("collapses an expanded folder on second click", async () => {
    vi.spyOn(api, "listFolders").mockImplementation(async (path?: string) =>
      path === "/u/Documents" ? KIDS : ROOTS,
    );
    render(<FolderTree />);
    fireEvent.click(await screen.findByText("Documents"));
    expect(await screen.findByText("Invoices")).toBeTruthy();
    fireEvent.click(screen.getByText("Documents"));
    expect(screen.queryByText("Invoices")).toBeNull();
  });

  it("does not try to expand a leaf folder", async () => {
    const spy = vi.spyOn(api, "listFolders").mockResolvedValue(ROOTS);
    render(<FolderTree />);
    fireEvent.click(await screen.findByText("Downloads"));
    expect(spy).not.toHaveBeenCalledWith("/u/Downloads");
  });

  it("sets drag data with the folder path on drag start", async () => {
    vi.spyOn(api, "listFolders").mockResolvedValue(ROOTS);
    render(<FolderTree />);
    const row = (await screen.findByText("Documents")).closest("button");
    expect(row).toBeTruthy();
    const setData = vi.fn();
    fireEvent.dragStart(row as HTMLButtonElement, {
      dataTransfer: { setData, effectAllowed: "none" },
    });
    expect(setData).toHaveBeenCalledWith(FOLDER_MIME, "/u/Documents");
    expect(setData).toHaveBeenCalledWith("text/plain", "/u/Documents");
  });

  it("shows an empty state when there are no folders", async () => {
    vi.spyOn(api, "listFolders").mockResolvedValue([]);
    render(<FolderTree />);
    expect(await screen.findByText(/no folders found/i)).toBeTruthy();
  });
});
