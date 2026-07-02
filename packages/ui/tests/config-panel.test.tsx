import type {
  FilterConfig,
  MoveConfig,
  Pipeline,
  WatchConfig,
} from "@sortflow/engine";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../src/bridge";
import { ConfigPanel } from "../src/panels/ConfigPanel";
import { useFlowStore } from "../src/store";

const demo: Pipeline = {
  nodes: [
    {
      id: "m1",
      kind: "move",
      config: { destination: "~/Docs", auto: false },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

describe("ConfigPanel", () => {
  it("shows a hint when nothing is selected", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected(null);
    render(<ConfigPanel />);
    expect(screen.getByText(/select a node/i)).toBeTruthy();
  });

  it("edits the selected move node config", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    const dest = screen.getByLabelText(/destination/i) as HTMLInputElement;
    expect(dest.value).toBe("~/Docs");
    fireEvent.change(dest, { target: { value: "~/Sorted/{category}" } });
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.destination).toBe("~/Sorted/{category}");
  });

  it("shows an error message when setPipeline rejects", async () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    vi.spyOn(api, "setPipeline").mockRejectedValueOnce(
      new Error("IPC channel closed"),
    );
    render(<ConfigPanel />);
    fireEvent.click(screen.getByText(/save & apply/i));
    expect(await screen.findByText(/IPC channel closed/i)).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe("ConfigPanel: Browse button", () => {
  it("Browse button on Move node calls pickFolder and sets destination", async () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    const pickSpy = vi
      .spyOn(api, "pickFolder")
      .mockResolvedValue("/Users/demo/Picked");
    render(<ConfigPanel />);
    const browseBtn = screen.getByRole("button", { name: /browse/i });
    await act(async () => {
      fireEvent.click(browseBtn);
    });
    await screen.findByDisplayValue("/Users/demo/Picked");
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.destination).toBe("/Users/demo/Picked");
    pickSpy.mockRestore();
  });

  it("Browse cancel (pickFolder returns null) does not change destination", async () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    vi.spyOn(api, "pickFolder").mockResolvedValue(null);
    render(<ConfigPanel />);
    const browseBtn = screen.getByRole("button", { name: /browse/i });
    await act(async () => {
      fireEvent.click(browseBtn);
    });
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.destination).toBe("~/Docs");
    vi.restoreAllMocks();
  });
});

const watchDemo: Pipeline = {
  nodes: [
    {
      id: "w1",
      kind: "watch",
      config: { path: "~/Downloads", recursive: false, scanExisting: false },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

describe("ConfigPanel: watch node", () => {
  it("shows scanExisting checkbox for watch nodes", () => {
    useFlowStore.getState().loadPipeline(watchDemo);
    useFlowStore.getState().setSelected("w1");
    render(<ConfigPanel />);
    expect(
      screen.getByLabelText(/sort existing files when applied/i),
    ).toBeTruthy();
  });

  it("toggling scanExisting updates toPipeline() watch config", () => {
    useFlowStore.getState().loadPipeline(watchDemo);
    useFlowStore.getState().setSelected("w1");
    render(<ConfigPanel />);
    const cb = screen.getByLabelText(
      /sort existing files when applied/i,
    ) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as WatchConfig;
    expect(cfg.scanExisting).toBe(true);
  });
});

describe("ConfigPanel: destination chips", () => {
  // loadRecents() catches localStorage errors and returns [] — defaults always appear.
  it("renders default chips when no recents exist", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    expect(screen.getByRole("button", { name: /Documents/i })).toBeTruthy();
  });

  it("clicking a chip sets the destination", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    const chip = screen.getByRole("button", { name: /Documents/i });
    fireEvent.click(chip);
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.destination).toBe("~/Documents");
  });
});

describe("ConfigPanel: delete node", () => {
  it("shows a Delete node button and removes the selected node on click", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    fireEvent.click(screen.getByRole("button", { name: /delete node/i }));
    expect(useFlowStore.getState().toPipeline().nodes).toHaveLength(0);
    expect(useFlowStore.getState().selectedId).toBeNull();
  });

  it("hides the Delete node button when nothing is selected", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected(null);
    render(<ConfigPanel />);
    expect(screen.queryByRole("button", { name: /delete node/i })).toBeNull();
  });
});

const filterDemo: Pipeline = {
  nodes: [
    {
      id: "f1",
      kind: "filter",
      config: { extensions: [".pdf"] },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

describe("ConfigPanel: filter age inputs", () => {
  it("setting Older than 30 puts minAgeDays:30 in toPipeline()", () => {
    useFlowStore.getState().loadPipeline(filterDemo);
    useFlowStore.getState().setSelected("f1");
    render(<ConfigPanel />);
    const input = screen.getByLabelText(/older than/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "30" } });
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as FilterConfig;
    expect(cfg.minAgeDays).toBe(30);
  });

  it("clearing Older than removes minAgeDays from config", () => {
    useFlowStore.getState().loadPipeline({
      nodes: [
        {
          id: "f1",
          kind: "filter",
          config: { extensions: [".pdf"], minAgeDays: 30 },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    useFlowStore.getState().setSelected("f1");
    render(<ConfigPanel />);
    const input = screen.getByLabelText(/older than/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as FilterConfig;
    expect(cfg.minAgeDays).toBeUndefined();
  });

  it("renders the subfolder warning when recursive is checked", () => {
    useFlowStore.getState().loadPipeline({
      nodes: [
        {
          id: "w1",
          kind: "watch",
          config: { path: "~/Downloads", recursive: true },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    useFlowStore.getState().setSelected("w1");
    render(<ConfigPanel />);
    expect(screen.getByText(/files inside subfolders/i)).toBeTruthy();
  });

  it("does not render the subfolder warning when recursive is unchecked", () => {
    useFlowStore.getState().loadPipeline({
      nodes: [
        {
          id: "w1",
          kind: "watch",
          config: { path: "~/Downloads", recursive: false },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    useFlowStore.getState().setSelected("w1");
    render(<ConfigPanel />);
    expect(screen.queryByText(/files inside subfolders/i)).toBeNull();
  });

  it("renders the token helper line for move nodes", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    expect(screen.getAllByText(/fileYYYY/i).length).toBeGreaterThan(0);
  });
});

describe("ConfigPanel: date grouping chip", () => {
  it("appends {fileYYYY}/{fileMM} to the destination on click", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: /group into year\/month/i }),
    );
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.destination).toBe("~/Docs/{fileYYYY}/{fileMM}");
  });

  it("hides the chip when the destination already groups by file date", () => {
    useFlowStore.getState().loadPipeline({
      nodes: [
        {
          id: "m1",
          kind: "move",
          config: { destination: "~/Docs/{fileYYYY}/{fileMM}", auto: false },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    expect(
      screen.queryByRole("button", { name: /group into year\/month/i }),
    ).toBeNull();
  });
});

describe("ConfigPanel: filter presets", () => {
  const filterDemo: Pipeline = {
    nodes: [
      {
        id: "f1",
        kind: "filter",
        config: { extensions: [".png"] },
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
  };

  it("clicking a preset chip merges its extensions into the filter", () => {
    useFlowStore.getState().loadPipeline(filterDemo);
    useFlowStore.getState().setSelected("f1");
    render(<ConfigPanel />);
    fireEvent.click(screen.getByRole("button", { name: /^documents$/i }));
    const cfg = useFlowStore.getState().toPipeline().nodes[0].config as {
      extensions?: string[];
    };
    expect(cfg.extensions).toContain(".pdf");
    expect(cfg.extensions).toContain(".docx");
    expect(cfg.extensions).toContain(".png"); // pre-existing kept
  });

  it("clicking the same preset twice does not duplicate extensions", () => {
    useFlowStore.getState().loadPipeline(filterDemo);
    useFlowStore.getState().setSelected("f1");
    render(<ConfigPanel />);
    fireEvent.click(screen.getByRole("button", { name: /^images$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^images$/i }));
    const cfg = useFlowStore.getState().toPipeline().nodes[0].config as {
      extensions?: string[];
    };
    const pngCount = (cfg.extensions ?? []).filter((e) => e === ".png").length;
    expect(pngCount).toBe(1);
  });
});

describe("ConfigPanel: rename pattern field", () => {
  it("edits the move node's renamePattern", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    const field = screen.getByLabelText(/rename pattern/i) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "{fileYYYY} {name}" } });
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig & { renamePattern?: string };
    expect(cfg.renamePattern).toBe("{fileYYYY} {name}");
  });

  it("clearing the field removes renamePattern", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    const field = screen.getByLabelText(/rename pattern/i) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "x" } });
    fireEvent.change(field, { target: { value: "" } });
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig & { renamePattern?: string };
    expect(cfg.renamePattern).toBeUndefined();
  });
});
