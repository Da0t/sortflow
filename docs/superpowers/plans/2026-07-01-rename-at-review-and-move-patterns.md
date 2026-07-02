# Rename at Review Time and Rename Patterns on Move Nodes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (A) manual rename at review time (pencil button in ReviewTray → inline text input) and (B) automatic rename patterns on Move nodes (`{name}`, `{fileYYYY}`, `{fileMM}`, `{fileDD}`, `{YYYY}`, `{MM}`, `{DD}` token substitution in the stem only, extension always preserved).

**Architecture:** Pure engine layer first (types → move.ts function → executor → proposals store update method → engine wiring), then IPC/bridge contract additions (three files must change atomically to keep Electron preload matching the bridge type and ipc handler), then UI (ReviewTray inline edit + ConfigPanel field + MoveNode display). TDD throughout: write failing tests, implement, verify green.

**Tech Stack:** TypeScript, Node.js fs/promises (engine), Electron ipcMain/contextBridge (app), React + zustand (ui), vitest + @testing-library/react (tests), Biome (lint/format), lucide-react (Pencil icon).

## Global Constraints

- Extension is ALWAYS preserved automatically; patterns/renames apply to stem only.
- Sanitize: strip `/ \\ : * ? " < > |` and leading dots, trim whitespace; empty → keep original stem.
- Collision suffixing (` (1)`) applies to the FINAL name after rename.
- `targetName` on Proposal = final filename incl. extension (absent = keep original).
- Gate: `pnpm test` + `pnpm check` + `pnpm --filter @sortflow/ui build` green before commit.
- Biome: `pnpm biome check --write .` must pass with no errors.
- Commit message exactly: `feat: rename at review time and rename patterns on move nodes`
- No trailers of any kind (no Co-Authored-By).
- Author = repo's configured identity (Dat Nguyen); do NOT touch git config.
- Do NOT push.
- Report to: `/Users/datnguyen/Desktop/PROJECTS/sortflow/.superpowers/sdd/rename-report.md`

---

### Task 1: types.ts — add renamePattern and targetName

**Files:**
- Modify: `packages/engine/src/types.ts`

**Interfaces:**
- Produces: `MoveConfig.renamePattern?: string`, `Proposal.targetName?: string` — used by all subsequent tasks.

- [ ] **Step 1: Add fields to types.ts**

In `packages/engine/src/types.ts`, update `MoveConfig`:
```typescript
export interface MoveConfig {
  destination: string; // may contain {category} {YYYY} {MM} {ext}, leading ~
  auto: boolean; // true = execute without review
  renamePattern?: string; // optional stem pattern; tokens: {name} {fileYYYY} {fileMM} {fileDD} {YYYY} {MM} {DD}
}
```

And update `Proposal`:
```typescript
export interface Proposal {
  id: string;
  filePath: string;
  fileName: string;
  destDir: string; // fully expanded destination directory
  targetName?: string; // final filename incl. extension; absent = keep original
  moveNodeId: string;
  routeNodeIds: string[]; // node ids traversed (for UI animation)
  createdAt: number;
  status: ProposalStatus;
  error?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm check`
Expected: passes (no type errors from just adding optional fields).

---

### Task 2: move.ts — add expandRename pure function

**Files:**
- Modify: `packages/engine/src/move.ts`
- Test: `packages/engine/tests/move.test.ts`

**Interfaces:**
- Produces: `expandRename(pattern: string, ctx: { stem: string; fileDate: Date; moveDate: Date }): string`

- [ ] **Step 1: Write failing tests for expandRename**

Append to `packages/engine/tests/move.test.ts`:
```typescript
describe("expandRename", () => {
  const ctx = {
    stem: "my report",
    fileDate: new Date(2024, 2, 15), // 2024-03-15
    moveDate: new Date(2026, 6, 1),  // 2026-07-01
  };

  it("expands {name} token to original stem", () => {
    const { expandRename } = require("../src/move");
    expect(expandRename("{name}", ctx)).toBe("my report");
  });

  it("expands file date tokens from fileDate", () => {
    const { expandRename } = require("../src/move");
    expect(expandRename("{fileYYYY}-{fileMM}-{fileDD}", ctx)).toBe("2024-03-15");
  });

  it("expands move date tokens from moveDate", () => {
    const { expandRename } = require("../src/move");
    expect(expandRename("{YYYY}-{MM}-{DD}", ctx)).toBe("2026-07-01");
  });

  it("expands mixed pattern", () => {
    const { expandRename } = require("../src/move");
    expect(expandRename("{fileYYYY}-{fileMM} {name}", ctx)).toBe("2024-03 my report");
  });

  it("strips illegal path-separator chars", () => {
    const { expandRename } = require("../src/move");
    expect(expandRename("a/b\\c:d*e?f\"g<h>i|j", ctx)).toBe("abcdefghij");
  });

  it("strips leading dots", () => {
    const { expandRename } = require("../src/move");
    expect(expandRename("...hidden", ctx)).toBe("hidden");
  });

  it("trims surrounding whitespace", () => {
    const { expandRename } = require("../src/move");
    expect(expandRename("  hello  ", ctx)).toBe("hello");
  });

  it("falls back to original stem when sanitized result is empty", () => {
    const { expandRename } = require("../src/move");
    expect(expandRename("///", ctx)).toBe("my report");
  });

  it("falls back to stem when pattern is empty string", () => {
    const { expandRename } = require("../src/move");
    expect(expandRename("", ctx)).toBe("my report");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/engine test -- --reporter=verbose 2>&1 | grep -E "expandRename|FAIL|PASS" | head -20`
Expected: `expandRename` tests fail with "not a function" or similar.

- [ ] **Step 3: Implement expandRename in move.ts**

Add to `packages/engine/src/move.ts` (after the existing exports):
```typescript
export interface RenameContext {
  stem: string;
  fileDate: Date;
  moveDate: Date;
}

const ILLEGAL_CHARS = /[/\\:*?"<>|]/g;
const LEADING_DOTS = /^\.+/;

export function expandRename(pattern: string, ctx: RenameContext): string {
  const fileYYYY = String(ctx.fileDate.getFullYear());
  const fileMM = String(ctx.fileDate.getMonth() + 1).padStart(2, "0");
  const fileDD = String(ctx.fileDate.getDate()).padStart(2, "0");
  const yyyy = String(ctx.moveDate.getFullYear());
  const mm = String(ctx.moveDate.getMonth() + 1).padStart(2, "0");
  const dd = String(ctx.moveDate.getDate()).padStart(2, "0");

  let result = pattern
    .replaceAll("{name}", ctx.stem)
    .replaceAll("{fileYYYY}", fileYYYY)
    .replaceAll("{fileMM}", fileMM)
    .replaceAll("{fileDD}", fileDD)
    .replaceAll("{YYYY}", yyyy)
    .replaceAll("{MM}", mm)
    .replaceAll("{DD}", dd);

  // Sanitize: strip illegal chars, leading dots, trim
  result = result.replace(ILLEGAL_CHARS, "").replace(LEADING_DOTS, "").trim();

  return result.length > 0 ? result : ctx.stem;
}
```

- [ ] **Step 4: Update the import in move.test.ts to use named imports instead of require**

Change the test to use proper ESM imports. Update the added describe block in `packages/engine/tests/move.test.ts` to import at the top of the file with the others:

Update the first import line to also include `expandRename`:
```typescript
import { expandDestination, expandRename, uniqueDestination } from "../src/move";
```

And rewrite the test bodies to use the imported function directly (no `require`):
```typescript
describe("expandRename", () => {
  const ctx = {
    stem: "my report",
    fileDate: new Date(2024, 2, 15), // 2024-03-15
    moveDate: new Date(2026, 6, 1),  // 2026-07-01
  };

  it("expands {name} token to original stem", () => {
    expect(expandRename("{name}", ctx)).toBe("my report");
  });

  it("expands file date tokens from fileDate", () => {
    expect(expandRename("{fileYYYY}-{fileMM}-{fileDD}", ctx)).toBe("2024-03-15");
  });

  it("expands move date tokens from moveDate", () => {
    expect(expandRename("{YYYY}-{MM}-{DD}", ctx)).toBe("2026-07-01");
  });

  it("expands mixed pattern", () => {
    expect(expandRename("{fileYYYY}-{fileMM} {name}", ctx)).toBe("2024-03 my report");
  });

  it("strips illegal path-separator chars", () => {
    expect(expandRename('a/b\\c:d*e?f"g<h>i|j', ctx)).toBe("abcdefghij");
  });

  it("strips leading dots", () => {
    expect(expandRename("...hidden", ctx)).toBe("hidden");
  });

  it("trims surrounding whitespace", () => {
    expect(expandRename("  hello  ", ctx)).toBe("hello");
  });

  it("falls back to original stem when sanitized result is empty", () => {
    expect(expandRename("///", ctx)).toBe("my report");
  });

  it("falls back to stem when pattern is empty string", () => {
    expect(expandRename("", ctx)).toBe("my report");
  });
});
```

- [ ] **Step 5: Run tests to confirm expandRename passes**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/engine test -- --reporter=verbose 2>&1 | grep -E "expandRename|✓|✗|FAIL|PASS"`
Expected: all `expandRename` tests pass.

---

### Task 3: executor.ts — add targetName to MoveRequest

**Files:**
- Modify: `packages/engine/src/executor.ts`
- Test: `packages/engine/tests/executor.test.ts`

**Interfaces:**
- Consumes: `uniqueDestination(dir, name)` from move.ts (already imported).
- Produces: `MoveRequest.targetName?: string` — when present, use as the filename instead of `basename(req.from)`.

- [ ] **Step 1: Write failing test for targetName**

Append to `packages/engine/tests/executor.test.ts`:
```typescript
it("targetName overrides the source basename for the destination", async () => {
  const { dst, journal, from } = await setup();
  const done = await executeMove(
    { id: "j1", from, toDir: dst, moveNodeId: "m1", targetName: "renamed.txt" },
    journal,
  );
  expect(done.status).toBe("done");
  expect(done.to).toBe(join(dst, "renamed.txt"));
  expect(existsSync(from)).toBe(false);
});

it("targetName collision gets suffixed", async () => {
  const { dst, journal, from } = await setup();
  await mkdir(dst, { recursive: true });
  await writeFile(join(dst, "renamed.txt"), "existing");
  const done = await executeMove(
    { id: "j1", from, toDir: dst, moveNodeId: "m1", targetName: "renamed.txt" },
    journal,
  );
  expect(done.to).toBe(join(dst, "renamed (1).txt"));
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/engine test -- --reporter=verbose --testPathPattern=executor 2>&1 | tail -20`
Expected: two new tests fail (targetName not in MoveRequest).

- [ ] **Step 3: Add targetName to MoveRequest and use it in executeMove**

In `packages/engine/src/executor.ts`, update `MoveRequest`:
```typescript
export interface MoveRequest {
  id: string;
  from: string;
  toDir: string;
  moveNodeId: string;
  targetName?: string; // when set, use as destination filename instead of basename(from)
}
```

Update the `executeMove` function body — change the `to` line from:
```typescript
const to = await uniqueDestination(req.toDir, basename(req.from));
```
to:
```typescript
const to = await uniqueDestination(req.toDir, req.targetName ?? basename(req.from));
```

- [ ] **Step 4: Run executor tests to confirm all pass**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/engine test -- --reporter=verbose --testPathPattern=executor 2>&1 | tail -20`
Expected: all executor tests pass.

---

### Task 4: proposals.ts — add update method

**Files:**
- Modify: `packages/engine/src/proposals.ts`
- Test: `packages/engine/tests/proposals.test.ts`

**Interfaces:**
- Produces: `ProposalStore.update(id: string, patch: Partial<Proposal>): Promise<void>` — merges patch into the proposal and persists.

- [ ] **Step 1: Write failing test for update**

Append to `packages/engine/tests/proposals.test.ts`:
```typescript
it("update patches the proposal and persists across reload", async () => {
  const { s, file } = await store();
  const p = await s.add(draft(), 100);
  await s.update(p.id, { targetName: "renamed.txt" });
  expect(s.get(p.id)?.targetName).toBe("renamed.txt");

  // persists
  const s2 = new ProposalStore(file);
  await s2.load();
  expect(s2.get(p.id)?.targetName).toBe("renamed.txt");
});

it("update on unknown id throws", async () => {
  const { s } = await store();
  await expect(s.update("ghost", { targetName: "x.txt" })).rejects.toThrow(
    /unknown proposal/,
  );
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/engine test -- --reporter=verbose --testPathPattern=proposals 2>&1 | tail -20`
Expected: two new tests fail ("update is not a function").

- [ ] **Step 3: Add update method to ProposalStore**

In `packages/engine/src/proposals.ts`, add after `setStatus`:
```typescript
async update(id: string, patch: Partial<Proposal>): Promise<void> {
  const p = this.get(id);
  if (!p) throw new Error(`unknown proposal ${id}`);
  Object.assign(p, patch);
  await this.save();
}
```

- [ ] **Step 4: Run proposals tests to confirm all pass**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/engine test -- --reporter=verbose --testPathPattern=proposals 2>&1 | tail -20`
Expected: all proposals tests pass.

---

### Task 5: engine.ts — wire renamePattern and add renameProposal

**Files:**
- Modify: `packages/engine/src/engine.ts`
- Test: `packages/engine/tests/engine.test.ts`

**Interfaces:**
- Consumes: `expandRename` from `./move`; `MoveRequest.targetName` from `./executor`; `ProposalStore.update` from `./proposals`.
- Produces: `Engine.renameProposal(proposalId: string, name: string): Promise<void>`.

Sanitize helper for `renameProposal`: strip illegal chars, strip leading dots, trim. If caller passes a name with extension, REPLACE it with the original. If result is empty, keep original stem. Algorithm:
1. Parse the incoming `name` with `parse(name)` — get `.name` (stem) and `.ext` (ext).
2. Sanitize the stem: strip `/ \\ : * ? " < > |`, strip leading dots, trim.
3. If sanitized stem is empty, use original stem (from `parse(p.fileName).name`).
4. Final name = `sanitizedStem + originalExt` (from `parse(p.fileName).ext`).
5. Update via `proposalStore.update(id, { targetName: finalName })`.

- [ ] **Step 1: Write failing engine tests for rename pattern flow**

Append to `packages/engine/tests/engine.test.ts`:
```typescript
describe("Engine: renamePattern", () => {
  it("proposal.targetName contains expanded pattern + original extension", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-pattern-"));
    const inbox = join(root, "inbox");
    const dest = join(root, "sorted");
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
          config: { destination: dest, auto: false, renamePattern: "{fileYYYY}-{fileMM} {name}" },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { id: "e1", source: "w1", sourceHandle: "out", target: "f1" },
        { id: "e2", source: "f1", sourceHandle: "match", target: "m1" },
      ],
    };

    const neverClassify: Classifier = {
      classify: async () => { throw new Error("no classify"); },
    };
    engine = new Engine({
      dataDir: join(root, "data"),
      classifier: neverClassify,
      watcherOptions: FAST,
      now: () => new Date(2026, 6, 1).getTime(),
    });
    await engine.start(pipeline);
    await sleep(300);

    const proposalP = nextProposal(engine);
    await writeFile(join(inbox, "report.txt"), "hi");
    const proposal = await proposalP;

    // targetName should be "YYYY-MM report.txt" — exact year/month depends on file date
    expect(proposal.targetName).toMatch(/^\d{4}-\d{2} report\.txt$/);
  }, 15_000);

  it("after approve, file exists at dest under the targetName", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-approve-"));
    const inbox = join(root, "inbox");
    const dest = join(root, "sorted");
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
          config: { destination: dest, auto: false, renamePattern: "archived-{name}" },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { id: "e1", source: "w1", sourceHandle: "out", target: "f1" },
        { id: "e2", source: "f1", sourceHandle: "match", target: "m1" },
      ],
    };

    const neverClassify: Classifier = {
      classify: async () => { throw new Error("no classify"); },
    };
    engine = new Engine({
      dataDir: join(root, "data"),
      classifier: neverClassify,
      watcherOptions: FAST,
    });
    await engine.start(pipeline);
    await sleep(300);

    const proposalP = nextProposal(engine);
    await writeFile(join(inbox, "note.txt"), "hello");
    const proposal = await proposalP;

    expect(proposal.targetName).toBe("archived-note.txt");
    await engine.approve(proposal.id);
    expect(existsSync(join(dest, "archived-note.txt"))).toBe(true);
    expect(existsSync(join(inbox, "note.txt"))).toBe(false);
  }, 15_000);
});

describe("Engine: renameProposal", () => {
  it("renames a pending proposal and persists across store reload", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-proposal-"));
    const inbox = join(root, "inbox");
    const dest = join(root, "sorted");
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
          config: { destination: dest, auto: false },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { id: "e1", source: "w1", sourceHandle: "out", target: "f1" },
        { id: "e2", source: "f1", sourceHandle: "match", target: "m1" },
      ],
    };
    const neverClassify: Classifier = {
      classify: async () => { throw new Error("no classify"); },
    };
    engine = new Engine({
      dataDir: join(root, "data"),
      classifier: neverClassify,
      watcherOptions: FAST,
    });
    await engine.start(pipeline);
    await sleep(300);

    const proposalP = nextProposal(engine);
    await writeFile(join(inbox, "note.txt"), "content");
    const proposal = await proposalP;

    await engine.renameProposal(proposal.id, "new-name.txt");
    expect(engine.listProposals().find(p => p.id === proposal.id)?.targetName).toBe("new-name.txt");

    // persists: reload the store
    const store2 = new (engine.proposalStore.constructor as typeof import("../src/proposals").ProposalStore)(
      join(root, "data", "proposals.json"),
    );
    await store2.load();
    expect(store2.get(proposal.id)?.targetName).toBe("new-name.txt");
  }, 15_000);

  it("renameProposal strips illegal chars and preserves original extension", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-sanitize-"));
    engine = new Engine({ dataDir: join(root, "data") });
    const p = await engine.proposalStore.add({
      filePath: "/in/report.pdf",
      fileName: "report.pdf",
      destDir: "/out",
      moveNodeId: "m1",
      routeNodeIds: [],
    }, 1);
    // try to use illegal chars; extension should be forced back to .pdf
    await engine.renameProposal(p.id, "my/file.docx");
    expect(engine.listProposals().find(x => x.id === p.id)?.targetName).toBe("myfile.pdf");
  }, 15_000);

  it("renameProposal no-ops on non-pending proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-noop-"));
    engine = new Engine({ dataDir: join(root, "data") });
    const p = await engine.proposalStore.add({
      filePath: "/in/note.txt",
      fileName: "note.txt",
      destDir: "/out",
      moveNodeId: "m1",
      routeNodeIds: [],
    }, 1);
    await engine.proposalStore.setStatus(p.id, "executed");
    await engine.renameProposal(p.id, "changed.txt"); // should be silently ignored
    expect(engine.listProposals().find(x => x.id === p.id)?.targetName).toBeUndefined();
  }, 15_000);

  it("after renameProposal then approve, file moves under new name", async () => {
    const root = await mkdtemp(join(tmpdir(), "sortflow-rename-approve-manual-"));
    const src = join(root, "in");
    const dest = join(root, "out");
    await mkdir(src, { recursive: true });
    await writeFile(join(src, "note.txt"), "hello");

    engine = new Engine({ dataDir: join(root, "data") });
    const p = await engine.proposalStore.add({
      filePath: join(src, "note.txt"),
      fileName: "note.txt",
      destDir: dest,
      moveNodeId: "m1",
      routeNodeIds: [],
    }, 1);
    await engine.renameProposal(p.id, "renamed.txt");
    await engine.approve(p.id);
    expect(existsSync(join(dest, "renamed.txt"))).toBe(true);
    expect(existsSync(join(src, "note.txt"))).toBe(false);
  }, 15_000);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/engine test -- --reporter=verbose 2>&1 | grep -E "renameProposal|renamePattern|✗|FAIL" | head -30`
Expected: new tests fail ("renameProposal is not a function" etc.).

- [ ] **Step 3: Implement engine.ts changes**

In `packages/engine/src/engine.ts`:

**3a. Add import for `expandRename` and `parse`:**
Add `parse` to the existing `path` import: change `import { join } from "node:path";` to `import { join, parse } from "node:path";`
Add `expandRename` to the move import: change `import { expandDestination } from "./move";` to `import { expandDestination, expandRename } from "./move";`

**3b. Add sanitize helper (just before the class):**
```typescript
const ILLEGAL_CHARS = /[/\\:*?"<>|]/g;
const LEADING_DOTS = /^\.+/;

function sanitizeStem(raw: string): string {
  return raw.replace(ILLEGAL_CHARS, "").replace(LEADING_DOTS, "").trim();
}
```

**3c. In `handleFile`, after computing `destDir`, add `targetName` logic:**

After `const destDir = expandDestination(...)`, before the duplicate-proposal guard, add:
```typescript
let targetName: string | undefined;
if (cfg.renamePattern) {
  const { name: stem, ext: originalExt } = parse(file.name);
  const newStem = expandRename(cfg.renamePattern, {
    stem,
    fileDate: new Date(file.birthtimeMs ?? file.mtimeMs),
    moveDate: new Date(this.now()),
  });
  targetName = newStem + originalExt;
}
```

In `proposalStore.add(...)` call, spread `targetName` into the object:
```typescript
const proposal = await this.proposalStore.add(
  {
    filePath: file.path,
    fileName: file.name,
    destDir,
    targetName,
    moveNodeId: route.moveNodeId,
    routeNodeIds: route.nodePath,
  },
  this.now(),
);
```

**3d. In `approve`, pass `p.targetName` to `executeMove`:**
```typescript
const entry = await this.runExclusive(() =>
  executeMove(
    {
      id: proposalId,
      from: p.filePath,
      toDir: p.destDir,
      targetName: p.targetName,
      moveNodeId: p.moveNodeId,
    },
    this.journal,
    { now: this.now },
  ),
);
```

**3e. Add `renameProposal` method after `reject`:**
```typescript
async renameProposal(proposalId: string, name: string): Promise<void> {
  const p = this.proposalStore.get(proposalId);
  if (!p || p.status !== "pending") return;
  const { name: callerStem, ext: callerExt } = parse(name);
  const { name: originalStem, ext: originalExt } = parse(p.fileName);
  // Sanitize stem; extension is always from original file
  const sanitized = sanitizeStem(callerStem);
  const finalStem = sanitized.length > 0 ? sanitized : originalStem;
  await this.proposalStore.update(proposalId, { targetName: finalStem + originalExt });
}
```

Note: the `callerExt` variable is computed by `parse` but we intentionally ignore it to always use `originalExt` — Biome will flag unused variables. Use `_callerExt` or destructure only what's needed:
```typescript
const { name: callerStem } = parse(name);
```

- [ ] **Step 4: Fix ProposalStore.add to accept targetName**

The `add` method signature is `Omit<Proposal, "id" | "createdAt" | "status">` — since `targetName` is now optional on `Proposal`, it is already included in the spread type. No change needed; verify it compiles.

- [ ] **Step 5: Run all engine tests**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/engine test 2>&1 | tail -20`
Expected: all tests pass (98 existing + new ones).

---

### Task 6: IPC + Bridge + Preload — add renameProposal contract

**Files:**
- Modify: `packages/app/src/ipc.ts`
- Modify: `packages/app/src/preload.ts`
- Modify: `packages/ui/src/bridge.ts`

These three must change together: the bridge type defines the contract; preload exposes it to the renderer; ipc handles it in main.

**Interfaces:**
- Consumes: `Engine.renameProposal(id, name)` from Task 5.
- Produces: IPC channel `proposals:rename`; `SortflowApi.renameProposal(id, name)`.

- [ ] **Step 1: Add to ipc.ts**

In `packages/app/src/ipc.ts`, after `ipcMain.handle("proposals:reject", ...)`, add:
```typescript
ipcMain.handle(
  "proposals:rename",
  async (_evt, id: string, name: string) => {
    await current.renameProposal(id, name);
  },
);
```

- [ ] **Step 2: Add to preload.ts**

In `packages/app/src/preload.ts`, add to the `contextBridge.exposeInMainWorld("sortflow", { ... })` object, after the `reject` line:
```typescript
renameProposal: (id: string, name: string) =>
  ipcRenderer.invoke("proposals:rename", id, name),
```

- [ ] **Step 3: Add to bridge.ts SortflowApi interface and mock**

In `packages/ui/src/bridge.ts`, add to `SortflowApi`:
```typescript
renameProposal(id: string, name: string): Promise<void>;
```

Add to `createMockApi()` return object (after `reject`):
```typescript
async renameProposal(id, name) {
  proposals = proposals.map((p) => {
    if (p.id !== id || p.status !== "pending") return p;
    // Extract the stem from `name`, force original extension
    const { parse } = { parse: (n: string) => {
      const dot = n.lastIndexOf(".");
      return dot > 0
        ? { name: n.slice(0, dot), ext: n.slice(dot) }
        : { name: n, ext: "" };
    }};
    const { ext: origExt } = parse(p.fileName);
    const { name: stem } = parse(name);
    return { ...p, targetName: stem + origExt };
  });
},
```

Note: since this is in a browser context, `node:path` is unavailable. Use the inline parser shown, or a simpler approach:
```typescript
async renameProposal(id: string, name: string) {
  proposals = proposals.map((p) => {
    if (p.id !== id || p.status !== "pending") return p;
    const origDot = p.fileName.lastIndexOf(".");
    const origExt = origDot > 0 ? p.fileName.slice(origDot) : "";
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    return { ...p, targetName: stem + origExt };
  });
},
```

- [ ] **Step 4: Run pnpm check**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm check 2>&1 | tail -20`
Expected: no type errors.

---

### Task 7: UI — ReviewTray inline rename

**Files:**
- Modify: `packages/ui/src/panels/ReviewTray.tsx`
- Test: `packages/ui/tests/review-tray.test.tsx`

**Interfaces:**
- Consumes: `api.renameProposal(id, name)` from bridge; `p.targetName` on `Proposal`; `Pencil` from `lucide-react`.
- Each pending row: show effective filename (`p.targetName ?? p.fileName`). Pencil button swaps text for inline input. Enter/blur commits via `api.renameProposal(p.id, value).then(refresh)`. Escape cancels.

- [ ] **Step 1: Write failing UI test for rename**

Append to `packages/ui/tests/review-tray.test.tsx`:
```typescript
it("pencil button opens input; Enter commits via api.renameProposal", async () => {
  render(<ReviewTray />);
  await waitFor(() =>
    expect(screen.getByText(/Screenshot 2026-06-30\.png/)).toBeTruthy(),
  );

  const renameSpy = vi.spyOn(api, "renameProposal").mockResolvedValue(undefined);
  const pencilBtn = screen.getByRole("button", { name: /rename file/i });
  fireEvent.click(pencilBtn);

  const input = screen.getByRole("textbox", { name: /rename file/i });
  fireEvent.change(input, { target: { value: "My Screenshot.png" } });
  fireEvent.keyDown(input, { key: "Enter" });

  await waitFor(() =>
    expect(renameSpy).toHaveBeenCalledWith("demo-1", "My Screenshot.png"),
  );
});

it("Escape in rename input cancels without calling api.renameProposal", async () => {
  render(<ReviewTray />);
  await waitFor(() =>
    expect(screen.getByText(/Screenshot 2026-06-30\.png/)).toBeTruthy(),
  );

  const renameSpy = vi.spyOn(api, "renameProposal").mockResolvedValue(undefined);
  const pencilBtn = screen.getByRole("button", { name: /rename file/i });
  fireEvent.click(pencilBtn);

  const input = screen.getByRole("textbox", { name: /rename file/i });
  fireEvent.keyDown(input, { key: "Escape" });

  expect(renameSpy).not.toHaveBeenCalled();
  // Input should be gone; text should be back
  expect(screen.queryByRole("textbox", { name: /rename file/i })).toBeNull();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- --reporter=verbose --testPathPattern=review-tray 2>&1 | tail -20`
Expected: two new tests fail (no pencil button found).

- [ ] **Step 3: Implement inline rename in ReviewTray.tsx**

Replace `packages/ui/src/panels/ReviewTray.tsx` with the full updated file:
```tsx
import type { Proposal } from "@sortflow/engine";
import { ListChecks, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../bridge";
import { useFlowStore } from "../store";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function RenameInput({
  proposal,
  onDone,
}: {
  proposal: Proposal;
  onDone: () => void;
}) {
  const effectiveName = proposal.targetName ?? proposal.fileName;
  const [value, setValue] = useState(effectiveName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = useCallback(() => {
    api
      .renameProposal(proposal.id, value)
      .then(onDone)
      .catch(() => onDone());
  }, [proposal.id, value, onDone]);

  return (
    <input
      ref={inputRef}
      aria-label="Rename file"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onDone();
      }}
      onBlur={commit}
      style={{ fontSize: "inherit", padding: "0 2px", minWidth: 0, flex: 1 }}
    />
  );
}

export function ReviewTray() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setProposals(await api.listProposals());
  }, []);

  // Run an action, then refresh, surfacing any failure instead of swallowing it.
  const guard = useCallback(
    (action: Promise<void>) => {
      setError(null);
      action.then(() => refresh()).catch((e: unknown) => setError(message(e)));
    },
    [refresh],
  );

  useEffect(() => {
    refresh().catch((e: unknown) => setError(message(e)));
    const offProposal = api.onProposal(() => void refresh());
    const offExecuted = api.onExecuted((p) => {
      useFlowStore.getState().animatePath(p.routeNodeIds);
      void refresh();
    });
    const offStuck = api.onStuck(() => void refresh());
    return () => {
      offProposal();
      offExecuted();
      offStuck();
    };
  }, [refresh]);

  const pending = proposals.filter((p) => p.status === "pending");
  const failed = proposals.filter((p) => p.status === "failed");

  return (
    <div className="sf-tray">
      <h3>
        <ListChecks size={14} strokeWidth={2} aria-hidden="true" />
        Review{" "}
        {pending.length > 0 && (
          <span className="sf-count">{pending.length}</span>
        )}
      </h3>
      {error && <p className="sf-error">{error}</p>}
      {pending.length === 0 && failed.length === 0 && (
        <p className="sf-empty">Nothing waiting for review.</p>
      )}
      {pending.length > 1 && (
        <button
          type="button"
          className="sf-btn-approve-all"
          onClick={() => {
            setError(null);
            void (async () => {
              try {
                await Promise.all(pending.map((p) => api.approve(p.id)));
                await refresh();
              } catch (e) {
                setError(message(e));
              }
            })();
          }}
        >
          Approve all ({pending.length})
        </button>
      )}
      <ul>
        {pending.map((p) => (
          <li key={p.id}>
            {editingId === p.id ? (
              <RenameInput
                proposal={p}
                onDone={() => {
                  setEditingId(null);
                  void refresh();
                }}
              />
            ) : (
              <span className="sf-proposal">
                {p.targetName ?? p.fileName} → {p.destDir}
              </span>
            )}
            <button
              type="button"
              className="sf-btn-neutral"
              aria-label="Rename file"
              onClick={() => setEditingId(p.id)}
              title="Rename"
            >
              <Pencil size={12} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sf-btn-approve"
              onClick={() => guard(api.approve(p.id))}
            >
              Approve
            </button>
            <button
              type="button"
              className="sf-btn-neutral"
              onClick={() => guard(api.reject(p.id))}
            >
              Reject
            </button>
          </li>
        ))}
        {failed.map((p) => (
          <li key={p.id} className="sf-failed">
            <span className="sf-status sf-status-failed">failed</span>
            <span className="sf-proposal">
              {p.fileName} → {p.destDir}
            </span>
            {p.error && <span className="sf-error">{p.error}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run review-tray tests**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- --reporter=verbose --testPathPattern=review-tray 2>&1 | tail -20`
Expected: all review-tray tests pass.

---

### Task 8: UI — ConfigPanel rename pattern field + MoveNode display

**Files:**
- Modify: `packages/ui/src/panels/ConfigPanel.tsx`
- Modify: `packages/ui/src/nodes/MoveNode.tsx`
- Test: `packages/ui/tests/config-panel.test.tsx`

**Interfaces:**
- Consumes: `MoveConfig.renamePattern?: string`.
- ConfigPanel Move section gets a `TextField` for `renamePattern` and a helper hint below it.
- MoveNode shows a second muted body line `renames: <pattern>` when `renamePattern` is set.

- [ ] **Step 1: Write failing ConfigPanel tests for renamePattern**

Append to `packages/ui/tests/config-panel.test.tsx`:
```typescript
describe("ConfigPanel: rename pattern", () => {
  it("setting renamePattern lands in toPipeline() MoveConfig", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    const input = screen.getByLabelText(/rename pattern/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "{fileYYYY}-{fileMM} {name}" } });
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.renamePattern).toBe("{fileYYYY}-{fileMM} {name}");
  });

  it("clearing renamePattern removes it from MoveConfig", () => {
    useFlowStore.getState().loadPipeline({
      nodes: [
        {
          id: "m1",
          kind: "move",
          config: { destination: "~/Docs", auto: false, renamePattern: "{name}-archived" },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    const input = screen.getByLabelText(/rename pattern/i) as HTMLInputElement;
    expect(input.value).toBe("{name}-archived");
    fireEvent.change(input, { target: { value: "" } });
    const cfg = useFlowStore.getState().toPipeline().nodes[0]
      .config as MoveConfig;
    expect(cfg.renamePattern).toBeUndefined();
  });

  it("shows the token helper line", () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected("m1");
    render(<ConfigPanel />);
    expect(screen.getByText(/extension is kept automatically/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test -- --reporter=verbose --testPathPattern=config-panel 2>&1 | tail -20`
Expected: new tests fail (no rename pattern field found).

- [ ] **Step 3: Add rename pattern field to ConfigPanel.tsx Move section**

In `packages/ui/src/panels/ConfigPanel.tsx`, find the Move section (the `node?.data.kind === "move"` block). After the `CheckField` for "Automatic (skip review)" and before the streak section, add:

```tsx
<TextField
  label="Rename pattern (optional)"
  value={c.renamePattern ?? ""}
  onChange={(v) =>
    set({ ...c, renamePattern: v || undefined })
  }
/>
<p
  className="sf-hint-muted"
  style={{ fontSize: 12, color: "var(--sf-text-muted)" }}
>
  {
    "Tokens: {name} {fileYYYY} {fileMM} {fileDD} {YYYY} {MM} {DD} — extension is kept automatically"
  }
</p>
```

Place it between the `CheckField label="Automatic (skip review)"` block and the streak section.

- [ ] **Step 4: Update MoveNode.tsx to show renamePattern**

Replace `packages/ui/src/nodes/MoveNode.tsx`:
```tsx
import type { MoveConfig } from "@sortflow/engine";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { FolderOutput } from "lucide-react";
import type { FlowNode } from "../store";

export function MoveNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as MoveConfig;
  return (
    <div className="sf-node sf-node-move">
      <Handle type="target" position={Position.Left} />
      <div className="sf-node-title">
        <div className="sf-node-icon" aria-hidden="true">
          <FolderOutput size={16} strokeWidth={2} />
        </div>
        Move {cfg.auto ? <span className="sf-badge">auto</span> : null}
      </div>
      <div className="sf-node-body">{cfg.destination}</div>
      {cfg.renamePattern && (
        <div
          className="sf-node-body"
          style={{ color: "var(--sf-text-muted)", fontSize: 11 }}
        >
          renames: {cfg.renamePattern}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run all UI tests**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui test 2>&1 | tail -20`
Expected: all UI tests pass.

---

### Task 9: Gate + Biome + Commit

**Files:** no new files — just run the full gate.

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm test 2>&1 | tail -30`
Expected: all tests pass.

- [ ] **Step 2: Run pnpm check**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm check 2>&1 | tail -20`
Expected: no type errors.

- [ ] **Step 3: Run UI build**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm --filter @sortflow/ui build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 4: Run Biome**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm biome check --write . 2>&1 | tail -20`
Expected: "Checked N file(s) - No fixes needed" or applies and exits 0.

- [ ] **Step 5: Re-run tests after Biome to catch any reformatting issues**

Run: `cd /Users/datnguyen/Desktop/PROJECTS/sortflow && pnpm test 2>&1 | tail -20`
Expected: all green.

- [ ] **Step 6: Write report**

Create `/Users/datnguyen/Desktop/PROJECTS/sortflow/.superpowers/sdd/rename-report.md` with the required concise report.

- [ ] **Step 7: Commit**

```bash
cd /Users/datnguyen/Desktop/PROJECTS/sortflow
git add \
  packages/engine/src/types.ts \
  packages/engine/src/move.ts \
  packages/engine/src/executor.ts \
  packages/engine/src/proposals.ts \
  packages/engine/src/engine.ts \
  packages/engine/tests/move.test.ts \
  packages/engine/tests/executor.test.ts \
  packages/engine/tests/proposals.test.ts \
  packages/engine/tests/engine.test.ts \
  packages/app/src/ipc.ts \
  packages/app/src/preload.ts \
  packages/ui/src/bridge.ts \
  packages/ui/src/panels/ReviewTray.tsx \
  packages/ui/src/panels/ConfigPanel.tsx \
  packages/ui/src/nodes/MoveNode.tsx \
  packages/ui/tests/review-tray.test.tsx \
  packages/ui/tests/config-panel.test.tsx \
  .superpowers/sdd/rename-report.md
git commit -m "feat: rename at review time and rename patterns on move nodes"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `MoveConfig.renamePattern?: string` | Task 1 |
| `Proposal.targetName?: string` | Task 1 |
| `expandRename` function + tokens | Task 2 |
| Sanitize: strip illegal chars, leading dots, trim, empty → fallback | Task 2 |
| `MoveRequest.targetName` + `executeMove` uses it | Task 3 |
| collision suffix applies to FINAL name | Task 3 (uniqueDestination call unchanged) |
| `ProposalStore.update` | Task 4 |
| `handleFile` computes targetName from renamePattern | Task 5 |
| `approve` passes `p.targetName` to MoveRequest | Task 5 |
| `engine.renameProposal` — only pending, sanitize, extension preserved, persist | Task 5 |
| `ipc.ts` `proposals:rename` channel | Task 6 |
| `preload.ts` `renameProposal` | Task 6 |
| `bridge.ts` `SortflowApi.renameProposal` + mock | Task 6 |
| ReviewTray pencil icon → inline input → Enter/blur commits, Escape cancels | Task 7 |
| ReviewTray shows `p.targetName ?? p.fileName` | Task 7 |
| ConfigPanel Move section rename pattern field + helper hint | Task 8 |
| MoveNode shows `renames: <pattern>` when set | Task 8 |
| Engine tests: pattern flow, renameProposal | Task 5 |
| UI tests: ReviewTray rename, ConfigPanel pattern | Tasks 7–8 |
| Executor tests: targetName respected, collision | Task 3 |
| move.ts tests: expandRename tokens, sanitize | Task 2 |
| Gate: pnpm test + pnpm check + ui build + Biome | Task 9 |
| Commit message + no push + no trailers | Task 9 |

**Placeholder scan:** No TBDs, no "implement later", code is complete in every step.

**Type consistency:**
- `expandRename` defined in Task 2, imported in Task 5 — consistent.
- `MoveRequest.targetName` defined in Task 3, used in Task 5's `approve` — consistent.
- `ProposalStore.update` defined in Task 4, used in Task 5's `renameProposal` — consistent.
- `SortflowApi.renameProposal` defined in Task 6, called in Task 7 ReviewTray — consistent.
- `MoveConfig.renamePattern` defined in Task 1, consumed in Tasks 5 and 8 — consistent.
- `Proposal.targetName` defined in Task 1, set in Tasks 4–5, read in Task 7 ReviewTray — consistent.
