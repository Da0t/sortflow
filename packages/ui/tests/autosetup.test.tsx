import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { api } from "../src/bridge";
import { useFlowStore } from "../src/store";

// Mock the bridge api.autoSetup to return the canned result
vi.mock("../src/bridge", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/bridge")>();
  const { api: realApi } = real;
  return {
    ...real,
    api: {
      ...realApi,
      autoSetup: vi.fn().mockResolvedValue({
        scan: {
          total: 160,
          buckets: [
            { key: "screenshots", label: "Screenshots", count: 120 },
            { key: "documents", label: "Documents", count: 40 },
          ],
        },
        pipeline: {
          nodes: [
            {
              id: "auto-w",
              kind: "watch",
              config: { path: "~/Downloads", recursive: false },
              position: { x: 40, y: 200 },
            },
            {
              id: "auto-f-screenshots",
              kind: "filter",
              config: {
                extensions: [".png", ".jpg", ".jpeg", ".heic"],
                namePattern: "^screen ?shot",
                regex: true,
              },
              position: { x: 340, y: 60 },
            },
            {
              id: "auto-m-screenshots",
              kind: "move",
              config: {
                destination: "~/Pictures/Screenshots",
                auto: false,
              },
              position: { x: 660, y: 60 },
            },
            {
              id: "auto-f-documents",
              kind: "filter",
              config: {
                extensions: [
                  ".pdf",
                  ".doc",
                  ".docx",
                  ".txt",
                  ".md",
                  ".rtf",
                  ".csv",
                  ".xlsx",
                  ".xls",
                  ".pptx",
                  ".ppt",
                  ".key",
                  ".pages",
                ],
              },
              position: { x: 340, y: 210 },
            },
            {
              id: "auto-m-documents",
              kind: "move",
              config: { destination: "~/Documents/Sorted", auto: false },
              position: { x: 660, y: 210 },
            },
          ],
          edges: [
            {
              id: "auto-e-0",
              source: "auto-w",
              sourceHandle: "out",
              target: "auto-f-screenshots",
            },
            {
              id: "auto-e-1",
              source: "auto-f-screenshots",
              sourceHandle: "match",
              target: "auto-m-screenshots",
            },
            {
              id: "auto-e-2",
              source: "auto-f-screenshots",
              sourceHandle: "else",
              target: "auto-f-documents",
            },
            {
              id: "auto-e-3",
              source: "auto-f-documents",
              sourceHandle: "match",
              target: "auto-m-documents",
            },
          ],
        },
      }),
    },
  };
});

beforeEach(() => {
  useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
});

describe("Auto Setup UI", () => {
  it("renders the Auto Setup section with folder select and button", () => {
    render(<App />);
    // The section label and button both say "Auto Setup"
    expect(screen.getAllByText("Auto Setup").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("combobox", { name: /folder to scan/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /auto setup/i })).toBeTruthy();
  });

  it("clicking Auto Setup button loads the pipeline and shows the banner", async () => {
    render(<App />);
    const btn = screen.getByRole("button", { name: /auto setup/i });
    fireEvent.click(btn);

    // Wait for the async autoSetup call to resolve
    await waitFor(() => {
      expect(api.autoSetup).toHaveBeenCalled();
    });

    // Banner should appear
    await waitFor(() => {
      expect(screen.getByText(/Scanned 160 files/i)).toBeTruthy();
    });

    // Pipeline nodes should be loaded into store
    const state = useFlowStore.getState();
    const nodeIds = state.nodes.map((n) => n.id);
    expect(nodeIds).toContain("auto-w");
    expect(nodeIds).toContain("auto-f-screenshots");
    expect(nodeIds).toContain("auto-m-screenshots");
    expect(nodeIds).toContain("auto-f-documents");
    expect(nodeIds).toContain("auto-m-documents");
  });

  it("banner shows rule count and bucket summary", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /auto setup/i }));

    await waitFor(() => {
      expect(screen.getByText(/drafted 2 rules/i)).toBeTruthy();
    });

    // Should mention the bucket labels/counts
    expect(screen.getByText(/120 Screenshots/i)).toBeTruthy();
  });

  it("banner can be dismissed", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /auto setup/i }));

    await waitFor(() => {
      expect(screen.getByText(/Scanned 160 files/i)).toBeTruthy();
    });

    const dismiss = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(dismiss);

    await waitFor(() => {
      expect(screen.queryByText(/Scanned 160 files/i)).toBeNull();
    });
  });

  it("shows error banner when autoSetup rejects", async () => {
    vi.mocked(api.autoSetup).mockRejectedValueOnce(
      new Error("permission denied"),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /auto setup/i }));

    await waitFor(() => {
      expect(screen.getByText(/Auto Setup failed/i)).toBeTruthy();
    });
    expect(screen.getByText(/permission denied/i)).toBeTruthy();
  });

  it("passes the chosen Sort-into base to autoSetup", async () => {
    render(<App />);
    fireEvent.change(
      screen.getByRole("combobox", { name: /sort files into/i }),
      { target: { value: "~/Desktop" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /auto setup/i }));
    await waitFor(() => {
      expect(api.autoSetup).toHaveBeenCalledWith("~/Downloads", "~/Desktop");
    });
  });

  it("omits the base when Sort into is the system-folders default", async () => {
    render(<App />);
    // Select the default explicitly so this test is order-independent.
    fireEvent.change(
      screen.getByRole("combobox", { name: /sort files into/i }),
      { target: { value: "" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /auto setup/i }));
    await waitFor(() => {
      expect(api.autoSetup).toHaveBeenCalledWith("~/Downloads", undefined);
    });
  });
});
