# Folder-Picking UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Browse buttons, recent-destination chips, and Finder drag-drop to Sortflow's ConfigPanel and canvas.

**Architecture:** Three independent features share two new bridge methods (`pickFolder`, `isDirectory`, `getPathForFile`). A pure `recentDestinations.ts` module owns MRU logic. A pure `folderDrop.ts` helper owns drop-decision logic. App.tsx gains a `ReactFlowProvider` wrapper so a `FlowCanvas` child can call `useReactFlow` and attach drop handlers to the `<ReactFlow>` element.

**Tech Stack:** Electron (dialog, webUtils, fs/promises), React 19, @xyflow/react 12, zustand, lucide-react, vitest + @testing-library/react.

## Global Constraints

- Packages: `packages/engine` must not be touched.
- Commit author: Dat Nguyen — do NOT touch git config.
- No Co-Authored-By or any trailers in commit messages.
- Exact commit message: `feat(ui): folder browsing, recent destination chips and Finder drag-drop`
- Gate before commit: `pnpm test` + `pnpm check` + `pnpm --filter @sortflow/ui build` all green.
- Every API addition lands in bridge type + mock + preload + ipc in the same commit.
- localStorage key: `sf-recent-destinations` (JSON array, MRU, cap 6).
- Mock `pickFolder` returns `"/Users/demo/Documents/Picked"`.
- Mock `getPathForFile` returns `""`.
- Mock `isDirectory` returns `false`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/app/src/ipc.ts` | Add `dialog:pickFolder` and `fs:isDirectory` IPC handlers |
| Modify | `packages/app/src/preload.ts` | Expose `pickFolder`, `getPathForFile`, `isDirectory` |
| Modify | `packages/ui/src/bridge.ts` | Add 3 methods to SortflowApi interface + mock |
| Modify | `packages/ui/src/store.ts` | Extend `addNode(kind, overrides?)` signature |
| Create | `packages/ui/src/lib/recentDestinations.ts` | Pure MRU merge/dedupe/cap logic |
| Create | `packages/ui/src/lib/folderDrop.ts` | Pure drop-decision helper |
| Modify | `packages/ui/src/panels/ConfigPanel.tsx` | Browse buttons + destination chips + save recents |
| Modify | `packages/ui/src/App.tsx` | ReactFlowProvider wrapper + FlowCanvas child with drop handlers |
| Modify | `packages/ui/src/styles.css` | Styles for Browse button row and destination chips |
| Create | `packages/ui/tests/recentDestinations.test.ts` | Unit tests for MRU logic |
| Create | `packages/ui/tests/folderDrop.test.ts` | Unit tests for drop helper |
| Modify | `packages/ui/tests/config-panel.test.tsx` | Browse button + chip tests |
| Modify | `packages/ui/tests/store.test.ts` | addNode overrides tests |

---

### Task 1: IPC handlers in app package

**Files:**
- Modify: `packages/app/src/ipc.ts`

**Interfaces:**
- Produces: IPC channels `dialog:pickFolder(defaultPath?)→string|null`, `fs:isDirectory(path)→boolean`

- [ ] **Step 1: Add imports and handlers to ipc.ts**

  Read `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/app/src/ipc.ts` first.

  Add `import { stat } from "node:fs/promises";` and `import { dialog } from "electron";` at the top.
  
  At the end of `registerIpc`, before `return { pendingCount }`, add:

  ```typescript
  ipcMain.handle("dialog:pickFolder", async (_evt, defaultPath?: string) => {
    const win = getWin();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      ...(defaultPath ? { defaultPath } : {}),
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("fs:isDirectory", async (_evt, path: string) => {
    try {
      return (await stat(path)).isDirectory();
    } catch {
      return false;
    }
  });
  ```

- [ ] **Step 2: Verify ipc.ts compiles (Biome check)**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm check 2>&1 | head -30
  ```

---

### Task 2: Preload bridge methods

**Files:**
- Modify: `packages/app/src/preload.ts`

**Interfaces:**
- Consumes: IPC channels from Task 1
- Produces: `window.sortflow.pickFolder`, `window.sortflow.getPathForFile`, `window.sortflow.isDirectory`

- [ ] **Step 1: Add imports and expose new methods**

  Read `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/app/src/preload.ts` first.
  
  Add `import { webUtils } from "electron";` at the top (after existing import).
  
  Add to the `contextBridge.exposeInMainWorld("sortflow", { ... })` object:

  ```typescript
  pickFolder: (defaultPath?: string) =>
    ipcRenderer.invoke("dialog:pickFolder", defaultPath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  isDirectory: (path: string) => ipcRenderer.invoke("fs:isDirectory", path),
  ```

- [ ] **Step 2: Check Biome**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm check 2>&1 | head -30
  ```

---

### Task 3: Bridge type + mock

**Files:**
- Modify: `packages/ui/src/bridge.ts`

**Interfaces:**
- Produces: `SortflowApi.pickFolder`, `SortflowApi.getPathForFile`, `SortflowApi.isDirectory` used by Tasks 5, 7, 8

- [ ] **Step 1: Add methods to SortflowApi interface**

  Read `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/src/bridge.ts` first.

  In the `SortflowApi` interface add:

  ```typescript
  pickFolder(defaultPath?: string): Promise<string | null>;
  getPathForFile(file: File): string;
  isDirectory(path: string): Promise<boolean>;
  ```

- [ ] **Step 2: Add mock implementations in createMockApi**

  Inside `createMockApi()` return object add:

  ```typescript
  async pickFolder(_defaultPath?: string) {
    return "/Users/demo/Documents/Picked";
  },
  getPathForFile(_file: File) {
    return "";
  },
  async isDirectory(_path: string) {
    return false;
  },
  ```

- [ ] **Step 3: Check Biome + UI build**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm check && pnpm --filter @sortflow/ui build 2>&1 | tail -20
  ```

---

### Task 4: Pure recentDestinations module + tests

**Files:**
- Create: `packages/ui/src/lib/recentDestinations.ts`
- Create: `packages/ui/tests/recentDestinations.test.ts`

**Interfaces:**
- Produces:
  - `mergeRecents(existing: string[], newEntry: string, cap?: number): string[]`
  - `mergeMany(existing: string[], newEntries: string[], cap?: number): string[]`
  - `DEFAULTS: readonly string[]` = `["~/Documents", "~/Pictures", "~/Desktop", "~/Downloads"]`
  - `buildChips(recents: string[], defaults?: readonly string[], cap?: number): string[]`

- [ ] **Step 1: Write failing tests**

  Create `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/tests/recentDestinations.test.ts`:

  ```typescript
  import { describe, expect, it } from "vitest";
  import {
    DEFAULTS,
    buildChips,
    mergeMany,
    mergeRecents,
  } from "../src/lib/recentDestinations";

  describe("mergeRecents", () => {
    it("prepends a new entry at position 0", () => {
      const result = mergeRecents(["~/Documents"], "~/Pictures");
      expect(result[0]).toBe("~/Pictures");
    });

    it("moves an existing entry to front (MRU)", () => {
      const result = mergeRecents(["~/Documents", "~/Pictures"], "~/Documents");
      expect(result).toEqual(["~/Documents", "~/Pictures"]);
    });

    it("caps at 6 by default", () => {
      const existing = ["a", "b", "c", "d", "e", "f"];
      const result = mergeRecents(existing, "g");
      expect(result).toHaveLength(6);
      expect(result[0]).toBe("g");
    });

    it("respects custom cap", () => {
      const result = mergeRecents(["a", "b", "c"], "d", 3);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe("d");
    });

    it("deduplicates: entry already at front stays at front", () => {
      const result = mergeRecents(["~/Pictures", "~/Documents"], "~/Pictures");
      expect(result[0]).toBe("~/Pictures");
      expect(result.filter((x) => x === "~/Pictures")).toHaveLength(1);
    });
  });

  describe("mergeMany", () => {
    it("merges multiple entries in order (last wins MRU)", () => {
      const result = mergeMany([], ["~/A", "~/B", "~/C"]);
      expect(result[0]).toBe("~/C");
    });

    it("deduplicates across multiple new entries", () => {
      const result = mergeMany(["~/A"], ["~/A", "~/B"]);
      expect(result.filter((x) => x === "~/A")).toHaveLength(1);
    });
  });

  describe("buildChips", () => {
    it("returns recents first, then defaults, deduped, max 6", () => {
      const chips = buildChips(["~/Pictures"], DEFAULTS);
      expect(chips[0]).toBe("~/Pictures");
      expect(chips).toContain("~/Documents");
      expect(chips.length).toBeLessThanOrEqual(6);
    });

    it("does not duplicate a recent that is also a default", () => {
      const chips = buildChips(["~/Documents"], DEFAULTS);
      expect(chips.filter((x) => x === "~/Documents")).toHaveLength(1);
    });

    it("works with empty recents: returns defaults", () => {
      const chips = buildChips([], DEFAULTS);
      expect(chips).toEqual(DEFAULTS.slice(0, 6));
    });
  });

  describe("DEFAULTS", () => {
    it("contains the four standard folders", () => {
      expect(DEFAULTS).toContain("~/Documents");
      expect(DEFAULTS).toContain("~/Pictures");
      expect(DEFAULTS).toContain("~/Desktop");
      expect(DEFAULTS).toContain("~/Downloads");
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- tests/recentDestinations.test.ts 2>&1 | tail -15
  ```
  Expected: FAIL (module not found)

- [ ] **Step 3: Create the implementation**

  Create `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/src/lib/recentDestinations.ts`:

  ```typescript
  export const DEFAULTS = [
    "~/Documents",
    "~/Pictures",
    "~/Desktop",
    "~/Downloads",
  ] as const;

  const DEFAULT_CAP = 6;

  /**
   * Prepend `newEntry` to `existing`, dedup (MRU), and cap the list.
   */
  export function mergeRecents(
    existing: string[],
    newEntry: string,
    cap = DEFAULT_CAP,
  ): string[] {
    const deduped = [newEntry, ...existing.filter((x) => x !== newEntry)];
    return deduped.slice(0, cap);
  }

  /**
   * Merge multiple new entries sequentially (last entry becomes MRU).
   */
  export function mergeMany(
    existing: string[],
    newEntries: string[],
    cap = DEFAULT_CAP,
  ): string[] {
    return newEntries.reduce((acc, entry) => mergeRecents(acc, entry, cap), existing);
  }

  /**
   * Build the chip list: recents first, then defaults not already in recents.
   * Deduped and capped at `cap`.
   */
  export function buildChips(
    recents: string[],
    defaults: readonly string[] = DEFAULTS,
    cap = DEFAULT_CAP,
  ): string[] {
    const seen = new Set(recents);
    const extras = defaults.filter((d) => !seen.has(d));
    return [...recents, ...extras].slice(0, cap);
  }
  ```

- [ ] **Step 4: Run tests — expect all pass**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- tests/recentDestinations.test.ts 2>&1 | tail -10
  ```

---

### Task 5: Store addNode overrides + tests

**Files:**
- Modify: `packages/ui/src/store.ts`
- Modify: `packages/ui/tests/store.test.ts`

**Interfaces:**
- Produces: `addNode(kind: NodeKind, overrides?: { config?: NodeConfig; position?: { x: number; y: number } }): void`

- [ ] **Step 1: Write failing store tests**

  Append to `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/tests/store.test.ts`:

  ```typescript
  describe("store: addNode overrides", () => {
    it("zero-arg call still uses default config", () => {
      useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
      useFlowStore.getState().addNode("move");
      const p = useFlowStore.getState().toPipeline();
      expect(p.nodes).toHaveLength(1);
      expect((p.nodes[0].config as { destination: string }).destination).toBe(
        "~/Documents/Sorted/{category}",
      );
    });

    it("overrides.config merges over defaults", () => {
      useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
      useFlowStore
        .getState()
        .addNode("move", { config: { destination: "/tmp/sorted", auto: false } });
      const p = useFlowStore.getState().toPipeline();
      expect((p.nodes[0].config as { destination: string }).destination).toBe(
        "/tmp/sorted",
      );
    });

    it("overrides.position replaces the default stagger position", () => {
      useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
      useFlowStore
        .getState()
        .addNode("move", { position: { x: 999, y: 888 } });
      const p = useFlowStore.getState().toPipeline();
      expect(p.nodes[0].position).toEqual({ x: 999, y: 888 });
    });

    it("overrides.config does not affect a subsequent zero-arg addNode", () => {
      useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
      useFlowStore
        .getState()
        .addNode("move", { config: { destination: "/custom", auto: true } });
      useFlowStore.getState().addNode("move");
      const p = useFlowStore.getState().toPipeline();
      expect((p.nodes[1].config as { destination: string }).destination).toBe(
        "~/Documents/Sorted/{category}",
      );
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- tests/store.test.ts 2>&1 | tail -15
  ```

- [ ] **Step 3: Update store addNode signature**

  Read `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/src/store.ts` first.

  Change the `addNode` signature in the `FlowState` interface:

  ```typescript
  addNode(kind: NodeKind, overrides?: { config?: NodeConfig; position?: { x: number; y: number } }): void;
  ```

  Change the `addNode` implementation:

  ```typescript
  addNode: (kind, overrides) =>
    set({
      nodes: [
        ...get().nodes,
        {
          id: genId(),
          type: kind,
          position: overrides?.position ?? {
            x: 120 + get().nodes.length * 40,
            y: 120 + get().nodes.length * 30,
          },
          data: {
            kind,
            config: overrides?.config
              ? structuredClone(overrides.config)
              : structuredClone(DEFAULT_CONFIGS[kind]),
          },
        },
      ],
    }),
  ```

- [ ] **Step 4: Run store tests — expect all pass**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- tests/store.test.ts 2>&1 | tail -10
  ```

---

### Task 6: folderDrop helper + tests

**Files:**
- Create: `packages/ui/src/lib/folderDrop.ts`
- Create: `packages/ui/tests/folderDrop.test.ts`

**Interfaces:**
- Consumes: `addNode` from Task 5
- Produces: `handleFolderDrop(path, isDir, addNode, position): void`

- [ ] **Step 1: Write failing tests**

  Create `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/tests/folderDrop.test.ts`:

  ```typescript
  import type { NodeConfig, NodeKind } from "@sortflow/engine";
  import { describe, expect, it, vi } from "vitest";
  import { handleFolderDrop } from "../src/lib/folderDrop";

  describe("handleFolderDrop", () => {
    it("calls addNode with move kind and destination when isDir=true", () => {
      const addNode = vi.fn();
      handleFolderDrop("/Users/me/Downloads", true, addNode, { x: 100, y: 200 });
      expect(addNode).toHaveBeenCalledOnce();
      const [kind, overrides] = addNode.mock.calls[0] as [
        NodeKind,
        { config: NodeConfig; position: { x: number; y: number } },
      ];
      expect(kind).toBe("move");
      expect((overrides.config as { destination: string }).destination).toBe(
        "/Users/me/Downloads",
      );
      expect(overrides.position).toEqual({ x: 100, y: 200 });
    });

    it("does NOT call addNode when isDir=false", () => {
      const addNode = vi.fn();
      handleFolderDrop("/Users/me/file.txt", false, addNode, { x: 0, y: 0 });
      expect(addNode).not.toHaveBeenCalled();
    });

    it("does NOT call addNode when path is empty", () => {
      const addNode = vi.fn();
      handleFolderDrop("", true, addNode, { x: 0, y: 0 });
      expect(addNode).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- tests/folderDrop.test.ts 2>&1 | tail -10
  ```

- [ ] **Step 3: Create the implementation**

  Create `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/src/lib/folderDrop.ts`:

  ```typescript
  import type { NodeConfig, NodeKind } from "@sortflow/engine";

  /**
   * Pure drop-decision helper. Calls addNode with a Move node when the dropped
   * path is a directory. Ignores non-directories and empty paths.
   */
  export function handleFolderDrop(
    path: string,
    isDir: boolean,
    addNode: (
      kind: NodeKind,
      overrides?: {
        config?: NodeConfig;
        position?: { x: number; y: number };
      },
    ) => void,
    position: { x: number; y: number },
  ): void {
    if (!path || !isDir) return;
    addNode("move", {
      config: { destination: path, auto: false },
      position,
    });
  }
  ```

- [ ] **Step 4: Run tests — expect all pass**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- tests/folderDrop.test.ts 2>&1 | tail -10
  ```

---

### Task 7: CSS tokens for Browse button and destination chips

**Files:**
- Modify: `packages/ui/src/styles.css`

**Interfaces:**
- Produces: `.sf-field-row`, `.sf-browse-btn`, `.sf-chips`, `.sf-chip`

- [ ] **Step 1: Append styles to styles.css**

  Append to `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/src/styles.css`:

  ```css
  /* ── Browse button row ──────────────────────────────────────────── */
  .sf-field-row {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    margin-bottom: 10px;
  }

  .sf-field-row .sf-field {
    flex: 1;
    margin-bottom: 0;
  }

  .sf-browse-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    border: 1px solid var(--sf-border);
    border-radius: var(--sf-radius-sm);
    background: var(--sf-surface);
    color: var(--sf-text-muted);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 150ms ease, color 150ms ease;
    flex-shrink: 0;
  }

  .sf-browse-btn:hover {
    background: var(--sf-primary-soft);
    color: var(--sf-primary);
    border-color: var(--sf-primary);
  }

  .sf-browse-btn:focus-visible {
    outline: 2px solid var(--sf-primary);
    outline-offset: 2px;
  }

  /* ── Destination chips ──────────────────────────────────────────── */
  .sf-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 10px;
  }

  .sf-chip {
    display: inline-block;
    padding: 2px 8px;
    border: 1px solid var(--sf-border);
    border-radius: 10px;
    background: var(--sf-bg);
    color: var(--sf-text-muted);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
  }

  .sf-chip:hover {
    background: var(--sf-primary-soft);
    color: var(--sf-primary);
    border-color: var(--sf-primary);
  }

  .sf-chip:focus-visible {
    outline: 2px solid var(--sf-primary);
    outline-offset: 2px;
  }
  ```

---

### Task 8: ConfigPanel — Browse buttons + destination chips + save recents

**Files:**
- Modify: `packages/ui/src/panels/ConfigPanel.tsx`
- Modify: `packages/ui/tests/config-panel.test.tsx`

**Interfaces:**
- Consumes: `api.pickFolder` (Task 3), `mergeRecents/buildChips/DEFAULTS` (Task 4), `mergeMany` (Task 4)
- Produces: Browse button on Watch "Folder path" field, Browse + chips on Move "Destination" field, recents saved on successful save

- [ ] **Step 1: Write failing tests**

  Append to `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/tests/config-panel.test.tsx`:

  ```typescript
  import { act } from "react";
  import { buildChips, DEFAULTS } from "../src/lib/recentDestinations";

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
      vi.restoreAllMocks();
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

  describe("ConfigPanel: destination chips", () => {
    it("renders default chips when no recents exist", () => {
      localStorage.removeItem("sf-recent-destinations");
      useFlowStore.getState().loadPipeline(demo);
      useFlowStore.getState().setSelected("m1");
      render(<ConfigPanel />);
      // At least one default should appear
      expect(screen.getByRole("button", { name: /Documents/i })).toBeTruthy();
    });

    it("clicking a chip sets the destination", () => {
      localStorage.removeItem("sf-recent-destinations");
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
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- tests/config-panel.test.tsx 2>&1 | tail -20
  ```

- [ ] **Step 3: Update ConfigPanel.tsx**

  Read `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/src/panels/ConfigPanel.tsx` first.

  Replace the entire file with:

  ```tsx
  import type {
    ClassifyConfig,
    FilterConfig,
    MoveConfig,
    NodeConfig,
    WatchConfig,
  } from "@sortflow/engine";
  import { FolderOpen, TriangleAlert } from "lucide-react";
  import { useEffect, useState } from "react";
  import { api } from "../bridge";
  import {
    DEFAULTS,
    buildChips,
    mergeMany,
    mergeRecents,
  } from "../lib/recentDestinations";
  import { useFlowStore } from "../store";

  export const PROMOTION_THRESHOLD = 10;

  const RECENTS_KEY = "sf-recent-destinations";

  function loadRecents(): string[] {
    try {
      return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  }

  function saveRecents(recents: string[]): void {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  }

  function TextField({
    label,
    value,
    onChange,
  }: { label: string; value: string; onChange: (v: string) => void }) {
    const id = `sf-field-${label.toLowerCase().replace(/\W+/g, "-")}`;
    return (
      <label htmlFor={id} className="sf-field">
        {label}
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }

  function CheckField({
    label,
    value,
    onChange,
  }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    const id = `sf-field-${label.toLowerCase().replace(/\W+/g, "-")}`;
    return (
      <label htmlFor={id} className="sf-field sf-field-check">
        <input
          id={id}
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  }

  function BrowseButton({ onPick }: { onPick: (path: string) => void }) {
    return (
      <button
        type="button"
        className="sf-browse-btn"
        aria-label="Browse for folder"
        onClick={async () => {
          const path = await api.pickFolder();
          if (path) onPick(path);
        }}
      >
        <FolderOpen size={14} strokeWidth={2} aria-hidden="true" />
        Browse…
      </button>
    );
  }

  function DestinationChips({
    onSelect,
  }: { onSelect: (path: string) => void }) {
    const recents = loadRecents();
    const chips = buildChips(recents, DEFAULTS);
    if (chips.length === 0) return null;
    return (
      <div className="sf-chips">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            className="sf-chip"
            title={chip}
            onClick={() => onSelect(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
    );
  }

  export function ConfigPanel() {
    const selectedId = useFlowStore((s) => s.selectedId);
    const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedId));
    const updateConfig = useFlowStore((s) => s.updateConfig);
    const toPipeline = useFlowStore((s) => s.toPipeline);
    const [problems, setProblems] = useState<string[]>([]);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [streak, setStreak] = useState<number | null>(null);
    useEffect(() => {
      setStreak(null);
      if (node?.data.kind === "move" && selectedId) {
        void api.approvalStreak(selectedId).then(setStreak);
      }
    }, [selectedId, node?.data.kind]);

    const save = async () => {
      setSaveError(null);
      try {
        const result = await api.setPipeline(toPipeline());
        setProblems(result.problems);
        const ok = result.problems.length === 0;
        setSaved(ok);
        if (ok) {
          // Collect all move-node destinations and merge into MRU.
          const destinations = toPipeline()
            .nodes.filter((n) => n.kind === "move")
            .map((n) => (n.config as MoveConfig).destination)
            .filter(Boolean);
          if (destinations.length > 0) {
            saveRecents(mergeMany(loadRecents(), destinations));
          }
        }
      } catch (err) {
        setSaveError(
          err instanceof Error ? err.message : "Failed to save pipeline",
        );
        setSaved(false);
      }
    };

    const set = (config: NodeConfig) =>
      selectedId && updateConfig(selectedId, config);

    return (
      <div className="sf-config">
        <h3>Node settings</h3>
        {!node && <p>Select a node to edit it.</p>}
        {node?.data.kind === "watch" &&
          (() => {
            const c = node.data.config as WatchConfig;
            return (
              <>
                <div className="sf-field-row">
                  <TextField
                    label="Folder path"
                    value={c.path}
                    onChange={(v) => set({ ...c, path: v })}
                  />
                  <BrowseButton onPick={(path) => set({ ...c, path })} />
                </div>
                <CheckField
                  label="Include subfolders"
                  value={c.recursive}
                  onChange={(v) => set({ ...c, recursive: v })}
                />
              </>
            );
          })()}
        {node?.data.kind === "filter" &&
          (() => {
            const c = node.data.config as FilterConfig;
            return (
              <>
                <TextField
                  label="Extensions (comma-separated)"
                  value={(c.extensions ?? []).join(", ")}
                  onChange={(v) =>
                    set({
                      ...c,
                      extensions: v
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
                <TextField
                  label="Name pattern"
                  value={c.namePattern ?? ""}
                  onChange={(v) => set({ ...c, namePattern: v || undefined })}
                />
                <CheckField
                  label="Pattern is regex"
                  value={c.regex ?? false}
                  onChange={(v) => set({ ...c, regex: v })}
                />
              </>
            );
          })()}
        {node?.data.kind === "classify" &&
          (() => {
            const c = node.data.config as ClassifyConfig;
            return (
              <>
                <TextField
                  label="Categories (comma-separated)"
                  value={c.categories.join(", ")}
                  onChange={(v) =>
                    set({
                      ...c,
                      categories: v
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
                <TextField
                  label="Ollama model"
                  value={c.model}
                  onChange={(v) => set({ ...c, model: v })}
                />
              </>
            );
          })()}
        {node?.data.kind === "move" &&
          (() => {
            const c = node.data.config as MoveConfig;
            return (
              <>
                <div className="sf-field-row">
                  <TextField
                    label="Destination"
                    value={c.destination}
                    onChange={(v) => set({ ...c, destination: v })}
                  />
                  <BrowseButton
                    onPick={(path) => set({ ...c, destination: path })}
                  />
                </div>
                <DestinationChips
                  onSelect={(path) => set({ ...c, destination: path })}
                />
                <CheckField
                  label="Automatic (skip review)"
                  value={c.auto}
                  onChange={(v) => set({ ...c, auto: v })}
                />
                {streak !== null && (
                  <p className="sf-streak">
                    Approved {streak} in a row
                    {streak >= PROMOTION_THRESHOLD && !c.auto && (
                      <button
                        type="button"
                        onClick={() => set({ ...c, auto: true })}
                      >
                        Make automatic
                      </button>
                    )}
                  </p>
                )}
              </>
            );
          })()}
        <button type="button" className="sf-save" onClick={() => void save()}>
          Save &amp; Apply
        </button>
        {saved && problems.length === 0 && (
          <p className="sf-saved">Pipeline applied ✓</p>
        )}
        {problems.length > 0 && (
          <div className="sf-problems">
            {problems.map((p) => (
              <p key={p}>
                <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
                {p}
              </p>
            ))}
          </div>
        )}
        {saveError && (
          <div className="sf-problems" role="alert">
            <p>
              <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
              {saveError}
            </p>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Run ConfigPanel tests — expect all pass**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- tests/config-panel.test.tsx 2>&1 | tail -20
  ```

---

### Task 9: App.tsx — drag-drop with ReactFlowProvider refactor

**Files:**
- Modify: `packages/ui/src/App.tsx`

**Interfaces:**
- Consumes: `api.getPathForFile`, `api.isDirectory` (Task 3), `handleFolderDrop` (Task 6), `addNode` with overrides (Task 5)

- [ ] **Step 1: Refactor App.tsx with FlowCanvas child**

  Read `/Users/datnguyen/Desktop/PROJECTS/sortflow/packages/ui/src/App.tsx` first.

  Replace the entire file with:

  ```tsx
  import {
    Background,
    BackgroundVariant,
    Controls,
    type Edge,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
  } from "@xyflow/react";
  import "@xyflow/react/dist/style.css";
  import type { FolderScan } from "@sortflow/engine";
  import { useRef, useState } from "react";
  import { api } from "./bridge";
  import { DeletableEdge } from "./edges/DeletableEdge";
  import { handleFolderDrop } from "./lib/folderDrop";
  import { nodeTypes } from "./nodes";
  import { AutoSetupBanner } from "./panels/AutoSetupBanner";
  import { ConfigPanel } from "./panels/ConfigPanel";
  import { HistoryPanel } from "./panels/HistoryPanel";
  import { Palette } from "./panels/Palette";
  import { ReviewTray } from "./panels/ReviewTray";
  import { useFlowStore } from "./store";
  import "./styles.css";

  const edgeTypes = { default: DeletableEdge };

  interface BannerState {
    scan: FolderScan;
    ruleCount: number;
    error?: string;
  }

  /** Inner component — lives inside ReactFlowProvider so useReactFlow works. */
  function FlowCanvas({
    banner,
    onDismissBanner,
    onAutoSetupResult,
    onAutoSetupError,
  }: {
    banner: BannerState | null;
    onDismissBanner: () => void;
    onAutoSetupResult: (scan: FolderScan, ruleCount: number) => void;
    onAutoSetupError: (msg: string) => void;
  }) {
    const nodes = useFlowStore((s) => s.nodes);
    const edges = useFlowStore((s) => s.edges);
    const onNodesChange = useFlowStore((s) => s.onNodesChange);
    const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
    const onConnect = useFlowStore((s) => s.onConnect);
    const setSelected = useFlowStore((s) => s.setSelected);
    const removeEdge = useFlowStore((s) => s.removeEdge);
    const replaceEdge = useFlowStore((s) => s.replaceEdge);
    const addNode = useFlowStore((s) => s.addNode);
    const { screenToFlowPosition } = useReactFlow();

    const reconnectSucceeded = useRef(false);

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };

    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const path = api.getPathForFile(file);
      if (!path) return;
      const isDir = await api.isDirectory(path);
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      handleFolderDrop(path, isDir, addNode, position);
    };

    return (
      <div className="sf-canvas">
        {banner && (
          <AutoSetupBanner
            scan={banner.scan}
            ruleCount={banner.ruleCount}
            error={banner.error}
            onDismiss={onDismissBanner}
          />
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={(sel) => setSelected(sel.nodes[0]?.id ?? null)}
          deleteKeyCode={["Backspace", "Delete"]}
          connectionRadius={40}
          edgesReconnectable
          onReconnectStart={() => {
            reconnectSucceeded.current = false;
          }}
          onReconnect={(oldEdge: Edge, newConnection) => {
            reconnectSucceeded.current = true;
            replaceEdge(oldEdge.id, newConnection);
          }}
          onReconnectEnd={(_event: MouseEvent | TouchEvent, edge: Edge) => {
            if (!reconnectSucceeded.current) {
              removeEdge(edge.id);
            }
          }}
          onDragOver={handleDragOver}
          onDrop={(e) => void handleDrop(e)}
          fitView
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="#d4d4dd"
          />
          <Controls />
        </ReactFlow>
      </div>
    );
  }

  export default function App() {
    const [banner, setBanner] = useState<BannerState | null>(null);

    function handleAutoSetupResult(scan: FolderScan, ruleCount: number) {
      setBanner({ scan, ruleCount });
    }

    function handleAutoSetupError(message: string) {
      setBanner({
        scan: { total: 0, buckets: [] },
        ruleCount: 0,
        error: message,
      });
    }

    return (
      <div className="sf-shell">
        <div className="sf-app">
          <Palette
            onAutoSetupResult={handleAutoSetupResult}
            onAutoSetupError={handleAutoSetupError}
          />
          <ReactFlowProvider>
            <FlowCanvas
              banner={banner}
              onDismissBanner={() => setBanner(null)}
              onAutoSetupResult={handleAutoSetupResult}
              onAutoSetupError={handleAutoSetupError}
            />
          </ReactFlowProvider>
          <ConfigPanel />
        </div>
        <div className="sf-dock">
          <ReviewTray />
          <HistoryPanel />
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Run full test suite**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm test 2>&1 | tail -20
  ```

---

### Task 10: Gate + commit

**Files:** No new files

- [ ] **Step 1: Run full gate**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm test && pnpm check && pnpm --filter @sortflow/ui build 2>&1 | tail -30
  ```

  Expected: all green.

- [ ] **Step 2: Stage all changed/new files**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && git add \
    packages/app/src/ipc.ts \
    packages/app/src/preload.ts \
    packages/ui/src/bridge.ts \
    packages/ui/src/store.ts \
    packages/ui/src/lib/recentDestinations.ts \
    packages/ui/src/lib/folderDrop.ts \
    packages/ui/src/panels/ConfigPanel.tsx \
    packages/ui/src/App.tsx \
    packages/ui/src/styles.css \
    packages/ui/tests/recentDestinations.test.ts \
    packages/ui/tests/folderDrop.test.ts \
    packages/ui/tests/config-panel.test.tsx \
    packages/ui/tests/store.test.ts \
    docs/superpowers/plans/2026-07-01-folder-picking-ux.md
  ```

- [ ] **Step 3: Commit with exact message (NO trailers)**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && git commit -m "feat(ui): folder browsing, recent destination chips and Finder drag-drop"
  ```

- [ ] **Step 4: Verify commit**

  ```bash
  cd /Users/datnguyen/Desktop/PROJECTS/sortflow && git log --oneline -1
  ```

---

### Task 11: Write report

- [ ] **Step 1: Write concise report**

  Create `/Users/datnguyen/Desktop/PROJECTS/sortflow/.superpowers/sdd/folderpick-report.md` with status, commit SHA, test summary, adaptations. Under 10 lines.
