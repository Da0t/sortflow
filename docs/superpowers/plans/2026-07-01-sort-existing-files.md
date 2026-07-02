# Sort Existing Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `scanExisting` option to Watch nodes so users can run a folder's pre-existing files through the pipeline as review-tray proposals, not just files that arrive after the watcher starts.

**Architecture:** The change flows through three layers — (1) types to add the flag, (2) watcher to pass `ignoreInitial: !cfg.scanExisting` to chokidar (existing `awaitWriteFinish` path handles initial files identically to new arrivals), (3) engine `handleFile` gains a duplicate-proposal guard so engine restarts don't double-propose. Autosetup defaults to `scanExisting: true`. UI adds a checkbox in ConfigPanel and a canvas hint in WatchNode.

**Tech Stack:** TypeScript, chokidar, vitest (engine), React + zustand + @testing-library/react (UI), Biome (linting/formatting)

## Global Constraints

- `pnpm test` must stay green (133 existing tests pass; new tests added)
- `pnpm check` (Biome) must pass — run `pnpm biome check --write .` to auto-fix
- `pnpm --filter @sortflow/ui build` must succeed
- Commit author = Dat Nguyen (repo configured identity); NO Co-Authored-By trailers
- Commit message exactly: `feat: optional sort-existing-files sweep on watch nodes`
- Do NOT push

---

### Task 1: types.ts — add `scanExisting` to WatchConfig

**Files:**
- Modify: `packages/engine/src/types.ts:3-6`

**Interfaces:**
- Produces: `WatchConfig` gains `scanExisting?: boolean` — used by Task 2 (watcher), Task 3 (engine), Task 4 (autosetup), Task 5 (UI ConfigPanel), Task 6 (UI WatchNode)

- [ ] **Step 1: Write the failing test** (skipped — type-only change, verified by Task 2's test)

- [ ] **Step 2: Modify types.ts**

```typescript
export interface WatchConfig {
  path: string;
  recursive: boolean;
  scanExisting?: boolean;
}
```

- [ ] **Step 3: Run type check**

Run: `cd packages/engine && pnpm tsc --noEmit`
Expected: no errors

---

### Task 2: watcher.ts + watcher.test.ts — scanExisting flag

**Files:**
- Modify: `packages/engine/src/watcher.ts:21-28`
- Modify: `packages/engine/tests/watcher.test.ts`

**Interfaces:**
- Consumes: `WatchConfig.scanExisting?: boolean` from Task 1
- Produces: `FolderWatcher.watch` with correct `ignoreInitial` — used by Task 3 (engine.ts `start`)

- [ ] **Step 1: Write the failing test** — add to `packages/engine/tests/watcher.test.ts`

```typescript
it("emits pre-existing files when scanExisting is true", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sortflow-watch-"));
  await writeFile(join(dir, "old.txt"), "x");
  const { events, watcher } = collect();
  watcher.watch("w1", { path: dir, recursive: false, scanExisting: true });
  await sleep(800); // stability threshold passes
  expect(events).toHaveLength(1);
  expect(events[0].file.name).toBe("old.txt");
}, 10_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && pnpm vitest run tests/watcher.test.ts`
Expected: FAIL — "emits pre-existing files when scanExisting is true" — events is empty

- [ ] **Step 3: Implement the fix in watcher.ts** — change `ignoreInitial: true` to `ignoreInitial: !cfg.scanExisting`

```typescript
watch(nodeId: string, cfg: WatchConfig): void {
  const w = watch(cfg.path, {
    ignoreInitial: !cfg.scanExisting,
    depth: cfg.recursive ? undefined : 0,
    awaitWriteFinish: {
      stabilityThreshold: this.options.stabilityThreshold ?? 1500,
      pollInterval: this.options.pollInterval ?? 100,
    },
  });
  // rest unchanged
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `cd packages/engine && pnpm vitest run tests/watcher.test.ts`
Expected: 4 tests pass (3 existing + 1 new)

---

### Task 3: engine.ts — duplicate-proposal guard + tests

**Files:**
- Modify: `packages/engine/src/engine.ts:120-162` (`handleFile`)
- Modify: `packages/engine/tests/engine.test.ts`

**Interfaces:**
- Consumes: `ProposalStore.list()` returns `Proposal[]` with `filePath` and `status` fields
- Produces: `handleFile` skips if pending proposal exists for same `filePath`

- [ ] **Step 1: Write the failing tests** — add to `packages/engine/tests/engine.test.ts`

```typescript
it("scanExisting: 2 pre-existing files produce 2 proposals without new arrivals", async () => {
  const root = await mkdtemp(join(tmpdir(), "sortflow-scan-"));
  const inbox = join(root, "inbox");
  const dest = join(root, "sorted");
  await mkdir(inbox, { recursive: true });
  await writeFile(join(inbox, "a.txt"), "aaa");
  await writeFile(join(inbox, "b.txt"), "bbb");

  const pipeline: Pipeline = {
    nodes: [
      { id: "w1", kind: "watch", config: { path: inbox, recursive: false, scanExisting: true }, position: { x: 0, y: 0 } },
      { id: "f1", kind: "filter", config: { extensions: [".txt"] }, position: { x: 0, y: 0 } },
      { id: "m1", kind: "move", config: { destination: dest, auto: false }, position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: "e1", source: "w1", sourceHandle: "out", target: "f1" },
      { id: "e2", source: "f1", sourceHandle: "match", target: "m1" },
    ],
  };
  const neverClassify: Classifier = { classify: async () => { throw new Error("no classify"); } };
  engine = new Engine({ dataDir: join(root, "data"), classifier: neverClassify, watcherOptions: FAST });
  await engine.start(pipeline);
  await sleep(800);

  const proposals = engine.listProposals();
  expect(proposals).toHaveLength(2);
  expect(proposals.every(p => p.status === "pending")).toBe(true);
}, 15_000);

it("scanExisting: restart engine does not duplicate pending proposals", async () => {
  const root = await mkdtemp(join(tmpdir(), "sortflow-dedup-"));
  const inbox = join(root, "inbox");
  const dest = join(root, "sorted");
  await mkdir(inbox, { recursive: true });
  await writeFile(join(inbox, "file.txt"), "content");

  const pipeline: Pipeline = {
    nodes: [
      { id: "w1", kind: "watch", config: { path: inbox, recursive: false, scanExisting: true }, position: { x: 0, y: 0 } },
      { id: "f1", kind: "filter", config: { extensions: [".txt"] }, position: { x: 0, y: 0 } },
      { id: "m1", kind: "move", config: { destination: dest, auto: false }, position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: "e1", source: "w1", sourceHandle: "out", target: "f1" },
      { id: "e2", source: "f1", sourceHandle: "match", target: "m1" },
    ],
  };
  const neverClassify: Classifier = { classify: async () => { throw new Error("no classify"); } };

  // First engine run
  engine = new Engine({ dataDir: join(root, "data"), classifier: neverClassify, watcherOptions: FAST });
  await engine.start(pipeline);
  await sleep(800);
  expect(engine.listProposals()).toHaveLength(1);
  await engine.stop();

  // Second engine run on same dataDir
  engine = new Engine({ dataDir: join(root, "data"), classifier: neverClassify, watcherOptions: FAST });
  await engine.start(pipeline);
  await sleep(800);

  expect(engine.listProposals()).toHaveLength(1); // still exactly one
}, 15_000);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && pnpm vitest run tests/engine.test.ts`
Expected: 2 new tests fail (dedup test: 2 proposals instead of 1)

- [ ] **Step 3: Implement duplicate-proposal guard in engine.ts**

In `handleFile`, before `await this.proposalStore.add(...)`, add:

```typescript
// Duplicate-proposal guard: if a pending proposal already exists for this
// file (e.g. engine restart re-scans with scanExisting), skip it.
const alreadyPending = this.proposalStore
  .list()
  .some((p) => p.filePath === file.path && p.status === "pending");
if (alreadyPending) return;
```

- [ ] **Step 4: Run all engine tests**

Run: `cd packages/engine && pnpm vitest run`
Expected: all tests pass (existing 90 + 3 new = 93)

---

### Task 4: autosetup.ts + autosetup.test.ts — scanExisting default

**Files:**
- Modify: `packages/engine/src/autosetup.ts:172-178`
- Modify: `packages/engine/tests/autosetup.test.ts`

**Interfaces:**
- Consumes: `WatchConfig.scanExisting?: boolean` from Task 1
- Produces: `suggestPipeline` watch node config includes `scanExisting: true`

- [ ] **Step 1: Write the failing test** — add to `packages/engine/tests/autosetup.test.ts`

```typescript
it("watch node has scanExisting: true", () => {
  const scan = { total: 0, buckets: [] };
  const pipeline = suggestPipeline("/watch/path", scan);
  const watchNode = pipeline.nodes[0];
  expect((watchNode.config as { scanExisting: boolean }).scanExisting).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && pnpm vitest run tests/autosetup.test.ts`
Expected: FAIL — scanExisting is undefined

- [ ] **Step 3: Update suggestPipeline in autosetup.ts**

```typescript
const watchNode = {
  id: "auto-w",
  kind: "watch" as const,
  config: {
    path: watchPath,
    recursive: false,
    scanExisting: true,
  } satisfies WatchConfig,
  position: { x: 40, y: 200 },
};
```

- [ ] **Step 4: Run all engine tests**

Run: `cd packages/engine && pnpm vitest run`
Expected: all pass

---

### Task 5: UI ConfigPanel — scanExisting checkbox

**Files:**
- Modify: `packages/ui/src/panels/ConfigPanel.tsx:154-174`
- Modify: `packages/ui/tests/config-panel.test.tsx`

**Interfaces:**
- Consumes: `WatchConfig.scanExisting?: boolean` from Task 1 (via `@sortflow/engine` re-export)
- Produces: ConfigPanel renders `CheckField` with label "Sort existing files when applied" bound to `scanExisting`

- [ ] **Step 1: Write the failing tests** — add to `packages/ui/tests/config-panel.test.tsx`

Add watch pipeline fixture and tests:

```typescript
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
    expect(screen.getByLabelText(/sort existing files when applied/i)).toBeTruthy();
  });

  it("toggling scanExisting updates toPipeline() watch config", () => {
    useFlowStore.getState().loadPipeline(watchDemo);
    useFlowStore.getState().setSelected("w1");
    render(<ConfigPanel />);
    const cb = screen.getByLabelText(/sort existing files when applied/i) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    const cfg = useFlowStore.getState().toPipeline().nodes[0].config as WatchConfig;
    expect(cfg.scanExisting).toBe(true);
  });
});
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run: `cd packages/ui && pnpm vitest run tests/config-panel.test.tsx`
Expected: 2 new tests fail — label not found

- [ ] **Step 3: Add scanExisting CheckField to ConfigPanel's watch section**

After the existing `CheckField` for "Include subfolders":

```tsx
<CheckField
  label="Sort existing files when applied"
  value={c.scanExisting ?? false}
  onChange={(v) => set({ ...c, scanExisting: v })}
/>
```

- [ ] **Step 4: Run UI tests**

Run: `cd packages/ui && pnpm vitest run`
Expected: all pass

---

### Task 6: UI WatchNode — scanExisting hint

**Files:**
- Modify: `packages/ui/src/nodes/WatchNode.tsx`

**Interfaces:**
- Consumes: `WatchConfig.scanExisting?: boolean` from Task 1

- [ ] **Step 1: Add "+ existing files" hint to WatchNode.tsx**

```tsx
<div className="sf-node-body">
  {cfg.path}
  {cfg.scanExisting && (
    <span className="sf-node-hint">+ existing files</span>
  )}
</div>
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: all 133+ tests pass

---

### Task 7: Gate + format + commit

- [ ] **Step 1: Run Biome auto-fix**

Run: `pnpm biome check --write .`

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all tests pass

- [ ] **Step 3: UI build check**

Run: `pnpm --filter @sortflow/ui build`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/types.ts \
        packages/engine/src/watcher.ts \
        packages/engine/src/engine.ts \
        packages/engine/src/autosetup.ts \
        packages/engine/tests/watcher.test.ts \
        packages/engine/tests/engine.test.ts \
        packages/engine/tests/autosetup.test.ts \
        packages/ui/src/panels/ConfigPanel.tsx \
        packages/ui/src/nodes/WatchNode.tsx \
        packages/ui/tests/config-panel.test.tsx
git commit -m "feat: optional sort-existing-files sweep on watch nodes"
```

- [ ] **Step 5: Write sweep-report.md**

Save concise report to `/Users/datnguyen/Desktop/PROJECTS/sortflow/.superpowers/sdd/sweep-report.md`
