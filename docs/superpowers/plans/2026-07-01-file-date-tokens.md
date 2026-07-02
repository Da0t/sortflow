# File-Date Tokens and Age Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `{fileYYYY}/{fileMM}/{fileDD}` destination tokens derived from a file's own birthtime/mtime, and expose `minAgeDays`/`maxAgeDays` filter options in the Config Panel UI.

**Architecture:** Engine layer adds `birthtimeMs` to `IncomingFile`, threads a `fileDate` into `expandDestination`'s context, and exposes three new tokens. UI layer adds two number inputs to the filter section, a token hint below the Move destination field, and a subfolder warning below the Watch recursive checkbox.

**Tech Stack:** TypeScript (engine), React + Zustand (UI), Vitest, Biome, pnpm monorepo

## Global Constraints

- Gate: `pnpm test` + `pnpm check` + `pnpm --filter @sortflow/ui build` must all pass before commit
- Author identity: Dat Nguyen (git config unchanged)
- No Co-Authored-By trailers in commit message
- Commit message exactly: `feat: file-date tokens and age filters for date-aware sorting`
- Do NOT push to remote
- Report to `.superpowers/sdd/datesort-report.md`

---

### Task 1: Engine — `IncomingFile.birthtimeMs` and watcher stat

**Files:**
- Modify: `packages/engine/src/types.ts` (add `birthtimeMs?: number` to `IncomingFile`)
- Modify: `packages/engine/src/watcher.ts` (include `birthtimeMs` from `s.birthtimeMs`)

**Interfaces:**
- Produces: `IncomingFile.birthtimeMs?: number` used by engine.ts in Task 3

- [ ] **Step 1: Add `birthtimeMs` to `IncomingFile` in types.ts**

In `packages/engine/src/types.ts`, add one line to `IncomingFile`:
```ts
export interface IncomingFile {
  path: string;
  name: string;
  ext: string;
  bytes: number;
  mtimeMs: number;
  birthtimeMs?: number;  // file creation time; absent on filesystems that report 0
}
```

- [ ] **Step 2: Thread `birthtimeMs` through the watcher stat call**

In `packages/engine/src/watcher.ts`, inside the `"add"` handler, add `birthtimeMs` to the emitted object:
```ts
this.onFile(nodeId, {
  path,
  name: basename(path),
  ext: extname(path).toLowerCase(),
  bytes: s.size,
  mtimeMs: s.mtimeMs,
  birthtimeMs: s.birthtimeMs || undefined,  // guard: APFS returns 0 when unknown
});
```

- [ ] **Step 3: Run engine tests to confirm nothing is broken**

```bash
pnpm --filter @sortflow/engine test
```
Expected: 94 tests pass.

---

### Task 2: Engine — `fileDate` in `DestContext` and new tokens

**Files:**
- Modify: `packages/engine/src/move.ts`
- Modify: `packages/engine/tests/move.test.ts`

**Interfaces:**
- Consumes: `DestContext` from move.ts
- Produces: `expandDestination` now accepts `ctx.fileDate?: Date` and resolves `{fileYYYY}`, `{fileMM}`, `{fileDD}`

- [ ] **Step 1: Write failing tests for new tokens in move.test.ts**

Add a new `describe` block at the bottom of `packages/engine/tests/move.test.ts`:
```ts
describe("expandDestination — file-date tokens", () => {
  const ctx = {
    category: "Shots",
    date: new Date(2026, 6, 1),  // 2026-07-01 (the move date)
    ext: ".png",
    home: "/Users/dat",
    fileDate: new Date(2024, 2, 15),  // 2024-03-15 (the file's own date)
  };

  it("expands {fileYYYY}/{fileMM}/{fileDD} from fileDate", () => {
    expect(
      expandDestination("~/Pics/{fileYYYY}/{fileMM}/{fileDD}", ctx),
    ).toBe("/Users/dat/Pics/2024/03/15");
  });

  it("falls back to date when fileDate is absent", () => {
    const noDate = { ...ctx, fileDate: undefined };
    expect(expandDestination("~/Pics/{fileYYYY}-{fileMM}-{fileDD}", noDate)).toBe(
      "/Users/dat/Pics/2026-07-01",
    );
  });

  it("mixed template: {fileYYYY} uses fileDate, {MM} uses date", () => {
    expect(
      expandDestination("~/Pics/{fileYYYY}/{MM}", ctx),
    ).toBe("/Users/dat/Pics/2024/07");
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
pnpm --filter @sortflow/engine test -- move
```
Expected: 3 new tests FAIL (token not expanded).

- [ ] **Step 3: Add `fileDate` to `DestContext` and implement tokens in move.ts**

Replace the `DestContext` interface and `expandDestination` function:
```ts
export interface DestContext {
  category?: string;
  date: Date;
  ext: string;   // with dot
  home: string;
  fileDate?: Date;
}

export function expandDestination(template: string, ctx: DestContext): string {
  let out = template;
  if (out.startsWith("~")) out = ctx.home + out.slice(1);
  const yyyy = String(ctx.date.getFullYear());
  const mm = String(ctx.date.getMonth() + 1).padStart(2, "0");
  const src = ctx.fileDate ?? ctx.date;
  const fileYYYY = String(src.getFullYear());
  const fileMM = String(src.getMonth() + 1).padStart(2, "0");
  const fileDD = String(src.getDate()).padStart(2, "0");
  return out
    .replaceAll("{YYYY}", yyyy)
    .replaceAll("{MM}", mm)
    .replaceAll("{fileYYYY}", fileYYYY)
    .replaceAll("{fileMM}", fileMM)
    .replaceAll("{fileDD}", fileDD)
    .replaceAll("{ext}", ctx.ext.replace(/^\./, ""))
    .replaceAll("{category}", ctx.category ?? "Unsorted");
}
```

- [ ] **Step 4: Run move tests — all must pass**

```bash
pnpm --filter @sortflow/engine test -- move
```
Expected: all move tests pass (original 3 + new 3 = 6).

---

### Task 3: Engine — thread `fileDate` through `handleFile` in engine.ts

**Files:**
- Modify: `packages/engine/src/engine.ts`
- Modify: `packages/engine/tests/engine.test.ts`

**Interfaces:**
- Consumes: `IncomingFile.birthtimeMs` (Task 1), `DestContext.fileDate` (Task 2)
- Produces: `expandDestination` called with `fileDate: new Date(file.birthtimeMs ?? file.mtimeMs)`

- [ ] **Step 1: Thread `fileDate` into `expandDestination` call in engine.ts**

In `handleFile`, change the `expandDestination` call:
```ts
const destDir = expandDestination(cfg.destination, {
  category: route.category,
  date: new Date(this.now()),
  ext: file.ext,
  home: homedir(),
  fileDate: new Date(file.birthtimeMs ?? file.mtimeMs),
});
```

- [ ] **Step 2: Add a sanity engine test for `{fileYYYY}` template**

Add one test to the `describe("Engine")` block in `packages/engine/tests/engine.test.ts` that verifies a 4-digit year folder is produced. Since `birthtimeMs` can't be portably set (APFS will use actual creation time), test that the proposal `destDir` matches `/^\d{4}$/` when the template is `{fileYYYY}`:

```ts
it("fileYYYY token produces a 4-digit-year folder in the proposal", async () => {
  const root = await mkdtemp(join(tmpdir(), "sortflow-filedate-"));
  const inbox = join(root, "inbox");
  await mkdir(inbox, { recursive: true });
  const pipeline: Pipeline = {
    nodes: [
      {
        id: "w1",
        kind: "watch",
        config: { path: inbox, recursive: false },
        position: { x: 0, y: 0 },
      },
      {
        id: "f1",
        kind: "filter",
        config: { extensions: [".txt"] },
        position: { x: 0, y: 0 },
      },
      {
        id: "m1",
        kind: "move",
        config: { destination: join(root, "{fileYYYY}"), auto: false },
        position: { x: 0, y: 0 },
      },
    ],
    edges: [
      { id: "e1", source: "w1", sourceHandle: "out", target: "f1" },
      { id: "e2", source: "f1", sourceHandle: "match", target: "m1" },
    ],
  };
  const neverClassify: Classifier = {
    classify: async () => {
      throw new Error("no classify");
    },
  };
  engine = new Engine({
    dataDir: join(root, "data"),
    classifier: neverClassify,
    watcherOptions: FAST,
  });
  await engine.start(pipeline);
  await sleep(300);

  const proposalP = nextProposal(engine);
  await writeFile(join(inbox, "file.txt"), "hi");
  const proposal = await proposalP;

  // destDir should be like /tmp/.../2026 — a 4-digit year
  expect(/\d{4}$/.test(proposal.destDir)).toBe(true);
}, 15_000);
```

- [ ] **Step 3: Run all engine tests — all must pass**

```bash
pnpm --filter @sortflow/engine test
```
Expected: 95 tests pass (94 + 1 new).

---

### Task 4: UI — Filter section age inputs in ConfigPanel

**Files:**
- Modify: `packages/ui/src/panels/ConfigPanel.tsx`
- Modify: `packages/ui/tests/config-panel.test.tsx`

**Interfaces:**
- Consumes: `FilterConfig.minAgeDays`, `FilterConfig.maxAgeDays` (already in engine types)
- Produces: two `<input type="number">` fields wired to those config keys

- [ ] **Step 1: Write failing UI tests for age inputs**

Add a new `describe` block in `packages/ui/tests/config-panel.test.tsx`:
```ts
import type { FilterConfig } from "@sortflow/engine";

// Add at the bottom of the file:

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
    expect(screen.getByText(/fileYYYY/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run UI tests to see new tests fail**

```bash
pnpm --filter @sortflow/ui test
```
Expected: 5 new tests fail.

- [ ] **Step 3: Implement age inputs, token helper, and subfolder warning in ConfigPanel.tsx**

In the filter section of ConfigPanel.tsx, add after the `CheckField` for regex:
```tsx
<label htmlFor="sf-field-older-than-days-" className="sf-field">
  Older than (days)
  <input
    id="sf-field-older-than-days-"
    type="number"
    min={0}
    value={c.minAgeDays ?? ""}
    onChange={(e) => {
      const v = e.target.value;
      const n = Number(v);
      set({ ...c, minAgeDays: v === "" || n < 0 ? undefined : n });
    }}
  />
</label>
<label htmlFor="sf-field-newer-than-days-" className="sf-field">
  Newer than (days)
  <input
    id="sf-field-newer-than-days-"
    type="number"
    min={0}
    value={c.maxAgeDays ?? ""}
    onChange={(e) => {
      const v = e.target.value;
      const n = Number(v);
      set({ ...c, maxAgeDays: v === "" || n < 0 ? undefined : n });
    }}
  />
</label>
```

In the Watch section, after the `CheckField` for "Include subfolders":
```tsx
{c.recursive && (
  <p className="sf-hint-muted" style={{ fontSize: 12, color: "var(--sf-text-muted)" }}>
    Files inside subfolders are sorted individually — folders themselves are never moved.
  </p>
)}
```

In the Move section, after the `DestinationChips`:
```tsx
<p className="sf-hint-muted" style={{ fontSize: 12, color: "var(--sf-text-muted)" }}>
  Tokens: {"{category}"} {"{YYYY}"} {"{MM}"} {"{fileYYYY}"} {"{fileMM}"} {"{fileDD}"} — file… tokens use the file's own date
</p>
```

Note: use `htmlFor` and matching `id` values that match the pattern `sf-field-${label.toLowerCase().replace(/\W+/g, "-")}` so `getByLabelText` works. The `id` for "Older than (days)" maps to `sf-field-older-than-days-`, and for "Newer than (days)" to `sf-field-newer-than-days-`.

- [ ] **Step 4: Run UI tests — all must pass**

```bash
pnpm --filter @sortflow/ui test
```
Expected: all tests pass (51 existing + 5 new = 56).

---

### Task 5: UI — FilterNode summary shows age bounds

**Files:**
- Modify: `packages/ui/src/nodes/FilterNode.tsx`

- [ ] **Step 1: Update the summary computation in FilterNode.tsx**

Replace the `summary` computation:
```tsx
const ageParts: string[] = [];
if (cfg.minAgeDays != null) ageParts.push(`> ${cfg.minAgeDays}d`);
if (cfg.maxAgeDays != null) ageParts.push(`< ${cfg.maxAgeDays}d`);
const summary =
  [
    cfg.extensions?.length ? cfg.extensions.join(" ") : null,
    cfg.namePattern ?? null,
    ageParts.length ? ageParts.join(" ") : null,
  ]
    .filter(Boolean)
    .join(" · ") || "any file";
```

- [ ] **Step 2: Run UI tests to confirm nothing broke**

```bash
pnpm --filter @sortflow/ui test
```
Expected: all tests pass.

---

### Task 6: README — document file-date tokens

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Extend the tokens line in README.md**

Change:
```
Move destinations accept tokens: `~/Docs/{category}/{YYYY}-{MM}` sorts by
AI category and month automatically.
```
To:
```
Move destinations accept tokens: `~/Docs/{category}/{YYYY}-{MM}` sorts by
AI category and month automatically. Use file-date tokens
(`{fileYYYY}`, `{fileMM}`, `{fileDD}`) to sort by the file's own date —
sweeping old files into `~/Pictures/Screenshots/{fileYYYY}-{fileMM}` groups
them by when they were created, not when you ran Sortflow.
```

---

### Task 7: Gate check and commit

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```
Expected: all tests pass.

- [ ] **Step 2: Run Biome check**

```bash
pnpm check
```
Expected: no errors.

- [ ] **Step 3: Build the UI**

```bash
pnpm --filter @sortflow/ui build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/types.ts \
        packages/engine/src/watcher.ts \
        packages/engine/src/move.ts \
        packages/engine/src/engine.ts \
        packages/engine/tests/move.test.ts \
        packages/engine/tests/engine.test.ts \
        packages/ui/src/panels/ConfigPanel.tsx \
        packages/ui/src/nodes/FilterNode.tsx \
        packages/ui/tests/config-panel.test.tsx \
        README.md

git commit -m "feat: file-date tokens and age filters for date-aware sorting"
```

- [ ] **Step 5: Write report to `.superpowers/sdd/datesort-report.md`**

Include: status, commit SHA + subject, test summary (engine N tests, UI M tests), and any adaptations made.
