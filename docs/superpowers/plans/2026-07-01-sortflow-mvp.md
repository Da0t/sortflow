# Sortflow MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Sortflow v1 MVP — an Electron desktop app where a React Flow node pipeline (Watch → Filter → AI Classify → Move) sorts incoming files through a review tray with journal-backed undo.

**Architecture:** pnpm monorepo with three packages. `@sortflow/engine` is pure TypeScript (no Electron imports): watching, routing, classification queue, journal-first move execution. `@sortflow/ui` is a Vite + React + React Flow editor that talks to a `SortflowApi` bridge (mock in browser, real over IPC). `@sortflow/app` is the Electron main process: tray, persistence, typed IPC connecting engine to UI.

**Tech Stack:** TypeScript 5 (strict), pnpm workspaces, vitest, chokidar 4, Ollama HTTP API (no SDK), Electron, tsup (main/preload bundling), Vite, React 19, @xyflow/react 12, zustand 5, Biome, electron-builder, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-01-sortflow-design.md` — read it before starting.

## Global Constraints

Every task's requirements implicitly include these (copied from the spec):

- **Never destructive:** the engine only ever moves files — no deletes, no overwrites. Name collisions get a ` (1)` suffix.
- **Journal-first:** append `intent` before touching a file, `done` after; undo must always work; startup reconciles dangling intents.
- **Thermals:** event-driven only (no polling, no disk scanning); Ollama jobs run strictly one at a time with a cooldown (default 2000ms); idle CPU ~0%.
- **Ollama optional:** if Ollama is missing/down, classification returns `unsure` and the app keeps working — never crash on its absence.
- **Commits:** authored solely by the repo owner's git identity (Dat Nguyen). NO `Co-Authored-By` or any AI-attribution trailers, ever. Use the exact `git commit` commands given in each task.
- TypeScript `strict: true` everywhere; ESM (`"type": "module"`).
- TDD: write the failing test first for all engine logic.
- MIT licensed; repo must stay publishable at every commit.

## File Structure

```
sortflow/
├── package.json                  # workspace root: scripts test/check/dev
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── .gitignore
├── LICENSE                       # MIT
├── README.md
├── .github/workflows/ci.yml      # lint + test (Task 18)
├── .github/workflows/release.yml # dmg on tag (Task 18)
├── docs/superpowers/...          # spec + this plan
└── packages/
    ├── engine/                   # pure TS, zero Electron imports
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── src/
    │   │   ├── index.ts          # public exports
    │   │   ├── types.ts          # Pipeline/Proposal/Journal types (Task 2)
    │   │   ├── graph.ts          # validatePipeline, edgeFrom, nodeById (Task 2)
    │   │   ├── filter.ts         # matchesFilter, globToRegExp (Task 3)
    │   │   ├── move.ts           # expandDestination, uniqueDestination (Task 4)
    │   │   ├── journal.ts        # Journal JSONL append/reconcile (Task 5)
    │   │   ├── executor.ts       # executeMove, undoMove (Task 6)
    │   │   ├── classify.ts       # Classifier, OllamaClassifier (Task 7)
    │   │   ├── queue.ts          # ClassifyQueue throttle (Task 8)
    │   │   ├── route.ts          # routeFile graph walk (Task 9)
    │   │   ├── proposals.ts      # ProposalStore + approvalStreak (Task 10)
    │   │   ├── watcher.ts        # FolderWatcher (chokidar) (Task 11)
    │   │   └── engine.ts         # Engine orchestrator (Task 12)
    │   └── tests/                # one test file per src module
    ├── ui/                       # Vite + React + React Flow
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vite.config.ts
    │   ├── vitest.config.ts
    │   ├── index.html
    │   └── src/
    │       ├── main.tsx
    │       ├── App.tsx           # canvas + panels layout (Task 13)
    │       ├── bridge.ts         # SortflowApi + browser mock (Task 13)
    │       ├── store.ts          # zustand: flow state + pipeline sync (Task 13)
    │       ├── nodes/            # WatchNode/FilterNode/ClassifyNode/MoveNode (Task 13)
    │       ├── panels/Palette.tsx        (Task 13)
    │       ├── panels/ConfigPanel.tsx    (Task 14)
    │       ├── panels/ReviewTray.tsx     (Task 15)
    │       ├── panels/HistoryPanel.tsx   (Task 15)
    │       └── test/setup.ts     # jsdom mocks
    └── app/                      # Electron main + preload
        ├── package.json
        ├── tsconfig.json
        ├── electron-builder.yml  # (Task 18)
        └── src/
            ├── main.ts           # window, engine boot, persistence (Task 16)
            ├── ipc.ts            # typed ipcMain handlers (Task 16)
            ├── preload.ts        # contextBridge → SortflowApi (Task 16)
            └── tray.ts           # menu-bar tray + login item (Task 18)
```

Natural checkpoint: after Task 12 the engine is complete and fully tested; after Task 15 the UI works standalone in a browser; after Task 16 the real app runs end-to-end.

---

### Task 1: Monorepo scaffold + engine package skeleton

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.gitignore`, `LICENSE`, `README.md`
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/vitest.config.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/tests/index.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: workspace layout above; `@sortflow/engine` package whose `main`/`types` point at `./src/index.ts` (no build step — consumers bundle TS source); root scripts `pnpm test`, `pnpm check`.

- [ ] **Step 1: Create workspace root files**

`package.json`:
```json
{
  "name": "sortflow",
  "private": true,
  "scripts": {
    "test": "pnpm -r test",
    "check": "biome check ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4"
  },
  "packageManager": "pnpm@10.4.0"
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  }
}
```

`biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "formatter": { "enabled": true, "indentStyle": "space" },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "files": { "ignore": ["dist", "release", "node_modules", "*.gen.ts"] }
}
```

`.gitignore`:
```
node_modules/
dist/
release/
.DS_Store
*.log
```

`LICENSE` — full MIT text with `Copyright (c) 2026 Dat Nguyen`:
```
MIT License

Copyright (c) 2026 Dat Nguyen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`README.md` (stub — Task 18 completes it):
```markdown
# Sortflow

Visual, node-based smart file organizer. Watch folders, wire up filters and a
local-AI classifier on a canvas, review proposed moves, undo anything.

Status: pre-release, under active development. See `docs/superpowers/specs/`.
```

- [ ] **Step 2: Create the engine package skeleton**

`packages/engine/package.json`:
```json
{
  "name": "@sortflow/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "chokidar": "^4.0.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.6.3",
    "vitest": "^3.2.0"
  }
}
```

`packages/engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "tests"]
}
```

`packages/engine/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node' },
});
```

`packages/engine/src/index.ts`:
```ts
export const VERSION = '0.1.0';
```

- [ ] **Step 3: Write the smoke test**

`packages/engine/tests/index.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index';

describe('engine package', () => {
  it('exports a version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
```

- [ ] **Step 4: Install and run**

Run: `cd ~/Desktop/PROJECTS/sortflow && pnpm install && pnpm test`
Expected: 1 test file, 1 passed.

Run: `pnpm check`
Expected: no errors (fix any formatting Biome reports with `pnpm biome check --write .`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo with engine package"
```

---

### Task 2: Engine types + pipeline validation

**Files:**
- Create: `packages/engine/src/types.ts`, `packages/engine/src/graph.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/tests/graph.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every type below (used by ALL later tasks — treat as canonical), plus `validatePipeline(p: Pipeline): string[]` ([] = valid), `edgeFrom(p, nodeId, handle): PipelineEdge | undefined`, `nodeById(p, id): PipelineNode | undefined`.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/graph.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { edgeFrom, nodeById, validatePipeline } from '../src/graph';
import type { Pipeline } from '../src/types';

const valid: Pipeline = {
  nodes: [
    { id: 'w1', kind: 'watch', config: { path: '/tmp/in', recursive: false }, position: { x: 0, y: 0 } },
    { id: 'f1', kind: 'filter', config: { extensions: ['.pdf'] }, position: { x: 200, y: 0 } },
    { id: 'c1', kind: 'classify', config: { categories: ['School', 'Receipts'], model: 'llama3.2:3b' }, position: { x: 200, y: 150 } },
    { id: 'm1', kind: 'move', config: { destination: '~/Docs/PDFs', auto: false }, position: { x: 400, y: 0 } },
    { id: 'm2', kind: 'move', config: { destination: '~/Docs/{category}', auto: false }, position: { x: 400, y: 150 } },
  ],
  edges: [
    { id: 'e1', source: 'w1', sourceHandle: 'out', target: 'f1' },
    { id: 'e2', source: 'f1', sourceHandle: 'match', target: 'm1' },
    { id: 'e3', source: 'f1', sourceHandle: 'else', target: 'c1' },
    { id: 'e4', source: 'c1', sourceHandle: 'School', target: 'm2' },
  ],
};

describe('validatePipeline', () => {
  it('accepts a valid pipeline', () => {
    expect(validatePipeline(valid)).toEqual([]);
  });

  it('rejects duplicate node ids', () => {
    const p: Pipeline = { ...valid, nodes: [...valid.nodes, valid.nodes[0]] };
    expect(validatePipeline(p).join()).toContain('duplicate node id: w1');
  });

  it('rejects edges to unknown nodes', () => {
    const p: Pipeline = { ...valid, edges: [{ id: 'x', source: 'w1', sourceHandle: 'out', target: 'ghost' }] };
    expect(validatePipeline(p).join()).toContain('unknown target ghost');
  });

  it('rejects a source handle the node does not have', () => {
    const p: Pipeline = { ...valid, edges: [{ id: 'x', source: 'f1', sourceHandle: 'banana', target: 'm1' }] };
    expect(validatePipeline(p).join()).toContain("no output 'banana'");
  });

  it('rejects classify handles outside categories + unsure', () => {
    const p: Pipeline = { ...valid, edges: [{ id: 'x', source: 'c1', sourceHandle: 'Taxes', target: 'm2' }] };
    expect(validatePipeline(p).join()).toContain("no output 'Taxes'");
  });

  it('allows the implicit unsure handle on classify', () => {
    const p: Pipeline = { ...valid, edges: [...valid.edges, { id: 'x', source: 'c1', sourceHandle: 'unsure', target: 'm1' }] };
    expect(validatePipeline(p)).toEqual([]);
  });

  it('rejects two edges from the same handle', () => {
    const p: Pipeline = { ...valid, edges: [...valid.edges, { id: 'x', source: 'w1', sourceHandle: 'out', target: 'c1' }] };
    expect(validatePipeline(p).join()).toContain('multiple edges leave w1:out');
  });

  it('rejects edges into a watch node', () => {
    const p: Pipeline = { ...valid, edges: [...valid.edges, { id: 'x', source: 'f1', sourceHandle: 'else', target: 'w1' }] };
    expect(validatePipeline(p).length).toBeGreaterThan(0);
  });

  it('rejects cycles', () => {
    const p: Pipeline = {
      nodes: [
        { id: 'f1', kind: 'filter', config: {}, position: { x: 0, y: 0 } },
        { id: 'f2', kind: 'filter', config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'f1', sourceHandle: 'match', target: 'f2' },
        { id: 'e2', source: 'f2', sourceHandle: 'match', target: 'f1' },
      ],
    };
    expect(validatePipeline(p).join()).toContain('cycle');
  });
});

describe('graph lookups', () => {
  it('edgeFrom finds the edge leaving a handle', () => {
    expect(edgeFrom(valid, 'f1', 'match')?.target).toBe('m1');
    expect(edgeFrom(valid, 'f1', 'nope')).toBeUndefined();
  });
  it('nodeById finds nodes', () => {
    expect(nodeById(valid, 'c1')?.kind).toBe('classify');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/graph` / `../src/types`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/types.ts`:
```ts
export type NodeKind = 'watch' | 'filter' | 'classify' | 'move';

export interface WatchConfig {
  path: string;
  recursive: boolean;
}

export interface FilterConfig {
  extensions?: string[]; // lowercase, with dot: ['.pdf']
  namePattern?: string; // glob by default
  regex?: boolean; // treat namePattern as a RegExp source instead
  minBytes?: number;
  maxBytes?: number;
  minAgeDays?: number;
  maxAgeDays?: number;
}

export interface ClassifyConfig {
  categories: string[]; // output handles; 'unsure' is implicit
  model: string; // e.g. 'llama3.2:3b'
}

export interface MoveConfig {
  destination: string; // may contain {category} {YYYY} {MM} {ext}, leading ~
  auto: boolean; // true = execute without review
}

export type NodeConfig = WatchConfig | FilterConfig | ClassifyConfig | MoveConfig | Record<string, never>;

export interface PipelineNode {
  id: string;
  kind: NodeKind;
  config: NodeConfig;
  position: { x: number; y: number };
}

export interface PipelineEdge {
  id: string;
  source: string;
  sourceHandle: string; // watch:'out' | filter:'match'|'else' | classify:<category>|'unsure'
  target: string;
}

export interface Pipeline {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export interface IncomingFile {
  path: string; // absolute
  name: string; // basename
  ext: string; // lowercase, with dot ('' if none)
  bytes: number;
  mtimeMs: number;
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface Proposal {
  id: string;
  filePath: string;
  fileName: string;
  destDir: string; // fully expanded destination directory
  moveNodeId: string;
  routeNodeIds: string[]; // node ids traversed (for UI animation)
  createdAt: number;
  status: ProposalStatus;
  error?: string;
}

export type JournalStatus = 'intent' | 'done' | 'failed' | 'undone';

export interface JournalEntry {
  id: string; // shared across the status lines of one move
  ts: number;
  from: string; // absolute source file path
  to: string; // absolute destination file path (final, post-collision)
  moveNodeId: string;
  status: JournalStatus;
}
```

`packages/engine/src/graph.ts`:
```ts
import type { ClassifyConfig, Pipeline, PipelineEdge, PipelineNode } from './types';

const OUT_HANDLES: Record<PipelineNode['kind'], (n: PipelineNode) => string[]> = {
  watch: () => ['out'],
  filter: () => ['match', 'else'],
  classify: (n) => [...(n.config as ClassifyConfig).categories, 'unsure'],
  move: () => [],
};

export function validatePipeline(p: Pipeline): string[] {
  const problems: string[] = [];
  const byId = new Map<string, PipelineNode>();
  for (const n of p.nodes) {
    if (byId.has(n.id)) problems.push(`duplicate node id: ${n.id}`);
    byId.set(n.id, n);
  }
  const seenHandles = new Set<string>();
  for (const e of p.edges) {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src) {
      problems.push(`edge ${e.id}: unknown source ${e.source}`);
      continue;
    }
    if (!tgt) {
      problems.push(`edge ${e.id}: unknown target ${e.target}`);
      continue;
    }
    if (!OUT_HANDLES[src.kind](src).includes(e.sourceHandle)) {
      problems.push(`edge ${e.id}: node ${src.id} has no output '${e.sourceHandle}'`);
    }
    const key = `${e.source}:${e.sourceHandle}`;
    if (seenHandles.has(key)) problems.push(`multiple edges leave ${key}`);
    seenHandles.add(key);
    if (tgt.kind === 'watch') problems.push(`edge ${e.id}: watch node ${tgt.id} cannot receive input`);
  }
  const adj = new Map<string, string[]>();
  for (const e of p.edges) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
  const state = new Map<string, 'visiting' | 'done'>();
  const hasCycle = (id: string): boolean => {
    if (state.get(id) === 'visiting') return true;
    if (state.get(id) === 'done') return false;
    state.set(id, 'visiting');
    for (const next of adj.get(id) ?? []) if (hasCycle(next)) return true;
    state.set(id, 'done');
    return false;
  };
  for (const n of p.nodes) {
    if (hasCycle(n.id)) {
      problems.push('pipeline contains a cycle');
      break;
    }
  }
  return problems;
}

export function edgeFrom(p: Pipeline, nodeId: string, handle: string): PipelineEdge | undefined {
  return p.edges.find((e) => e.source === nodeId && e.sourceHandle === handle);
}

export function nodeById(p: Pipeline, id: string): PipelineNode | undefined {
  return p.nodes.find((n) => n.id === id);
}
```

Replace `packages/engine/src/index.ts` with:
```ts
export const VERSION = '0.1.0';
export * from './types';
export * from './graph';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: all graph tests PASS (plus the Task 1 smoke test).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): pipeline types and graph validation"
```

---

### Task 3: Filter node predicates

**Files:**
- Create: `packages/engine/src/filter.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './filter';`)
- Test: `packages/engine/tests/filter.test.ts`

**Interfaces:**
- Consumes: `FilterConfig`, `IncomingFile` from `./types` (Task 2).
- Produces: `matchesFilter(file: IncomingFile, cfg: FilterConfig, nowMs?: number): boolean` and `globToRegExp(glob: string): RegExp`. Task 9's router calls `matchesFilter`.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/filter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { globToRegExp, matchesFilter } from '../src/filter';
import type { IncomingFile } from '../src/types';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function file(over: Partial<IncomingFile> = {}): IncomingFile {
  return {
    path: '/in/Report Final.PDF',
    name: 'Report Final.PDF',
    ext: '.pdf',
    bytes: 5_000,
    mtimeMs: NOW - DAY,
    ...over,
  };
}

describe('globToRegExp', () => {
  it('matches * and ? case-insensitively and anchors the pattern', () => {
    expect(globToRegExp('Screenshot*.png').test('screenshot 2026-06-30.PNG'.replace('.PNG', '.png'))).toBe(true);
    expect(globToRegExp('IMG_????.jpg').test('IMG_1234.jpg')).toBe(true);
    expect(globToRegExp('IMG_????.jpg').test('IMG_12345.jpg')).toBe(false);
    expect(globToRegExp('*.pdf').test('a.pdf.exe')).toBe(false);
  });
});

describe('matchesFilter', () => {
  it('empty config matches everything', () => {
    expect(matchesFilter(file(), {}, NOW)).toBe(true);
  });

  it('matches extensions case-insensitively', () => {
    expect(matchesFilter(file(), { extensions: ['.PDF'] }, NOW)).toBe(true);
    expect(matchesFilter(file(), { extensions: ['.png'] }, NOW)).toBe(false);
  });

  it('matches name globs', () => {
    expect(matchesFilter(file(), { namePattern: 'Report*' }, NOW)).toBe(true);
    expect(matchesFilter(file(), { namePattern: 'Invoice*' }, NOW)).toBe(false);
  });

  it('matches raw regex when regex=true', () => {
    expect(matchesFilter(file(), { namePattern: '^report\\s+final', regex: true }, NOW)).toBe(true);
  });

  it('enforces size bounds', () => {
    expect(matchesFilter(file(), { minBytes: 10_000 }, NOW)).toBe(false);
    expect(matchesFilter(file(), { maxBytes: 1_000 }, NOW)).toBe(false);
    expect(matchesFilter(file(), { minBytes: 1_000, maxBytes: 10_000 }, NOW)).toBe(true);
  });

  it('enforces age bounds from mtime', () => {
    expect(matchesFilter(file(), { minAgeDays: 2 }, NOW)).toBe(false);
    expect(matchesFilter(file(), { maxAgeDays: 2 }, NOW)).toBe(true);
    expect(matchesFilter(file({ mtimeMs: NOW - 10 * DAY }), { maxAgeDays: 2 }, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/filter`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/filter.ts`:
```ts
import type { FilterConfig, IncomingFile } from './types';

export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

export function matchesFilter(file: IncomingFile, cfg: FilterConfig, nowMs = Date.now()): boolean {
  if (cfg.extensions && cfg.extensions.length > 0) {
    const wanted = cfg.extensions.map((e) => e.toLowerCase());
    if (!wanted.includes(file.ext)) return false;
  }
  if (cfg.namePattern) {
    const re = cfg.regex ? new RegExp(cfg.namePattern, 'i') : globToRegExp(cfg.namePattern);
    if (!re.test(file.name)) return false;
  }
  if (cfg.minBytes !== undefined && file.bytes < cfg.minBytes) return false;
  if (cfg.maxBytes !== undefined && file.bytes > cfg.maxBytes) return false;
  const ageDays = (nowMs - file.mtimeMs) / 86_400_000;
  if (cfg.minAgeDays !== undefined && ageDays < cfg.minAgeDays) return false;
  if (cfg.maxAgeDays !== undefined && ageDays > cfg.maxAgeDays) return false;
  return true;
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './filter';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): filter node predicates with glob and age matching"
```

---

### Task 4: Destination templates + collision-safe paths

**Files:**
- Create: `packages/engine/src/move.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './move';`)
- Test: `packages/engine/tests/move.test.ts`

**Interfaces:**
- Consumes: nothing from other modules (pure + fs).
- Produces: `expandDestination(template: string, ctx: { category?: string; date: Date; ext: string; home: string }): string` and `uniqueDestination(destDir: string, fileName: string): Promise<string>` (absolute file path that does not exist yet — suffixes ` (1)`, ` (2)`…). Tasks 6 and 12 use both.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/move.test.ts`:
```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandDestination, uniqueDestination } from '../src/move';

describe('expandDestination', () => {
  const ctx = { category: 'Receipts', date: new Date(2026, 6, 1), ext: '.pdf', home: '/Users/dat' };

  it('expands all tokens', () => {
    expect(expandDestination('~/Docs/{category}/{YYYY}-{MM}/{ext}', ctx)).toBe('/Users/dat/Docs/Receipts/2026-07/pdf');
  });

  it('falls back to Unsorted when no category', () => {
    expect(expandDestination('~/Docs/{category}', { ...ctx, category: undefined })).toBe('/Users/dat/Docs/Unsorted');
  });

  it('leaves paths without tokens or tilde untouched', () => {
    expect(expandDestination('/data/inbox', ctx)).toBe('/data/inbox');
  });
});

describe('uniqueDestination', () => {
  it('returns dir/name when free, then suffixes (1), (2)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sortflow-'));
    expect(await uniqueDestination(dir, 'report.pdf')).toBe(join(dir, 'report.pdf'));
    await writeFile(join(dir, 'report.pdf'), 'x');
    expect(await uniqueDestination(dir, 'report.pdf')).toBe(join(dir, 'report (1).pdf'));
    await writeFile(join(dir, 'report (1).pdf'), 'x');
    expect(await uniqueDestination(dir, 'report.pdf')).toBe(join(dir, 'report (2).pdf'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/move`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/move.ts`:
```ts
import { access } from 'node:fs/promises';
import { join, parse } from 'node:path';

export interface DestContext {
  category?: string;
  date: Date;
  ext: string; // with dot
  home: string;
}

export function expandDestination(template: string, ctx: DestContext): string {
  let out = template;
  if (out.startsWith('~')) out = ctx.home + out.slice(1);
  const yyyy = String(ctx.date.getFullYear());
  const mm = String(ctx.date.getMonth() + 1).padStart(2, '0');
  return out
    .replaceAll('{YYYY}', yyyy)
    .replaceAll('{MM}', mm)
    .replaceAll('{ext}', ctx.ext.replace(/^\./, ''))
    .replaceAll('{category}', ctx.category ?? 'Unsorted');
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function uniqueDestination(destDir: string, fileName: string): Promise<string> {
  const { name, ext } = parse(fileName);
  let candidate = join(destDir, fileName);
  for (let i = 1; await exists(candidate); i++) {
    candidate = join(destDir, `${name} (${i})${ext}`);
  }
  return candidate;
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './move';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): destination templates and collision-safe paths"
```

---

### Task 5: Journal (append-only JSONL + crash reconciliation)

**Files:**
- Create: `packages/engine/src/journal.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './journal';`)
- Test: `packages/engine/tests/journal.test.ts`

**Interfaces:**
- Consumes: `JournalEntry` from `./types` (Task 2).
- Produces: `class Journal { constructor(filePath: string); append(e: JournalEntry): Promise<void>; readAll(): Promise<JournalEntry[]>; latestById(): Promise<Map<string, JournalEntry>>; reconcile(now: number): Promise<JournalEntry[]> }`. Status transitions are new appended lines with the same `id`; the latest line per id wins. Tasks 6 and 12 depend on this exact class.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/journal.test.ts`:
```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Journal } from '../src/journal';
import type { JournalEntry } from '../src/types';

async function tempJournal(): Promise<{ journal: Journal; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'sortflow-journal-'));
  return { journal: new Journal(join(dir, 'sub', 'journal.jsonl')), dir };
}

function entry(over: Partial<JournalEntry>): JournalEntry {
  return { id: 'a', ts: 1, from: '/in/x.txt', to: '/out/x.txt', moveNodeId: 'm1', status: 'intent', ...over };
}

describe('Journal', () => {
  it('appends and reads back entries, creating parent dirs', async () => {
    const { journal } = await tempJournal();
    await journal.append(entry({}));
    await journal.append(entry({ status: 'done', ts: 2 }));
    const all = await journal.readAll();
    expect(all).toHaveLength(2);
    expect(all[1].status).toBe('done');
  });

  it('returns [] for a missing file', async () => {
    const { journal } = await tempJournal();
    expect(await journal.readAll()).toEqual([]);
  });

  it('latestById keeps the last line per id', async () => {
    const { journal } = await tempJournal();
    await journal.append(entry({}));
    await journal.append(entry({ status: 'done', ts: 2 }));
    await journal.append(entry({ id: 'b', status: 'intent' }));
    const latest = await journal.latestById();
    expect(latest.get('a')?.status).toBe('done');
    expect(latest.get('b')?.status).toBe('intent');
  });

  it('reconcile marks dangling intents done when the file arrived, failed when not', async () => {
    const { journal, dir } = await tempJournal();
    const arrived = join(dir, 'arrived.txt');
    await writeFile(arrived, 'x');
    await journal.append(entry({ id: 'ok', to: arrived }));
    await journal.append(entry({ id: 'lost', to: join(dir, 'never-written.txt') }));
    await journal.append(entry({ id: 'fine', status: 'done' }));

    const corrections = await journal.reconcile(99);
    expect(corrections.map((c) => [c.id, c.status]).sort()).toEqual([
      ['lost', 'failed'],
      ['ok', 'done'],
    ]);
    const latest = await journal.latestById();
    expect(latest.get('ok')?.status).toBe('done');
    expect(latest.get('lost')?.status).toBe('failed');
    expect(latest.get('fine')?.status).toBe('done');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/journal`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/journal.ts`:
```ts
import { access, appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { JournalEntry } from './types';

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export class Journal {
  constructor(private filePath: string) {}

  async append(entry: JournalEntry): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  async readAll(): Promise<JournalEntry[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as JournalEntry);
    } catch {
      return [];
    }
  }

  async latestById(): Promise<Map<string, JournalEntry>> {
    const map = new Map<string, JournalEntry>();
    for (const e of await this.readAll()) map.set(e.id, e);
    return map;
  }

  /** Resolve moves that crashed between 'intent' and 'done'. Never lies: checks the disk. */
  async reconcile(now: number): Promise<JournalEntry[]> {
    const corrections: JournalEntry[] = [];
    for (const e of (await this.latestById()).values()) {
      if (e.status !== 'intent') continue;
      const done = await fileExists(e.to);
      const fixed: JournalEntry = { ...e, ts: now, status: done ? 'done' : 'failed' };
      await this.append(fixed);
      corrections.push(fixed);
    }
    return corrections;
  }
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './journal';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): append-only journal with crash reconciliation"
```

---

### Task 6: Move executor + undo

**Files:**
- Create: `packages/engine/src/executor.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './executor';`)
- Test: `packages/engine/tests/executor.test.ts`

**Interfaces:**
- Consumes: `Journal` (Task 5), `uniqueDestination` (Task 4), `JournalEntry` (Task 2).
- Produces:
  - `executeMove(req: { id: string; from: string; toDir: string; moveNodeId: string }, journal: Journal, opts?: { retries?: number; backoffMs?: number; renameFn?: (from: string, to: string) => Promise<void>; now?: () => number }): Promise<JournalEntry>` — journal-first; retries EBUSY/EPERM/EACCES/ETXTBSY with exponential backoff; EXDEV falls back to copy+unlink; throws `MoveFailedError` (with `.entry`) after appending a `failed` line.
  - `undoMove(entryId: string, journal: Journal, opts?: same): Promise<JournalEntry>` — reverses a `done` move, appends `undone`.
  - `class MoveFailedError extends Error { entry: JournalEntry }`.
  Task 12's Engine calls both.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/executor.test.ts`:
```ts
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MoveFailedError, executeMove, undoMove } from '../src/executor';
import { Journal } from '../src/journal';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'sortflow-exec-'));
  const src = join(dir, 'in');
  const dst = join(dir, 'out');
  await mkdir(src, { recursive: true });
  const journal = new Journal(join(dir, 'journal.jsonl'));
  const from = join(src, 'a.txt');
  await writeFile(from, 'hello');
  return { dir, src, dst, journal, from };
}

describe('executeMove', () => {
  it('moves the file, journaling intent then done', async () => {
    const { dst, journal, from } = await setup();
    const done = await executeMove({ id: 'j1', from, toDir: dst, moveNodeId: 'm1' }, journal);
    expect(done.status).toBe('done');
    expect(existsSync(from)).toBe(false);
    expect(await readFile(done.to, 'utf8')).toBe('hello');
    const statuses = (await journal.readAll()).map((e) => e.status);
    expect(statuses).toEqual(['intent', 'done']);
  });

  it('suffixes on collision instead of overwriting', async () => {
    const { dst, journal, from } = await setup();
    await mkdir(dst, { recursive: true });
    await writeFile(join(dst, 'a.txt'), 'existing');
    const done = await executeMove({ id: 'j1', from, toDir: dst, moveNodeId: 'm1' }, journal);
    expect(done.to).toBe(join(dst, 'a (1).txt'));
    expect(await readFile(join(dst, 'a.txt'), 'utf8')).toBe('existing');
  });

  it('retries retryable errors then succeeds', async () => {
    const { dst, journal, from } = await setup();
    let calls = 0;
    const flaky = async (f: string, t: string) => {
      calls++;
      if (calls < 3) {
        const err = new Error('busy') as NodeJS.ErrnoException;
        err.code = 'EBUSY';
        throw err;
      }
      const { rename } = await import('node:fs/promises');
      await rename(f, t);
    };
    const done = await executeMove({ id: 'j1', from, toDir: dst, moveNodeId: 'm1' }, journal, {
      renameFn: flaky,
      backoffMs: 1,
    });
    expect(done.status).toBe('done');
    expect(calls).toBe(3);
  });

  it('journals failed and throws MoveFailedError on permanent errors', async () => {
    const { dst, journal, from } = await setup();
    const broken = async () => {
      const err = new Error('nope') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    };
    await expect(
      executeMove({ id: 'j1', from, toDir: dst, moveNodeId: 'm1' }, journal, { renameFn: broken }),
    ).rejects.toBeInstanceOf(MoveFailedError);
    const statuses = (await journal.readAll()).map((e) => e.status);
    expect(statuses).toEqual(['intent', 'failed']);
  });
});

describe('undoMove', () => {
  it('moves the file back and journals undone', async () => {
    const { dst, journal, from } = await setup();
    const done = await executeMove({ id: 'j1', from, toDir: dst, moveNodeId: 'm1' }, journal);
    const undone = await undoMove('j1', journal);
    expect(undone.status).toBe('undone');
    expect(existsSync(from)).toBe(true);
    expect(existsSync(done.to)).toBe(false);
  });

  it('refuses to undo entries that are not done', async () => {
    const { journal } = await setup();
    await expect(undoMove('ghost', journal)).rejects.toThrow(/cannot undo/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/executor`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/executor.ts`:
```ts
import { copyFile, mkdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { Journal } from './journal';
import { uniqueDestination } from './move';
import type { JournalEntry } from './types';

export interface MoveRequest {
  id: string;
  from: string;
  toDir: string;
  moveNodeId: string;
}

export interface ExecOptions {
  retries?: number;
  backoffMs?: number;
  renameFn?: (from: string, to: string) => Promise<void>;
  now?: () => number;
}

const RETRYABLE = new Set(['EBUSY', 'EPERM', 'EACCES', 'ETXTBSY']);

export class MoveFailedError extends Error {
  constructor(
    public entry: JournalEntry,
    cause: unknown,
  ) {
    super(`move failed: ${entry.from} -> ${entry.to}: ${String(cause)}`);
  }
}

async function moveWithFallback(from: string, to: string, renameFn?: ExecOptions['renameFn']): Promise<void> {
  try {
    await (renameFn ?? rename)(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await copyFile(from, to);
      await unlink(from);
    } else {
      throw err;
    }
  }
}

export async function executeMove(req: MoveRequest, journal: Journal, opts: ExecOptions = {}): Promise<JournalEntry> {
  const { retries = 3, backoffMs = 250, now = Date.now } = opts;
  await mkdir(req.toDir, { recursive: true });
  const to = await uniqueDestination(req.toDir, basename(req.from));
  const base = { id: req.id, from: req.from, to, moveNodeId: req.moveNodeId };
  await journal.append({ ...base, ts: now(), status: 'intent' });
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await moveWithFallback(req.from, to, opts.renameFn);
      const done: JournalEntry = { ...base, ts: now(), status: 'done' };
      await journal.append(done);
      return done;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (!RETRYABLE.has(code) || attempt === retries) break;
      await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
    }
  }
  const failed: JournalEntry = { ...base, ts: now(), status: 'failed' };
  await journal.append(failed);
  throw new MoveFailedError(failed, lastErr);
}

export async function undoMove(entryId: string, journal: Journal, opts: ExecOptions = {}): Promise<JournalEntry> {
  const { now = Date.now } = opts;
  const latest = (await journal.latestById()).get(entryId);
  if (!latest || latest.status !== 'done') {
    throw new Error(`cannot undo ${entryId}: no completed move found`);
  }
  const backTo = await uniqueDestination(dirname(latest.from), basename(latest.from));
  await moveWithFallback(latest.to, backTo, opts.renameFn);
  const undone: JournalEntry = { ...latest, ts: now(), status: 'undone' };
  await journal.append(undone);
  return undone;
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './executor';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): journal-first move executor with retry and undo"
```

---

### Task 7: Classifier interface + OllamaClassifier

**Files:**
- Create: `packages/engine/src/classify.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './classify';`)
- Test: `packages/engine/tests/classify.test.ts`

**Interfaces:**
- Consumes: `ClassifyConfig`, `IncomingFile` (Task 2).
- Produces: `const UNSURE = 'unsure'`; `interface Classifier { classify(file: IncomingFile, cfg: ClassifyConfig): Promise<string> }`; `class OllamaClassifier implements Classifier { constructor(baseUrl?: string, fetchFn?: typeof fetch); ping(): Promise<boolean>; classify(...): Promise<string> }`. `classify` returns a category from `cfg.categories` or `UNSURE`; it NEVER throws (any error ⇒ `UNSURE`). Tasks 8, 9, 12 depend on `Classifier`/`UNSURE`. This interface is the plug-in seam for future cloud providers.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/classify.test.ts`:
```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { OllamaClassifier, UNSURE } from '../src/classify';
import type { ClassifyConfig, IncomingFile } from '../src/types';

const cfg: ClassifyConfig = { categories: ['School', 'Receipts'], model: 'llama3.2:3b' };

function ollamaOk(category: string) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ message: { content: JSON.stringify({ category }) } }), { status: 200 }),
  ) as unknown as typeof fetch;
}

async function tempFile(name: string, content: string): Promise<IncomingFile> {
  const dir = await mkdtemp(join(tmpdir(), 'sortflow-classify-'));
  const path = join(dir, name);
  await writeFile(path, content);
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
  return { path, name, ext: ext.toLowerCase(), bytes: content.length, mtimeMs: 0 };
}

describe('OllamaClassifier', () => {
  it('returns the category Ollama picked', async () => {
    const fetchFn = ollamaOk('Receipts');
    const c = new OllamaClassifier('http://127.0.0.1:11434', fetchFn);
    expect(await c.classify(await tempFile('scan.pdf', ''), cfg)).toBe('Receipts');
  });

  it('includes a content snippet for text files in the prompt', async () => {
    const fetchFn = ollamaOk('School');
    const c = new OllamaClassifier('http://127.0.0.1:11434', fetchFn);
    await c.classify(await tempFile('notes.md', 'CSE 101 homework notes'), cfg);
    const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.messages[0].content).toContain('CSE 101 homework notes');
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0);
  });

  it('omits snippets for non-text files', async () => {
    const fetchFn = ollamaOk('School');
    const c = new OllamaClassifier('http://127.0.0.1:11434', fetchFn);
    await c.classify(await tempFile('photo.jpg', 'BINARYJUNK'), cfg);
    const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.messages[0].content).not.toContain('BINARYJUNK');
  });

  it('returns unsure for a category outside the list', async () => {
    const c = new OllamaClassifier('http://127.0.0.1:11434', ollamaOk('Taxes'));
    expect(await c.classify(await tempFile('x.pdf', ''), cfg)).toBe(UNSURE);
  });

  it('returns unsure when fetch rejects (Ollama not running)', async () => {
    const failing = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const c = new OllamaClassifier('http://127.0.0.1:11434', failing);
    expect(await c.classify(await tempFile('x.pdf', ''), cfg)).toBe(UNSURE);
  });

  it('returns unsure on non-200 responses and bad JSON', async () => {
    const c500 = new OllamaClassifier('http://x', vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch);
    expect(await c500.classify(await tempFile('x.pdf', ''), cfg)).toBe(UNSURE);
    const cBad = new OllamaClassifier('http://x', vi.fn(async () =>
      new Response(JSON.stringify({ message: { content: 'not json' } }), { status: 200 }),
    ) as unknown as typeof fetch);
    expect(await cBad.classify(await tempFile('x.pdf', ''), cfg)).toBe(UNSURE);
  });

  it('ping reports reachability', async () => {
    const up = new OllamaClassifier('http://x', vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch);
    expect(await up.ping()).toBe(true);
    const down = new OllamaClassifier('http://x', vi.fn(async () => {
      throw new Error('refused');
    }) as unknown as typeof fetch);
    expect(await down.ping()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/classify`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/classify.ts`:
```ts
import { open } from 'node:fs/promises';
import type { ClassifyConfig, IncomingFile } from './types';

export const UNSURE = 'unsure';

const TEXT_EXTS = new Set(['.txt', '.md', '.csv', '.json', '.log', '.ts', '.js', '.py', '.html', '.css']);
const SNIPPET_BYTES = 1024;

export interface Classifier {
  classify(file: IncomingFile, cfg: ClassifyConfig): Promise<string>;
}

async function readSnippet(path: string): Promise<string> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(SNIPPET_BYTES);
    const { bytesRead } = await fh.read(buf, 0, SNIPPET_BYTES, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await fh.close();
  }
}

export class OllamaClassifier implements Classifier {
  constructor(
    private baseUrl = 'http://127.0.0.1:11434',
    private fetchFn: typeof fetch = fetch,
  ) {}

  async ping(): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async classify(file: IncomingFile, cfg: ClassifyConfig): Promise<string> {
    try {
      const snippet = TEXT_EXTS.has(file.ext) ? await readSnippet(file.path) : '';
      const prompt = [
        'Classify this file into exactly one category.',
        `Categories: ${cfg.categories.join(', ')}`,
        `Filename: ${file.name}`,
        snippet ? `Content (first 1KB):\n${snippet}` : '',
        'Reply with JSON: {"category": "<one of the categories, or unsure>"}',
      ]
        .filter(Boolean)
        .join('\n');
      const res = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          format: 'json',
          options: { temperature: 0 },
        }),
      });
      if (!res.ok) return UNSURE;
      const data = (await res.json()) as { message?: { content?: string } };
      const parsed = JSON.parse(data.message?.content ?? '{}') as { category?: string };
      return parsed.category && cfg.categories.includes(parsed.category) ? parsed.category : UNSURE;
    } catch {
      return UNSURE;
    }
  }
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './classify';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): pluggable classifier with local Ollama implementation"
```

---

### Task 8: Throttled classification queue

**Files:**
- Create: `packages/engine/src/queue.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './queue';`)
- Test: `packages/engine/tests/queue.test.ts`

**Interfaces:**
- Consumes: `Classifier`, `UNSURE` (Task 7); `ClassifyConfig`, `IncomingFile` (Task 2).
- Produces: `class ClassifyQueue { constructor(classifier: Classifier, cooldownMs?: number, sleep?: (ms: number) => Promise<void>); enqueue(file, cfg): Promise<string>; get length(): number }`. Jobs run strictly one at a time, FIFO, with `cooldownMs` (default 2000) sleep after each job — this is the spec's thermals requirement. Task 12 wraps the classifier with this.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/queue.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ClassifyQueue } from '../src/queue';
import type { Classifier } from '../src/classify';
import type { ClassifyConfig, IncomingFile } from '../src/types';

const cfg: ClassifyConfig = { categories: ['A'], model: 'm' };
const file = (name: string): IncomingFile => ({ path: `/${name}`, name, ext: '.txt', bytes: 1, mtimeMs: 0 });

describe('ClassifyQueue', () => {
  it('runs jobs strictly one at a time, in order, with a cooldown between them', async () => {
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    const classifier: Classifier = {
      async classify(f) {
        active++;
        maxActive = Math.max(maxActive, active);
        events.push(`start:${f.name}`);
        await new Promise((r) => setTimeout(r, 5));
        events.push(`end:${f.name}`);
        active--;
        return 'A';
      },
    };
    const sleeps: number[] = [];
    const queue = new ClassifyQueue(classifier, 1000, async (ms) => {
      sleeps.push(ms);
      events.push('cooldown');
    });
    const results = await Promise.all([queue.enqueue(file('1'), cfg), queue.enqueue(file('2'), cfg), queue.enqueue(file('3'), cfg)]);
    expect(results).toEqual(['A', 'A', 'A']);
    expect(maxActive).toBe(1);
    expect(events).toEqual(['start:1', 'end:1', 'cooldown', 'start:2', 'end:2', 'cooldown', 'start:3', 'end:3', 'cooldown']);
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });

  it('length tracks pending jobs', async () => {
    const classifier: Classifier = {
      classify: () => new Promise((r) => setTimeout(() => r('A'), 10)),
    };
    const queue = new ClassifyQueue(classifier, 0, async () => {});
    const p1 = queue.enqueue(file('1'), cfg);
    const p2 = queue.enqueue(file('2'), cfg);
    expect(queue.length).toBe(2);
    await Promise.all([p1, p2]);
    expect(queue.length).toBe(0);
  });

  it('a throwing classifier resolves to unsure and does not poison the chain', async () => {
    let calls = 0;
    const classifier: Classifier = {
      async classify() {
        calls++;
        if (calls === 1) throw new Error('boom');
        return 'A';
      },
    };
    const queue = new ClassifyQueue(classifier, 0, async () => {});
    expect(await queue.enqueue(file('1'), cfg)).toBe('unsure');
    expect(await queue.enqueue(file('2'), cfg)).toBe('A');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/queue`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/queue.ts`:
```ts
import { UNSURE, type Classifier } from './classify';
import type { ClassifyConfig, IncomingFile } from './types';

/** Serializes classification jobs with a cooldown so bulk drops never pin the CPU (spec: thermals). */
export class ClassifyQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(
    private classifier: Classifier,
    private cooldownMs = 2000,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  get length(): number {
    return this.pending;
  }

  enqueue(file: IncomingFile, cfg: ClassifyConfig): Promise<string> {
    this.pending++;
    const result = this.chain.then(async () => {
      try {
        return await this.classifier.classify(file, cfg);
      } catch {
        return UNSURE;
      } finally {
        this.pending--;
      }
    });
    this.chain = result.then(() => this.sleep(this.cooldownMs));
    return result;
  }
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './queue';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): serialized classify queue with cooldown throttle"
```

---

### Task 9: Router (graph walk per file)

**Files:**
- Create: `packages/engine/src/route.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './route';`)
- Test: `packages/engine/tests/route.test.ts`

**Interfaces:**
- Consumes: `edgeFrom`, `nodeById` (Task 2), `matchesFilter` (Task 3), `UNSURE` (Task 7), types (Task 2).
- Produces: `routeFile(pipeline: Pipeline, watchNodeId: string, file: IncomingFile, classify: (file: IncomingFile, cfg: ClassifyConfig) => Promise<string>, nowMs?: number): Promise<{ moveNodeId: string | null; nodePath: string[]; category?: string }>`. A missing edge for the taken handle ⇒ dead end (`moveNodeId: null`, file untouched). Task 12 calls this per incoming file.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/route.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { routeFile } from '../src/route';
import type { IncomingFile, Pipeline } from '../src/types';

const pipeline: Pipeline = {
  nodes: [
    { id: 'w1', kind: 'watch', config: { path: '/in', recursive: false }, position: { x: 0, y: 0 } },
    { id: 'f1', kind: 'filter', config: { extensions: ['.png'] }, position: { x: 0, y: 0 } },
    { id: 'c1', kind: 'classify', config: { categories: ['School', 'Receipts'], model: 'm' }, position: { x: 0, y: 0 } },
    { id: 'mShots', kind: 'move', config: { destination: '~/Pictures/Screenshots', auto: false }, position: { x: 0, y: 0 } },
    { id: 'mSchool', kind: 'move', config: { destination: '~/Docs/School', auto: false }, position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: 'e1', source: 'w1', sourceHandle: 'out', target: 'f1' },
    { id: 'e2', source: 'f1', sourceHandle: 'match', target: 'mShots' },
    { id: 'e3', source: 'f1', sourceHandle: 'else', target: 'c1' },
    { id: 'e4', source: 'c1', sourceHandle: 'School', target: 'mSchool' },
  ],
};

const png: IncomingFile = { path: '/in/shot.png', name: 'shot.png', ext: '.png', bytes: 10, mtimeMs: 0 };
const pdf: IncomingFile = { path: '/in/hw.pdf', name: 'hw.pdf', ext: '.pdf', bytes: 10, mtimeMs: 0 };

const classifyAs = (answer: string) => async () => answer;

describe('routeFile', () => {
  it('routes through filter match to a move node', async () => {
    const r = await routeFile(pipeline, 'w1', png, classifyAs('School'), 0);
    expect(r).toEqual({ moveNodeId: 'mShots', nodePath: ['w1', 'f1', 'mShots'], category: undefined });
  });

  it('routes filter else into classify and takes the category edge', async () => {
    const r = await routeFile(pipeline, 'w1', pdf, classifyAs('School'), 0);
    expect(r.moveNodeId).toBe('mSchool');
    expect(r.category).toBe('School');
    expect(r.nodePath).toEqual(['w1', 'f1', 'c1', 'mSchool']);
  });

  it('dead-ends when the taken handle has no edge (Receipts unwired)', async () => {
    const r = await routeFile(pipeline, 'w1', pdf, classifyAs('Receipts'), 0);
    expect(r.moveNodeId).toBeNull();
    expect(r.category).toBe('Receipts');
  });

  it('dead-ends on unsure with no unsure edge, category stays undefined', async () => {
    const r = await routeFile(pipeline, 'w1', pdf, classifyAs('unsure'), 0);
    expect(r.moveNodeId).toBeNull();
    expect(r.category).toBeUndefined();
  });

  it('dead-ends when the watch node has no outgoing edge', async () => {
    const lonely: Pipeline = { nodes: [pipeline.nodes[0]], edges: [] };
    const r = await routeFile(lonely, 'w1', png, classifyAs('School'), 0);
    expect(r).toEqual({ moveNodeId: null, nodePath: ['w1'], category: undefined });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/route`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/route.ts`:
```ts
import { UNSURE } from './classify';
import { matchesFilter } from './filter';
import { edgeFrom, nodeById } from './graph';
import type { ClassifyConfig, FilterConfig, IncomingFile, Pipeline } from './types';

export interface RouteResult {
  moveNodeId: string | null;
  nodePath: string[];
  category?: string;
}

export type ClassifyFn = (file: IncomingFile, cfg: ClassifyConfig) => Promise<string>;

export async function routeFile(
  pipeline: Pipeline,
  watchNodeId: string,
  file: IncomingFile,
  classify: ClassifyFn,
  nowMs = Date.now(),
): Promise<RouteResult> {
  const nodePath: string[] = [watchNodeId];
  let category: string | undefined;
  let edge = edgeFrom(pipeline, watchNodeId, 'out');
  while (edge) {
    const node = nodeById(pipeline, edge.target);
    if (!node) break;
    nodePath.push(node.id);
    switch (node.kind) {
      case 'filter': {
        const handle = matchesFilter(file, node.config as FilterConfig, nowMs) ? 'match' : 'else';
        edge = edgeFrom(pipeline, node.id, handle);
        break;
      }
      case 'classify': {
        const result = await classify(file, node.config as ClassifyConfig);
        category = result === UNSURE ? undefined : result;
        edge = edgeFrom(pipeline, node.id, result);
        break;
      }
      case 'move':
        return { moveNodeId: node.id, nodePath, category };
      default:
        edge = undefined;
    }
  }
  return { moveNodeId: null, nodePath, category };
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './route';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): per-file graph routing through filters and classifier"
```

---

### Task 10: Proposal store + approval streaks

**Files:**
- Create: `packages/engine/src/proposals.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './proposals';`)
- Test: `packages/engine/tests/proposals.test.ts`

**Interfaces:**
- Consumes: `Proposal`, `ProposalStatus` (Task 2).
- Produces: `class ProposalStore { constructor(filePath: string); load(): Promise<void>; list(): Proposal[]; get(id): Proposal | undefined; add(p: Omit<Proposal, 'id' | 'createdAt' | 'status'>, now: number): Promise<Proposal>; setStatus(id, status, error?): Promise<void>; approvalStreak(moveNodeId: string): number }`. Persists the whole list as JSON so pending reviews survive restarts. Streak = consecutive `approved`/`executed` for that move node, newest first, broken by a `rejected` (pending/failed are skipped). Task 12 and the UI's promotion offer depend on this.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/proposals.test.ts`:
```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProposalStore } from '../src/proposals';

async function store(): Promise<{ s: ProposalStore; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'sortflow-props-'));
  const file = join(dir, 'sub', 'proposals.json');
  const s = new ProposalStore(file);
  await s.load();
  return { s, file };
}

const draft = (moveNodeId = 'm1') => ({
  filePath: '/in/a.txt',
  fileName: 'a.txt',
  destDir: '/out',
  moveNodeId,
  routeNodeIds: ['w1', 'm1'],
});

describe('ProposalStore', () => {
  it('adds pending proposals with generated ids', async () => {
    const { s } = await store();
    const p = await s.add(draft(), 100);
    expect(p.status).toBe('pending');
    expect(p.createdAt).toBe(100);
    expect(p.id).toBeTruthy();
    expect(s.list()).toHaveLength(1);
  });

  it('persists across load', async () => {
    const { s, file } = await store();
    await s.add(draft(), 100);
    const s2 = new ProposalStore(file);
    await s2.load();
    expect(s2.list()).toHaveLength(1);
  });

  it('setStatus updates and records errors; unknown id throws', async () => {
    const { s } = await store();
    const p = await s.add(draft(), 100);
    await s.setStatus(p.id, 'failed', 'disk full');
    expect(s.get(p.id)?.error).toBe('disk full');
    await expect(s.setStatus('ghost', 'approved')).rejects.toThrow(/unknown proposal/);
  });

  it('approvalStreak counts consecutive approvals newest-first and stops at a rejection', async () => {
    const { s } = await store();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await s.add(draft(), i)).id);
    await s.setStatus(ids[0], 'executed');
    await s.setStatus(ids[1], 'rejected');
    await s.setStatus(ids[2], 'approved');
    await s.setStatus(ids[3], 'executed');
    // ids[4] stays pending — skipped
    expect(s.approvalStreak('m1')).toBe(2); // ids[3], ids[2], then rejection at ids[1]
    expect(s.approvalStreak('other')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/proposals`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/proposals.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Proposal, ProposalStatus } from './types';

export class ProposalStore {
  private items: Proposal[] = [];

  constructor(private filePath: string) {}

  async load(): Promise<void> {
    try {
      this.items = JSON.parse(await readFile(this.filePath, 'utf8')) as Proposal[];
    } catch {
      this.items = [];
    }
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.items, null, 2), 'utf8');
  }

  list(): Proposal[] {
    return [...this.items];
  }

  get(id: string): Proposal | undefined {
    return this.items.find((p) => p.id === id);
  }

  async add(p: Omit<Proposal, 'id' | 'createdAt' | 'status'>, now: number): Promise<Proposal> {
    const proposal: Proposal = { ...p, id: randomUUID(), createdAt: now, status: 'pending' };
    this.items.push(proposal);
    await this.save();
    return proposal;
  }

  async setStatus(id: string, status: ProposalStatus, error?: string): Promise<void> {
    const p = this.get(id);
    if (!p) throw new Error(`unknown proposal ${id}`);
    p.status = status;
    if (error !== undefined) p.error = error;
    await this.save();
  }

  /** Consecutive approved/executed for a move node, newest first, broken by a rejection. */
  approvalStreak(moveNodeId: string): number {
    const decided = this.items
      .filter((p) => p.moveNodeId === moveNodeId && p.status !== 'pending' && p.status !== 'failed')
      .sort((a, b) => b.createdAt - a.createdAt);
    let streak = 0;
    for (const p of decided) {
      if (p.status === 'rejected') break;
      streak++;
    }
    return streak;
  }
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './proposals';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): persistent proposal store with approval streaks"
```

---

### Task 11: Folder watcher

**Files:**
- Create: `packages/engine/src/watcher.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './watcher';`)
- Test: `packages/engine/tests/watcher.test.ts`

**Interfaces:**
- Consumes: `IncomingFile`, `WatchConfig` (Task 2); `chokidar`.
- Produces: `class FolderWatcher { constructor(onFile: (watchNodeId: string, file: IncomingFile) => void, options?: { stabilityThreshold?: number; pollInterval?: number }); watch(nodeId: string, cfg: WatchConfig): void; close(): Promise<void> }`. Emits only after write-stability (`awaitWriteFinish`, default threshold 1500ms — the spec's half-downloaded-file guard); `recursive: false` ignores subdirectories. Task 12 owns one instance.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/watcher.test.ts`:
```ts
import { mkdir, mkdtemp, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FolderWatcher } from '../src/watcher';
import type { IncomingFile } from '../src/types';

const FAST = { stabilityThreshold: 200, pollInterval: 50 };
let watcher: FolderWatcher | undefined;

afterEach(async () => {
  await watcher?.close();
  watcher = undefined;
});

function collect(): { events: Array<{ nodeId: string; file: IncomingFile }>; watcher: FolderWatcher } {
  const events: Array<{ nodeId: string; file: IncomingFile }> = [];
  watcher = new FolderWatcher((nodeId, file) => events.push({ nodeId, file }), FAST);
  return { events, watcher };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('FolderWatcher', () => {
  it('emits one event per new file, after the file stabilizes, with metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sortflow-watch-'));
    const { events, watcher } = collect();
    watcher.watch('w1', { path: dir, recursive: false });
    await sleep(300); // let chokidar initialize

    await writeFile(join(dir, 'incoming.txt'), 'part1-');
    await sleep(100); // still inside the stability window
    await appendFile(join(dir, 'incoming.txt'), 'part2');
    await sleep(800); // stability threshold passes

    expect(events).toHaveLength(1);
    expect(events[0].nodeId).toBe('w1');
    expect(events[0].file.name).toBe('incoming.txt');
    expect(events[0].file.ext).toBe('.txt');
    expect(events[0].file.bytes).toBe('part1-part2'.length);
  }, 10_000);

  it('ignores files in subdirectories when recursive is false', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sortflow-watch-'));
    await mkdir(join(dir, 'sub'));
    const { events, watcher } = collect();
    watcher.watch('w1', { path: dir, recursive: false });
    await sleep(300);

    await writeFile(join(dir, 'sub', 'deep.txt'), 'x');
    await sleep(800);

    expect(events).toHaveLength(0);
  }, 10_000);

  it('ignores files that existed before watching started', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sortflow-watch-'));
    await writeFile(join(dir, 'old.txt'), 'x');
    const { events, watcher } = collect();
    watcher.watch('w1', { path: dir, recursive: false });
    await sleep(600);

    expect(events).toHaveLength(0);
  }, 10_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/watcher`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/watcher.ts`:
```ts
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import type { IncomingFile, WatchConfig } from './types';

export interface WatcherOptions {
  stabilityThreshold?: number;
  pollInterval?: number;
}

export class FolderWatcher {
  private watchers: FSWatcher[] = [];

  constructor(
    private onFile: (watchNodeId: string, file: IncomingFile) => void,
    private options: WatcherOptions = {},
  ) {}

  watch(nodeId: string, cfg: WatchConfig): void {
    const w = watch(cfg.path, {
      ignoreInitial: true,
      depth: cfg.recursive ? undefined : 0,
      awaitWriteFinish: {
        stabilityThreshold: this.options.stabilityThreshold ?? 1500,
        pollInterval: this.options.pollInterval ?? 100,
      },
    });
    w.on('add', async (path: string) => {
      try {
        const s = await stat(path);
        this.onFile(nodeId, {
          path,
          name: basename(path),
          ext: extname(path).toLowerCase(),
          bytes: s.size,
          mtimeMs: s.mtimeMs,
        });
      } catch {
        // file vanished between event and stat — nothing to do
      }
    });
    this.watchers.push(w);
  }

  async close(): Promise<void> {
    await Promise.all(this.watchers.map((w) => w.close()));
    this.watchers = [];
  }
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './watcher';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: PASS (these tests are timing-based; they have 10s timeouts).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): chokidar folder watcher with write-stability guard"
```

---

### Task 12: Engine orchestrator (integration)

**Files:**
- Create: `packages/engine/src/engine.ts`
- Modify: `packages/engine/src/index.ts` (add `export * from './engine';`)
- Test: `packages/engine/tests/engine.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–11.
- Produces: the engine's public API — the app package (Task 16) talks ONLY to this class:
  ```ts
  class Engine extends EventEmitter {
    constructor(opts: { dataDir: string; classifier?: Classifier; watcherOptions?: WatcherOptions; cooldownMs?: number; now?: () => number });
    start(pipeline: Pipeline): Promise<void>;   // validates, reconciles journal, loads proposals, starts watchers, pings Ollama
    stop(): Promise<void>;
    approve(proposalId: string): Promise<void>; // pending -> approved -> executed | failed
    reject(proposalId: string): Promise<void>;
    undo(journalEntryId: string): Promise<JournalEntry>;
    listProposals(): Proposal[];
    listJournal(): Promise<JournalEntry[]>;
    approvalStreak(moveNodeId: string): number;
  }
  // events: 'proposal'(p), 'executed'(p, entry), 'stuck'(p, message), 'nodeStatus'(nodeId, 'ok'|'warning'|'error', message?)
  ```
  A proposal's journal entry id equals the proposal id (approve passes `proposal.id` as the move's journal id) so the UI can undo an executed proposal directly.

- [ ] **Step 1: Write the failing test**

`packages/engine/tests/engine.test.ts`:
```ts
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Engine } from '../src/engine';
import type { Classifier } from '../src/classify';
import type { Pipeline, Proposal } from '../src/types';

const FAST = { stabilityThreshold: 200, pollInterval: 50 };
let engine: Engine | undefined;

afterEach(async () => {
  await engine?.stop();
  engine = undefined;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup(auto: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'sortflow-engine-'));
  const inbox = join(root, 'inbox');
  const dest = join(root, 'sorted');
  await mkdir(inbox, { recursive: true });
  const pipeline: Pipeline = {
    nodes: [
      { id: 'w1', kind: 'watch', config: { path: inbox, recursive: false }, position: { x: 0, y: 0 } },
      { id: 'f1', kind: 'filter', config: { extensions: ['.txt'] }, position: { x: 0, y: 0 } },
      { id: 'm1', kind: 'move', config: { destination: dest, auto }, position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: 'e1', source: 'w1', sourceHandle: 'out', target: 'f1' },
      { id: 'e2', source: 'f1', sourceHandle: 'match', target: 'm1' },
    ],
  };
  const neverClassify: Classifier = {
    classify: async () => {
      throw new Error('classifier must not be called for this pipeline');
    },
  };
  engine = new Engine({ dataDir: join(root, 'data'), classifier: neverClassify, watcherOptions: FAST });
  return { root, inbox, dest, pipeline, engine };
}

function nextProposal(e: Engine): Promise<Proposal> {
  return new Promise((resolve) => e.once('proposal', resolve));
}

describe('Engine', () => {
  it('rejects an invalid pipeline at start', async () => {
    const { engine, pipeline } = await setup(false);
    const bad: Pipeline = { ...pipeline, edges: [{ id: 'x', source: 'w1', sourceHandle: 'nope', target: 'f1' }] };
    await expect(engine.start(bad)).rejects.toThrow(/invalid pipeline/);
  });

  it('proposes, then approve executes the move and undo restores it', async () => {
    const { inbox, dest, pipeline, engine } = await setup(false);
    await engine.start(pipeline);
    await sleep(300);

    const proposalP = nextProposal(engine);
    await writeFile(join(inbox, 'note.txt'), 'hi');
    const proposal = await proposalP;

    expect(proposal.status).toBe('pending');
    expect(proposal.destDir).toBe(dest);
    expect(proposal.routeNodeIds).toEqual(['w1', 'f1', 'm1']);
    expect(existsSync(join(inbox, 'note.txt'))).toBe(true); // review-first: not moved yet

    await engine.approve(proposal.id);
    expect(existsSync(join(dest, 'note.txt'))).toBe(true);
    expect(engine.listProposals()[0].status).toBe('executed');

    await engine.undo(proposal.id);
    expect(existsSync(join(inbox, 'note.txt'))).toBe(true);
  }, 15_000);

  it('auto move nodes execute without approval and emit executed', async () => {
    const { inbox, dest, pipeline, engine } = await setup(true);
    await engine.start(pipeline);
    await sleep(300);

    const executed = new Promise<void>((resolve) => engine.once('executed', () => resolve()));
    await writeFile(join(inbox, 'auto.txt'), 'zoom');
    await executed;

    expect(existsSync(join(dest, 'auto.txt'))).toBe(true);
    expect(engine.listProposals()[0].status).toBe('executed');
  }, 15_000);

  it('non-matching files dead-end untouched', async () => {
    const { inbox, pipeline, engine } = await setup(false);
    await engine.start(pipeline);
    await sleep(300);

    await writeFile(join(inbox, 'photo.jpg'), 'x');
    await sleep(800);

    expect(engine.listProposals()).toHaveLength(0);
    expect(existsSync(join(inbox, 'photo.jpg'))).toBe(true);
  }, 15_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/engine test`
Expected: FAIL — cannot resolve `../src/engine`.

- [ ] **Step 3: Write the implementation**

`packages/engine/src/engine.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OllamaClassifier, type Classifier } from './classify';
import { MoveFailedError, executeMove, undoMove } from './executor';
import { nodeById, validatePipeline } from './graph';
import { Journal } from './journal';
import { expandDestination } from './move';
import { ProposalStore } from './proposals';
import { ClassifyQueue } from './queue';
import { routeFile } from './route';
import { FolderWatcher, type WatcherOptions } from './watcher';
import type { IncomingFile, JournalEntry, MoveConfig, Pipeline, Proposal, WatchConfig } from './types';

export interface EngineOptions {
  dataDir: string;
  classifier?: Classifier;
  watcherOptions?: WatcherOptions;
  cooldownMs?: number;
  now?: () => number;
}

export type NodeStatusLevel = 'ok' | 'warning' | 'error';

export class Engine extends EventEmitter {
  readonly journal: Journal;
  readonly proposalStore: ProposalStore;
  private classifier: Classifier;
  private queue: ClassifyQueue;
  private watcher: FolderWatcher;
  private pipeline: Pipeline = { nodes: [], edges: [] };
  private now: () => number;

  constructor(opts: EngineOptions) {
    super();
    this.now = opts.now ?? Date.now;
    this.journal = new Journal(join(opts.dataDir, 'journal.jsonl'));
    this.proposalStore = new ProposalStore(join(opts.dataDir, 'proposals.json'));
    this.classifier = opts.classifier ?? new OllamaClassifier();
    this.queue = new ClassifyQueue(this.classifier, opts.cooldownMs ?? 2000);
    this.watcher = new FolderWatcher((nodeId, file) => {
      void this.handleFile(nodeId, file);
    }, opts.watcherOptions);
  }

  async start(pipeline: Pipeline): Promise<void> {
    const problems = validatePipeline(pipeline);
    if (problems.length > 0) throw new Error(`invalid pipeline: ${problems.join('; ')}`);
    this.pipeline = pipeline;
    await this.journal.reconcile(this.now());
    await this.proposalStore.load();
    for (const node of pipeline.nodes) {
      if (node.kind === 'watch') this.watcher.watch(node.id, node.config as WatchConfig);
    }
    await this.reportClassifierHealth();
  }

  private async reportClassifierHealth(): Promise<void> {
    const classifyNodes = this.pipeline.nodes.filter((n) => n.kind === 'classify');
    if (classifyNodes.length === 0) return;
    const ok = this.classifier instanceof OllamaClassifier ? await this.classifier.ping() : true;
    for (const node of classifyNodes) {
      this.emit('nodeStatus', node.id, ok ? 'ok' : 'warning', ok ? undefined : 'Ollama unreachable — files will route to unsure');
    }
  }

  async stop(): Promise<void> {
    await this.watcher.close();
  }

  private async handleFile(watchNodeId: string, file: IncomingFile): Promise<void> {
    const route = await routeFile(this.pipeline, watchNodeId, file, (f, cfg) => this.queue.enqueue(f, cfg), this.now());
    if (!route.moveNodeId) return;
    const moveNode = nodeById(this.pipeline, route.moveNodeId);
    if (!moveNode) return;
    const cfg = moveNode.config as MoveConfig;
    const destDir = expandDestination(cfg.destination, {
      category: route.category,
      date: new Date(this.now()),
      ext: file.ext,
      home: homedir(),
    });
    const proposal = await this.proposalStore.add(
      {
        filePath: file.path,
        fileName: file.name,
        destDir,
        moveNodeId: route.moveNodeId,
        routeNodeIds: route.nodePath,
      },
      this.now(),
    );
    this.emit('proposal', proposal);
    if (cfg.auto) await this.approve(proposal.id);
  }

  async approve(proposalId: string): Promise<void> {
    const p = this.proposalStore.get(proposalId);
    if (!p || p.status !== 'pending') return;
    await this.proposalStore.setStatus(proposalId, 'approved');
    try {
      const entry = await executeMove(
        { id: proposalId, from: p.filePath, toDir: p.destDir, moveNodeId: p.moveNodeId },
        this.journal,
        { now: this.now },
      );
      await this.proposalStore.setStatus(proposalId, 'executed');
      this.emit('executed', this.proposalStore.get(proposalId) as Proposal, entry);
    } catch (err) {
      const message = err instanceof MoveFailedError ? err.message : String(err);
      await this.proposalStore.setStatus(proposalId, 'failed', message);
      this.emit('stuck', this.proposalStore.get(proposalId) as Proposal, message);
    }
  }

  async reject(proposalId: string): Promise<void> {
    await this.proposalStore.setStatus(proposalId, 'rejected');
  }

  async undo(journalEntryId: string): Promise<JournalEntry> {
    return undoMove(journalEntryId, this.journal, { now: this.now });
  }

  listProposals(): Proposal[] {
    return this.proposalStore.list();
  }

  async listJournal(): Promise<JournalEntry[]> {
    return [...(await this.journal.latestById()).values()];
  }

  approvalStreak(moveNodeId: string): number {
    return this.proposalStore.approvalStreak(moveNodeId);
  }
}
```

Add to `packages/engine/src/index.ts`:
```ts
export * from './engine';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/engine test`
Expected: ALL engine tests PASS (Tasks 1–12). **The engine is now complete — natural checkpoint.**

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): orchestrator wiring watcher, router, review queue and executor"
```

---

### Task 13: UI scaffold — React Flow canvas, custom nodes, palette, mock bridge

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/vite.config.ts`, `packages/ui/vitest.config.ts`, `packages/ui/index.html`
- Create: `packages/ui/src/main.tsx`, `packages/ui/src/App.tsx`, `packages/ui/src/bridge.ts`, `packages/ui/src/store.ts`, `packages/ui/src/styles.css`
- Create: `packages/ui/src/nodes/WatchNode.tsx`, `packages/ui/src/nodes/FilterNode.tsx`, `packages/ui/src/nodes/ClassifyNode.tsx`, `packages/ui/src/nodes/MoveNode.tsx`, `packages/ui/src/nodes/index.ts`
- Create: `packages/ui/src/panels/Palette.tsx`, `packages/ui/src/test/setup.ts`
- Test: `packages/ui/tests/app.test.tsx`

**Interfaces:**
- Consumes: `import type { Pipeline, Proposal, JournalEntry } from '@sortflow/engine'` (type-only — erased at build, so no Node built-ins leak into the browser bundle).
- Produces:
  - `SortflowApi` in `bridge.ts` — THE contract Task 16's preload must implement exactly:
    ```ts
    interface SortflowApi {
      getPipeline(): Promise<Pipeline>;
      setPipeline(p: Pipeline): Promise<{ problems: string[] }>;
      listProposals(): Promise<Proposal[]>;
      approve(id: string): Promise<void>;
      reject(id: string): Promise<void>;
      listJournal(): Promise<JournalEntry[]>;
      undo(id: string): Promise<void>;
      approvalStreak(moveNodeId: string): Promise<number>;
      onProposal(cb: (p: Proposal) => void): () => void;
      onExecuted(cb: (p: Proposal) => void): () => void;
      onNodeStatus(cb: (nodeId: string, status: string, message?: string) => void): () => void;
    }
    ```
    plus `export const api: SortflowApi` (uses `window.sortflow` when present, else the in-browser mock).
  - `store.ts` zustand store: `{ nodes, edges, selectedId, setSelected, onNodesChange, onEdgesChange, onConnect, addNode(kind), updateConfig(id, config), toPipeline(): Pipeline, loadPipeline(p): void }`. Flow nodes carry `data: { kind, config }`; flow node/edge ids map 1:1 to pipeline ids; the flow edge's `sourceHandle` maps to the pipeline edge's `sourceHandle`.
  - Custom node components registered as `nodeTypes = { watch: WatchNode, filter: FilterNode, classify: ClassifyNode, move: MoveNode }`. FilterNode has source handles `match`/`else`; ClassifyNode renders one source handle per category plus `unsure`; MoveNode has only a target handle.

- [ ] **Step 1: Create the package config files**

`packages/ui/package.json`:
```json
{
  "name": "@sortflow/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@xyflow/react": "^12.4.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@sortflow/engine": "workspace:*",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^6.0.0",
    "vitest": "^3.2.0"
  }
}
```

`packages/ui/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "tests"]
}
```

`packages/ui/vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
});
```

`packages/ui/vitest.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`packages/ui/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sortflow</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/ui/src/test/setup.ts` (the full mock set @xyflow/react needs under jsdom):
```ts
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

class DOMMatrixReadOnlyStub {
  m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([0-9.]+)\)/)?.[1];
    this.m22 = scale !== undefined ? +scale : 1;
  }
}
(globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnlyStub;

Object.defineProperties(globalThis.HTMLElement.prototype, {
  offsetHeight: { get: () => 60, configurable: true },
  offsetWidth: { get: () => 180, configurable: true },
});

(globalThis.SVGElement.prototype as unknown as { getBBox: () => object }).getBBox = () => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
});
```

- [ ] **Step 2: Write the failing test**

`packages/ui/tests/app.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { useFlowStore } from '../src/store';
import type { Pipeline } from '@sortflow/engine';

const demo: Pipeline = {
  nodes: [
    { id: 'w1', kind: 'watch', config: { path: '~/Downloads', recursive: false }, position: { x: 0, y: 0 } },
    { id: 'f1', kind: 'filter', config: { extensions: ['.png'] }, position: { x: 250, y: 0 } },
    { id: 'm1', kind: 'move', config: { destination: '~/Pictures/Screenshots', auto: false }, position: { x: 500, y: 0 } },
  ],
  edges: [
    { id: 'e1', source: 'w1', sourceHandle: 'out', target: 'f1' },
    { id: 'e2', source: 'f1', sourceHandle: 'match', target: 'm1' },
  ],
};

describe('App', () => {
  it('renders the palette and the loaded pipeline nodes', async () => {
    useFlowStore.getState().loadPipeline(demo);
    render(<App />);
    expect(await screen.findByText('📥 Watch')).toBeTruthy();
    expect(screen.getByText('~/Downloads')).toBeTruthy();
    expect(screen.getByText('~/Pictures/Screenshots')).toBeTruthy();
    expect(screen.getByRole('button', { name: /add watch/i })).toBeTruthy();
  });

  it('store round-trips pipeline JSON', () => {
    useFlowStore.getState().loadPipeline(demo);
    const out = useFlowStore.getState().toPipeline();
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['f1', 'm1', 'w1']);
    expect(out.edges).toHaveLength(2);
    expect(out.edges.find((e) => e.id === 'e2')?.sourceHandle).toBe('match');
  });

  it('addNode appends a node with defaults', () => {
    useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
    useFlowStore.getState().addNode('classify');
    const p = useFlowStore.getState().toPipeline();
    expect(p.nodes).toHaveLength(1);
    expect(p.nodes[0].kind).toBe('classify');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm install && pnpm --filter @sortflow/ui test`
Expected: FAIL — `../src/App` and `../src/store` do not exist.

- [ ] **Step 4: Write the implementation**

`packages/ui/src/bridge.ts`:
```ts
import type { JournalEntry, Pipeline, Proposal } from '@sortflow/engine';

export interface SortflowApi {
  getPipeline(): Promise<Pipeline>;
  setPipeline(p: Pipeline): Promise<{ problems: string[] }>;
  listProposals(): Promise<Proposal[]>;
  approve(id: string): Promise<void>;
  reject(id: string): Promise<void>;
  listJournal(): Promise<JournalEntry[]>;
  undo(id: string): Promise<void>;
  approvalStreak(moveNodeId: string): Promise<number>;
  onProposal(cb: (p: Proposal) => void): () => void;
  onExecuted(cb: (p: Proposal) => void): () => void;
  onNodeStatus(cb: (nodeId: string, status: string, message?: string) => void): () => void;
}

const EMPTY: Pipeline = { nodes: [], edges: [] };

/** Browser-only mock so `pnpm --filter @sortflow/ui dev` works without Electron. */
function createMockApi(): SortflowApi {
  let proposals: Proposal[] = [
    {
      id: 'demo-1',
      filePath: '/Users/you/Downloads/Screenshot 2026-06-30.png',
      fileName: 'Screenshot 2026-06-30.png',
      destDir: '/Users/you/Pictures/Screenshots',
      moveNodeId: 'm1',
      routeNodeIds: ['w1', 'f1', 'm1'],
      createdAt: 1,
      status: 'pending',
    },
  ];
  const executedCbs = new Set<(p: Proposal) => void>();
  return {
    async getPipeline() {
      const raw = localStorage.getItem('sortflow-pipeline');
      return raw ? (JSON.parse(raw) as Pipeline) : EMPTY;
    },
    async setPipeline(p) {
      localStorage.setItem('sortflow-pipeline', JSON.stringify(p));
      return { problems: [] };
    },
    async listProposals() {
      return proposals;
    },
    async approve(id) {
      proposals = proposals.map((p) => (p.id === id ? { ...p, status: 'executed' as const } : p));
      const executed = proposals.find((p) => p.id === id);
      if (executed) for (const cb of executedCbs) cb(executed);
    },
    async reject(id) {
      proposals = proposals.map((p) => (p.id === id ? { ...p, status: 'rejected' as const } : p));
    },
    async listJournal() {
      return [];
    },
    async undo() {},
    async approvalStreak() {
      return 0;
    },
    onProposal() {
      return () => {};
    },
    onExecuted(cb) {
      executedCbs.add(cb);
      return () => executedCbs.delete(cb);
    },
    onNodeStatus() {
      return () => {};
    },
  };
}

declare global {
  interface Window {
    sortflow?: SortflowApi;
  }
}

export const api: SortflowApi = typeof window !== 'undefined' && window.sortflow ? window.sortflow : createMockApi();
```

`packages/ui/src/store.ts`:
```ts
import type { Pipeline, PipelineNode, NodeKind, NodeConfig } from '@sortflow/engine';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { create } from 'zustand';

export type FlowNodeData = { kind: NodeKind; config: NodeConfig; status?: string; statusMessage?: string };
export type FlowNode = Node<FlowNodeData>;

const DEFAULT_CONFIGS: Record<NodeKind, NodeConfig> = {
  watch: { path: '~/Downloads', recursive: false },
  filter: { extensions: [] },
  classify: { categories: ['Documents', 'Images'], model: 'llama3.2:3b' },
  move: { destination: '~/Documents/Sorted/{category}', auto: false },
};

interface FlowState {
  nodes: FlowNode[];
  edges: Edge[];
  selectedId: string | null;
  setSelected(id: string | null): void;
  onNodesChange(changes: NodeChange<FlowNode>[]): void;
  onEdgesChange(changes: EdgeChange[]): void;
  onConnect(c: Connection): void;
  addNode(kind: NodeKind): void;
  updateConfig(id: string, config: NodeConfig): void;
  setNodeStatus(id: string, status: string, message?: string): void;
  animatePath(nodeIds: string[]): void;
  loadPipeline(p: Pipeline): void;
  toPipeline(): Pipeline;
}

let nextId = 1;
const genId = () => `n${Date.now().toString(36)}${nextId++}`;

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedId: null,
  setSelected: (id) => set({ selectedId: id }),
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (c) =>
    set({
      edges: [
        ...get().edges,
        {
          id: genId(),
          source: c.source,
          sourceHandle: c.sourceHandle ?? 'out',
          target: c.target,
        },
      ],
    }),
  addNode: (kind) =>
    set({
      nodes: [
        ...get().nodes,
        {
          id: genId(),
          type: kind,
          position: { x: 120 + get().nodes.length * 40, y: 120 + get().nodes.length * 30 },
          data: { kind, config: structuredClone(DEFAULT_CONFIGS[kind]) },
        },
      ],
    }),
  updateConfig: (id, config) =>
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, config } } : n)),
    }),
  setNodeStatus: (id, status, message) =>
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, status, statusMessage: message } } : n)),
    }),
  animatePath: (nodeIds) => {
    const onPath = (e: Edge) => nodeIds.includes(e.source) && nodeIds.includes(e.target);
    set({ edges: get().edges.map((e) => (onPath(e) ? { ...e, animated: true } : e)) });
    setTimeout(() => {
      set({ edges: get().edges.map((e) => (onPath(e) ? { ...e, animated: false } : e)) });
    }, 3000);
  },
  loadPipeline: (p) =>
    set({
      nodes: p.nodes.map((n) => ({
        id: n.id,
        type: n.kind,
        position: n.position,
        data: { kind: n.kind, config: n.config },
      })),
      edges: p.edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
      })),
      selectedId: null,
    }),
  toPipeline: (): Pipeline => ({
    nodes: get().nodes.map(
      (n): PipelineNode => ({
        id: n.id,
        kind: n.data.kind,
        config: n.data.config,
        position: { x: n.position.x, y: n.position.y },
      }),
    ),
    edges: get().edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? 'out',
      target: e.target,
    })),
  }),
}));
```

`packages/ui/src/nodes/WatchNode.tsx`:
```tsx
import type { WatchConfig } from '@sortflow/engine';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNode } from '../store';

export function WatchNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as WatchConfig;
  return (
    <div className="sf-node sf-node-watch">
      <div className="sf-node-title">📥 Watch</div>
      <div className="sf-node-body">{cfg.path}</div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}
```

`packages/ui/src/nodes/FilterNode.tsx`:
```tsx
import type { FilterConfig } from '@sortflow/engine';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNode } from '../store';

export function FilterNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as FilterConfig;
  const summary = [
    cfg.extensions?.length ? cfg.extensions.join(' ') : null,
    cfg.namePattern ?? null,
  ]
    .filter(Boolean)
    .join(' · ') || 'any file';
  return (
    <div className="sf-node sf-node-filter">
      <Handle type="target" position={Position.Left} />
      <div className="sf-node-title">🔍 Filter</div>
      <div className="sf-node-body">{summary}</div>
      <div className="sf-handle-row">
        <span>match</span>
        <Handle type="source" position={Position.Right} id="match" style={{ top: '55%' }} />
      </div>
      <div className="sf-handle-row">
        <span>else</span>
        <Handle type="source" position={Position.Right} id="else" style={{ top: '80%' }} />
      </div>
    </div>
  );
}
```

`packages/ui/src/nodes/ClassifyNode.tsx`:
```tsx
import type { ClassifyConfig } from '@sortflow/engine';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNode } from '../store';

export function ClassifyNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as ClassifyConfig;
  const handles = [...cfg.categories, 'unsure'];
  return (
    <div className="sf-node sf-node-classify">
      <Handle type="target" position={Position.Left} />
      <div className="sf-node-title">
        🤖 AI Classify {data.status === 'warning' && <span title={data.statusMessage}>⚠️</span>}
      </div>
      <div className="sf-node-body">{cfg.model}</div>
      {handles.map((h, i) => (
        <div className="sf-handle-row" key={h}>
          <span>{h}</span>
          <Handle
            type="source"
            position={Position.Right}
            id={h}
            style={{ top: `${40 + ((i + 1) * 50) / (handles.length + 1)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
```

`packages/ui/src/nodes/MoveNode.tsx`:
```tsx
import type { MoveConfig } from '@sortflow/engine';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNode } from '../store';

export function MoveNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as MoveConfig;
  return (
    <div className="sf-node sf-node-move">
      <Handle type="target" position={Position.Left} />
      <div className="sf-node-title">📁 Move {cfg.auto ? <span className="sf-badge">auto</span> : null}</div>
      <div className="sf-node-body">{cfg.destination}</div>
    </div>
  );
}
```

`packages/ui/src/nodes/index.ts`:
```ts
import { ClassifyNode } from './ClassifyNode';
import { FilterNode } from './FilterNode';
import { MoveNode } from './MoveNode';
import { WatchNode } from './WatchNode';

export const nodeTypes = {
  watch: WatchNode,
  filter: FilterNode,
  classify: ClassifyNode,
  move: MoveNode,
};
```

`packages/ui/src/panels/Palette.tsx`:
```tsx
import type { NodeKind } from '@sortflow/engine';
import { useFlowStore } from '../store';

const KINDS: Array<{ kind: NodeKind; label: string }> = [
  { kind: 'watch', label: 'Add Watch' },
  { kind: 'filter', label: 'Add Filter' },
  { kind: 'classify', label: 'Add AI Classify' },
  { kind: 'move', label: 'Add Move' },
];

export function Palette() {
  const addNode = useFlowStore((s) => s.addNode);
  return (
    <div className="sf-palette">
      {KINDS.map(({ kind, label }) => (
        <button key={kind} type="button" onClick={() => addNode(kind)}>
          {label}
        </button>
      ))}
    </div>
  );
}
```

`packages/ui/src/App.tsx`:
```tsx
import { Background, Controls, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './nodes';
import { Palette } from './panels/Palette';
import { useFlowStore } from './store';
import './styles.css';

export default function App() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const setSelected = useFlowStore((s) => s.setSelected);

  return (
    <div className="sf-app">
      <Palette />
      <div className="sf-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={(sel) => setSelected(sel.nodes[0]?.id ?? null)}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
```

`packages/ui/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { api } from './bridge';
import { useFlowStore } from './store';

async function boot() {
  const pipeline = await api.getPipeline();
  useFlowStore.getState().loadPipeline(pipeline);
  const root = document.getElementById('root');
  if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
}

void boot();
```

`packages/ui/src/styles.css`:
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.sf-app { display: flex; height: 100vh; }
.sf-canvas { flex: 1; }
.sf-palette { width: 160px; padding: 12px; display: flex; flex-direction: column; gap: 8px; border-right: 1px solid #e2e2e8; background: #fafafc; }
.sf-palette button { padding: 8px; border: 1px solid #d0d0d8; border-radius: 8px; background: #fff; cursor: pointer; }
.sf-node { border: 1px solid #c9c9d4; border-radius: 10px; background: #fff; min-width: 170px; font-size: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
.sf-node-title { padding: 6px 10px; font-weight: 600; border-bottom: 1px solid #eee; }
.sf-node-body { padding: 6px 10px; color: #555; word-break: break-all; }
.sf-handle-row { position: relative; padding: 2px 10px; text-align: right; color: #888; font-size: 10px; }
.sf-badge { background: #16a34a; color: #fff; border-radius: 6px; padding: 1px 6px; font-size: 10px; margin-left: 6px; }
.sf-node-watch .sf-node-title { background: #eef6ff; }
.sf-node-filter .sf-node-title { background: #fff7ed; }
.sf-node-classify .sf-node-title { background: #f5f3ff; }
.sf-node-move .sf-node-title { background: #ecfdf5; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @sortflow/ui test`
Expected: PASS (3 tests).

Also verify visually: `pnpm --filter @sortflow/ui dev`, open http://localhost:5173 — palette on the left; clicking "Add Watch" drops a node; nodes connect by dragging handles.

- [ ] **Step 6: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): React Flow canvas with custom pipeline nodes and palette"
```

---

### Task 14: Config panel + Save pipeline

**Files:**
- Create: `packages/ui/src/panels/ConfigPanel.tsx`
- Modify: `packages/ui/src/App.tsx` (render `<ConfigPanel />` after the canvas div)
- Test: `packages/ui/tests/config-panel.test.tsx`

**Interfaces:**
- Consumes: `useFlowStore` (`selectedId`, `nodes`, `updateConfig`, `toPipeline`), `api.setPipeline` (Task 13).
- Produces: a right-hand panel that edits the selected node's config and a **Save & Apply** button that calls `api.setPipeline(toPipeline())` and shows returned `problems` (if any) in a `<div className="sf-problems">`. Field-to-config mapping: watch → `path` (text), `recursive` (checkbox); filter → `extensions` (comma-separated text ↔ string[]), `namePattern` (text), `regex` (checkbox); classify → `categories` (comma-separated), `model` (text); move → `destination` (text), `auto` (checkbox).

- [ ] **Step 1: Write the failing test**

`packages/ui/tests/config-panel.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfigPanel } from '../src/panels/ConfigPanel';
import { useFlowStore } from '../src/store';
import type { MoveConfig, Pipeline } from '@sortflow/engine';

const demo: Pipeline = {
  nodes: [{ id: 'm1', kind: 'move', config: { destination: '~/Docs', auto: false }, position: { x: 0, y: 0 } }],
  edges: [],
};

describe('ConfigPanel', () => {
  it('shows a hint when nothing is selected', () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected(null);
    render(<ConfigPanel />);
    expect(screen.getByText(/select a node/i)).toBeTruthy();
  });

  it('edits the selected move node config', () => {
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected('m1');
    render(<ConfigPanel />);
    const dest = screen.getByLabelText(/destination/i) as HTMLInputElement;
    expect(dest.value).toBe('~/Docs');
    fireEvent.change(dest, { target: { value: '~/Sorted/{category}' } });
    const cfg = useFlowStore.getState().toPipeline().nodes[0].config as MoveConfig;
    expect(cfg.destination).toBe('~/Sorted/{category}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/ui test`
Expected: FAIL — `../src/panels/ConfigPanel` does not exist.

- [ ] **Step 3: Write the implementation**

`packages/ui/src/panels/ConfigPanel.tsx`:
```tsx
import type { ClassifyConfig, FilterConfig, MoveConfig, NodeConfig, WatchConfig } from '@sortflow/engine';
import { useState } from 'react';
import { api } from '../bridge';
import { useFlowStore } from '../store';

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = `sf-field-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <label htmlFor={id} className="sf-field">
      {label}
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const id = `sf-field-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <label htmlFor={id} className="sf-field sf-field-check">
      <input id={id} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function ConfigPanel() {
  const selectedId = useFlowStore((s) => s.selectedId);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const updateConfig = useFlowStore((s) => s.updateConfig);
  const toPipeline = useFlowStore((s) => s.toPipeline);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const result = await api.setPipeline(toPipeline());
    setProblems(result.problems);
    setSaved(result.problems.length === 0);
  };

  const set = (config: NodeConfig) => selectedId && updateConfig(selectedId, config);

  return (
    <div className="sf-config">
      <h3>Node settings</h3>
      {!node && <p>Select a node to edit it.</p>}
      {node?.data.kind === 'watch' && (() => {
        const c = node.data.config as WatchConfig;
        return (
          <>
            <TextField label="Folder path" value={c.path} onChange={(v) => set({ ...c, path: v })} />
            <CheckField label="Include subfolders" value={c.recursive} onChange={(v) => set({ ...c, recursive: v })} />
          </>
        );
      })()}
      {node?.data.kind === 'filter' && (() => {
        const c = node.data.config as FilterConfig;
        return (
          <>
            <TextField
              label="Extensions (comma-separated)"
              value={(c.extensions ?? []).join(', ')}
              onChange={(v) => set({ ...c, extensions: v.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
            <TextField label="Name pattern" value={c.namePattern ?? ''} onChange={(v) => set({ ...c, namePattern: v || undefined })} />
            <CheckField label="Pattern is regex" value={c.regex ?? false} onChange={(v) => set({ ...c, regex: v })} />
          </>
        );
      })()}
      {node?.data.kind === 'classify' && (() => {
        const c = node.data.config as ClassifyConfig;
        return (
          <>
            <TextField
              label="Categories (comma-separated)"
              value={c.categories.join(', ')}
              onChange={(v) => set({ ...c, categories: v.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
            <TextField label="Ollama model" value={c.model} onChange={(v) => set({ ...c, model: v })} />
          </>
        );
      })()}
      {node?.data.kind === 'move' && (() => {
        const c = node.data.config as MoveConfig;
        return (
          <>
            <TextField label="Destination" value={c.destination} onChange={(v) => set({ ...c, destination: v })} />
            <CheckField label="Automatic (skip review)" value={c.auto} onChange={(v) => set({ ...c, auto: v })} />
          </>
        );
      })()}
      <button type="button" className="sf-save" onClick={() => void save()}>
        Save &amp; Apply
      </button>
      {saved && problems.length === 0 && <p className="sf-saved">Pipeline applied ✓</p>}
      {problems.length > 0 && (
        <div className="sf-problems">
          {problems.map((p) => (
            <p key={p}>⚠ {p}</p>
          ))}
        </div>
      )}
    </div>
  );
}
```

In `packages/ui/src/App.tsx`, import and render it (after the canvas `div`, inside `.sf-app`):
```tsx
import { ConfigPanel } from './panels/ConfigPanel';
// ... inside the return, after </div> of sf-canvas:
      <ConfigPanel />
```

Append to `packages/ui/src/styles.css`:
```css
.sf-config { width: 240px; border-left: 1px solid #e2e2e8; padding: 12px; background: #fafafc; overflow-y: auto; }
.sf-field { display: block; margin-bottom: 10px; font-size: 12px; color: #444; }
.sf-field input:not([type='checkbox']) { width: 100%; margin-top: 4px; padding: 6px; border: 1px solid #d0d0d8; border-radius: 6px; }
.sf-field-check input { margin-right: 6px; }
.sf-save { width: 100%; padding: 8px; border: none; border-radius: 8px; background: #2563eb; color: #fff; cursor: pointer; }
.sf-saved { color: #16a34a; font-size: 12px; }
.sf-problems { color: #b45309; font-size: 12px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/ui test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): node config panel with save and validation feedback"
```

---

### Task 15: Review tray + history panel

**Files:**
- Create: `packages/ui/src/panels/ReviewTray.tsx`, `packages/ui/src/panels/HistoryPanel.tsx`
- Modify: `packages/ui/src/App.tsx` (bottom dock rendering both panels)
- Test: `packages/ui/tests/review-tray.test.tsx`

**Interfaces:**
- Consumes: `api` (Task 13): `listProposals`, `approve`, `reject`, `onProposal`, `onExecuted`, `listJournal`, `undo`; `useFlowStore.animatePath`.
- Produces: `ReviewTray` — lists pending proposals as "fileName → destDir" rows with Approve / Reject buttons and an **Approve all** button; refreshes on `onProposal`/`onExecuted`; calls `useFlowStore.getState().animatePath(p.routeNodeIds)` when a proposal executes. `HistoryPanel` — lists journal entries (`done` ones get an Undo button). Both poll-free: initial load + event-driven refresh.

- [ ] **Step 1: Write the failing test**

`packages/ui/tests/review-tray.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewTray } from '../src/panels/ReviewTray';
import { api } from '../src/bridge';

describe('ReviewTray', () => {
  it('lists pending proposals and approves on click', async () => {
    render(<ReviewTray />);
    await waitFor(() => expect(screen.getByText(/Screenshot 2026-06-30\.png/)).toBeTruthy());
    const approveSpy = vi.spyOn(api, 'approve');
    fireEvent.click(screen.getAllByRole('button', { name: /^approve$/i })[0]);
    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith('demo-1'));
  });
});
```

(The mock bridge from Task 13 seeds proposal `demo-1`, so this test runs without Electron.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/ui test`
Expected: FAIL — `../src/panels/ReviewTray` does not exist.

- [ ] **Step 3: Write the implementation**

`packages/ui/src/panels/ReviewTray.tsx`:
```tsx
import type { Proposal } from '@sortflow/engine';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../bridge';
import { useFlowStore } from '../store';

export function ReviewTray() {
  const [proposals, setProposals] = useState<Proposal[]>([]);

  const refresh = useCallback(async () => {
    setProposals(await api.listProposals());
  }, []);

  useEffect(() => {
    void refresh();
    const offProposal = api.onProposal(() => void refresh());
    const offExecuted = api.onExecuted((p) => {
      useFlowStore.getState().animatePath(p.routeNodeIds);
      void refresh();
    });
    return () => {
      offProposal();
      offExecuted();
    };
  }, [refresh]);

  const pending = proposals.filter((p) => p.status === 'pending');

  return (
    <div className="sf-tray">
      <h3>
        Review {pending.length > 0 && <span className="sf-count">{pending.length}</span>}
      </h3>
      {pending.length === 0 && <p className="sf-empty">Nothing waiting for review.</p>}
      {pending.length > 1 && (
        <button
          type="button"
          onClick={() => {
            for (const p of pending) void api.approve(p.id).then(() => refresh());
          }}
        >
          Approve all ({pending.length})
        </button>
      )}
      <ul>
        {pending.map((p) => (
          <li key={p.id}>
            <span className="sf-proposal">
              {p.fileName} → {p.destDir}
            </span>
            <button type="button" onClick={() => void api.approve(p.id).then(() => refresh())}>
              Approve
            </button>
            <button type="button" onClick={() => void api.reject(p.id).then(() => refresh())}>
              Reject
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`packages/ui/src/panels/HistoryPanel.tsx`:
```tsx
import type { JournalEntry, Proposal } from '@sortflow/engine';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../bridge';

export function HistoryPanel() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  const refresh = useCallback(async () => {
    const all = await api.listJournal();
    setEntries(all.sort((a, b) => b.ts - a.ts));
  }, []);

  useEffect(() => {
    void refresh();
    return api.onExecuted((_p: Proposal) => void refresh());
  }, [refresh]);

  return (
    <div className="sf-history">
      <h3>History</h3>
      {entries.length === 0 && <p className="sf-empty">No moves yet.</p>}
      <ul>
        {entries.slice(0, 50).map((e) => (
          <li key={e.id}>
            <span className={`sf-status sf-status-${e.status}`}>{e.status}</span>
            <span className="sf-proposal">
              {e.from} → {e.to}
            </span>
            {e.status === 'done' && (
              <button type="button" onClick={() => void api.undo(e.id).then(() => refresh())}>
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

In `packages/ui/src/App.tsx`, wrap the existing layout so the trays dock at the bottom:
```tsx
import { HistoryPanel } from './panels/HistoryPanel';
import { ReviewTray } from './panels/ReviewTray';
// replace the return with:
  return (
    <div className="sf-shell">
      <div className="sf-app">
        <Palette />
        <div className="sf-canvas">{/* ReactFlow unchanged */}</div>
        <ConfigPanel />
      </div>
      <div className="sf-dock">
        <ReviewTray />
        <HistoryPanel />
      </div>
    </div>
  );
```

Append to `packages/ui/src/styles.css`:
```css
.sf-shell { display: flex; flex-direction: column; height: 100vh; }
.sf-shell .sf-app { flex: 1; min-height: 0; }
.sf-dock { display: flex; height: 180px; border-top: 1px solid #e2e2e8; background: #fff; }
.sf-tray, .sf-history { flex: 1; overflow-y: auto; padding: 8px 12px; font-size: 12px; }
.sf-tray { border-right: 1px solid #e2e2e8; }
.sf-tray ul, .sf-history ul { list-style: none; margin: 0; padding: 0; }
.sf-tray li, .sf-history li { display: flex; gap: 8px; align-items: center; padding: 4px 0; }
.sf-proposal { flex: 1; word-break: break-all; }
.sf-count { background: #dc2626; color: #fff; border-radius: 10px; padding: 0 8px; font-size: 11px; }
.sf-empty { color: #999; }
.sf-status { border-radius: 6px; padding: 1px 6px; font-size: 10px; background: #eee; }
.sf-status-done { background: #dcfce7; }
.sf-status-failed { background: #fee2e2; }
.sf-status-undone { background: #fef9c3; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/ui test`
Expected: PASS. **UI now works standalone — checkpoint.** Verify with `pnpm --filter @sortflow/ui dev`: the demo proposal shows in the tray; approving it animates edges (once a matching pipeline is drawn) and empties the tray.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): review tray and history panel with undo"
```

---

### Task 16: Electron app — main process, typed IPC, preload bridge

**Files:**
- Create: `packages/app/package.json`, `packages/app/tsconfig.json`
- Create: `packages/app/src/main.ts`, `packages/app/src/ipc.ts`, `packages/app/src/preload.ts`
- Test: manual smoke (Electron main-process logic is thin glue; the engine behind it is fully tested)

**Interfaces:**
- Consumes: `Engine` (Task 12), `validatePipeline`, `Pipeline` types; implements `SortflowApi` (Task 13) EXACTLY, channel names below.
- Produces: IPC channels — invoke: `pipeline:get`, `pipeline:set`, `proposals:list`, `proposals:approve`, `proposals:reject`, `journal:list`, `journal:undo`, `streak:get`; push (main → renderer): `engine:proposal`, `engine:executed`, `engine:nodeStatus`. Pipeline persisted at `join(app.getPath('userData'), 'pipeline.json')`; engine `dataDir` = `app.getPath('userData')`. Task 18 adds the tray to this main process.

- [ ] **Step 1: Create the package**

`packages/app/package.json`:
```json
{
  "name": "@sortflow/app",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main.cjs",
  "scripts": {
    "build": "tsup src/main.ts src/preload.ts --format cjs --external electron --out-dir dist",
    "dev": "pnpm build && SORTFLOW_DEV=1 electron .",
    "test": "echo 'app: covered by engine tests + manual smoke'"
  },
  "dependencies": {
    "@sortflow/engine": "workspace:*"
  },
  "devDependencies": {
    "electron": "^37.0.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.3"
  }
}
```

Note: tsup emits `main.cjs`/`preload.cjs` for `.ts` entries with `--format cjs`.

`packages/app/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the main process**

`packages/app/src/main.ts`:
```ts
import { join } from 'node:path';
import { Engine, type Pipeline } from '@sortflow/engine';
import { BrowserWindow, app } from 'electron';
import { loadPipeline, registerIpc } from './ipc';

let win: BrowserWindow | null = null;
let updateBadge: (count: number) => void = () => {}; // becomes the tray badge in Task 18

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Sortflow',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.SORTFLOW_DEV) {
    void w.loadURL('http://localhost:5173');
  } else {
    void w.loadFile(join(process.resourcesPath, 'ui', 'index.html'));
  }
  return w;
}

app.whenReady().then(async () => {
  const dataDir = app.getPath('userData');
  const engine = new Engine({ dataDir });
  const pipeline: Pipeline = await loadPipeline(dataDir);
  registerIpc(engine, dataDir, () => win, (count) => updateBadge(count));
  try {
    await engine.start(pipeline);
  } catch (err) {
    console.error('engine failed to start with saved pipeline:', err);
  }
  win = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
  });
});

// Keep running in the background when the window closes (tray app; Task 18 adds the tray icon).
app.on('window-all-closed', () => {
  /* do not quit */
});
```

`packages/app/src/ipc.ts`:
```ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Engine, validatePipeline, type Pipeline } from '@sortflow/engine';
import { type BrowserWindow, ipcMain } from 'electron';

const EMPTY: Pipeline = { nodes: [], edges: [] };

export async function loadPipeline(dataDir: string): Promise<Pipeline> {
  try {
    return JSON.parse(await readFile(join(dataDir, 'pipeline.json'), 'utf8')) as Pipeline;
  } catch {
    return EMPTY;
  }
}

export function registerIpc(
  engine: Engine,
  dataDir: string,
  getWin: () => BrowserWindow | null,
  onPending: (count: number) => void = () => {},
): void {
  let current = engine;

  const pendingCount = () => current.listProposals().filter((p) => p.status === 'pending').length;
  const send = (channel: string, ...args: unknown[]) => getWin()?.webContents.send(channel, ...args);
  const wire = (e: Engine) => {
    e.on('proposal', (p) => {
      send('engine:proposal', p);
      onPending(pendingCount());
    });
    e.on('executed', (p) => {
      send('engine:executed', p);
      onPending(pendingCount());
    });
    e.on('nodeStatus', (nodeId, status, message) => send('engine:nodeStatus', nodeId, status, message));
  };
  wire(current);

  ipcMain.handle('pipeline:get', () => loadPipeline(dataDir));

  ipcMain.handle('pipeline:set', async (_evt, pipeline: Pipeline) => {
    const problems = validatePipeline(pipeline);
    if (problems.length > 0) return { problems };
    await writeFile(join(dataDir, 'pipeline.json'), JSON.stringify(pipeline, null, 2), 'utf8');
    await current.stop();
    current = new Engine({ dataDir });
    wire(current);
    await current.start(pipeline);
    return { problems: [] };
  });

  ipcMain.handle('proposals:list', () => current.listProposals());
  ipcMain.handle('proposals:approve', async (_evt, id: string) => {
    await current.approve(id);
    onPending(pendingCount());
  });
  ipcMain.handle('proposals:reject', async (_evt, id: string) => {
    await current.reject(id);
    onPending(pendingCount());
  });
  ipcMain.handle('journal:list', () => current.listJournal());
  ipcMain.handle('journal:undo', (_evt, id: string) => current.undo(id));
  ipcMain.handle('streak:get', (_evt, moveNodeId: string) => current.approvalStreak(moveNodeId));
}
```

`packages/app/src/preload.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron';

function subscribe(channel: string) {
  return (cb: (...args: unknown[]) => void) => {
    const listener = (_evt: unknown, ...args: unknown[]) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

// Must implement packages/ui/src/bridge.ts SortflowApi exactly.
contextBridge.exposeInMainWorld('sortflow', {
  getPipeline: () => ipcRenderer.invoke('pipeline:get'),
  setPipeline: (p: unknown) => ipcRenderer.invoke('pipeline:set', p),
  listProposals: () => ipcRenderer.invoke('proposals:list'),
  approve: (id: string) => ipcRenderer.invoke('proposals:approve', id),
  reject: (id: string) => ipcRenderer.invoke('proposals:reject', id),
  listJournal: () => ipcRenderer.invoke('journal:list'),
  undo: (id: string) => ipcRenderer.invoke('journal:undo', id),
  approvalStreak: (moveNodeId: string) => ipcRenderer.invoke('streak:get', moveNodeId),
  onProposal: (cb: (p: unknown) => void) => subscribe('engine:proposal')(cb as never),
  onExecuted: (cb: (p: unknown) => void) => subscribe('engine:executed')(cb as never),
  onNodeStatus: (cb: (...a: unknown[]) => void) => subscribe('engine:nodeStatus')(cb as never),
});
```

- [ ] **Step 3: Manual smoke test**

Run in one terminal: `pnpm --filter @sortflow/ui dev`
Run in another: `pnpm --filter @sortflow/app dev`

Expected, in the Electron window:
1. Build a pipeline: Watch `~/Downloads` → Filter `.png` (match) → Move `~/Desktop/SortflowTest`; click **Save & Apply** → "Pipeline applied ✓".
2. Save any `.png` into `~/Downloads` → within ~2s it appears in the Review tray.
3. Approve → file lands in `~/Desktop/SortflowTest`, History shows `done`.
4. Undo → file returns to `~/Downloads`.
5. Quit Ollama (if installed) — nothing crashes; classify nodes badge ⚠ on next Save & Apply.

- [ ] **Step 4: Commit**

```bash
git add packages/app pnpm-lock.yaml
git commit -m "feat(app): Electron shell with typed IPC bridging engine and UI"
```

---

### Task 17: Node status badges + promotion offer

**Files:**
- Modify: `packages/ui/src/main.tsx` (subscribe to node status), `packages/ui/src/panels/ConfigPanel.tsx` (promotion section)
- Test: `packages/ui/tests/promotion.test.tsx`

**Interfaces:**
- Consumes: `api.onNodeStatus`, `api.approvalStreak` (Task 13), `useFlowStore.setNodeStatus` (Task 13), ClassifyNode's `data.status` rendering (Task 13).
- Produces: warning badges live on classify nodes; move-node config shows "Approved N in a row" and a **Make automatic** button when `N >= 10` and `auto` is false. Threshold constant: `PROMOTION_THRESHOLD = 10` exported from `ConfigPanel.tsx`.

- [ ] **Step 1: Write the failing test**

`packages/ui/tests/promotion.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../src/bridge';
import { ConfigPanel } from '../src/panels/ConfigPanel';
import { useFlowStore } from '../src/store';
import type { Pipeline } from '@sortflow/engine';

const demo: Pipeline = {
  nodes: [{ id: 'm1', kind: 'move', config: { destination: '~/Docs', auto: false }, position: { x: 0, y: 0 } }],
  edges: [],
};

describe('promotion offer', () => {
  it('offers Make automatic when the streak reaches the threshold', async () => {
    vi.spyOn(api, 'approvalStreak').mockResolvedValue(12);
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected('m1');
    render(<ConfigPanel />);
    await waitFor(() => expect(screen.getByText(/approved 12 in a row/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /make automatic/i })).toBeTruthy();
  });

  it('does not offer below the threshold', async () => {
    vi.spyOn(api, 'approvalStreak').mockResolvedValue(3);
    useFlowStore.getState().loadPipeline(demo);
    useFlowStore.getState().setSelected('m1');
    render(<ConfigPanel />);
    await waitFor(() => expect(screen.getByText(/approved 3 in a row/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /make automatic/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sortflow/ui test`
Expected: FAIL — no streak text in ConfigPanel yet.

- [ ] **Step 3: Write the implementation**

In `packages/ui/src/panels/ConfigPanel.tsx`, change the existing react import to `import { useEffect, useState } from 'react';` (do not add a second import line) and add below the imports:
```tsx
export const PROMOTION_THRESHOLD = 10;
```

Inside `ConfigPanel`, add state + effect after the existing hooks:
```tsx
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    setStreak(null);
    if (node?.data.kind === 'move' && selectedId) {
      void api.approvalStreak(selectedId).then(setStreak);
    }
  }, [selectedId, node?.data.kind]);
```

Inside the move-node section, after the `Automatic` checkbox, render:
```tsx
            {streak !== null && (
              <p className="sf-streak">
                Approved {streak} in a row
                {streak >= PROMOTION_THRESHOLD && !c.auto && (
                  <button type="button" onClick={() => set({ ...c, auto: true })}>
                    Make automatic
                  </button>
                )}
              </p>
            )}
```

In `packages/ui/src/main.tsx`, after `loadPipeline(pipeline)`, subscribe node status into the store:
```tsx
  api.onNodeStatus((nodeId, status, message) => {
    useFlowStore.getState().setNodeStatus(nodeId, status, message);
  });
```

Append to `packages/ui/src/styles.css`:
```css
.sf-streak { font-size: 12px; color: #555; }
.sf-streak button { margin-left: 8px; padding: 2px 8px; border: 1px solid #16a34a; color: #16a34a; background: #fff; border-radius: 6px; cursor: pointer; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sortflow/ui test`
Expected: PASS (all UI tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): classify warning badges and auto-promotion offer"
```

---

### Task 18: Tray, launch-at-login, packaging, CI, docs

**Files:**
- Create: `packages/app/src/tray.ts`, `packages/app/electron-builder.yml`
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `CONTRIBUTING.md`
- Modify: `packages/app/src/main.ts` (wire tray), `packages/app/package.json` (dist script), `README.md` (full rewrite)
- Test: manual (`pnpm --filter @sortflow/app dist` produces a dmg; CI green on push)

**Interfaces:**
- Consumes: Electron `Tray`/`Menu`/`app`; the window factory from Task 16.
- Produces: menu-bar presence (`tray.setTitle('⚑')` — text-based, no icon asset needed on macOS), Open Sortflow / Launch at login / Quit menu items; `pnpm --filter @sortflow/app dist` builds `packages/app/release/Sortflow-*.dmg`.

- [ ] **Step 1: Write the tray module**

`packages/app/src/tray.ts`:
```ts
import { Menu, Tray, app, nativeImage } from 'electron';

let tray: Tray | null = null;

export function createTray(openWindow: () => void): Tray {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('⚑'); // text-based menu-bar item; replace with a template icon post-v1
  const rebuild = () => {
    const { openAtLogin } = app.getLoginItemSettings();
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Sortflow', click: openWindow },
        {
          label: 'Launch at login',
          type: 'checkbox',
          checked: openAtLogin,
          click: () => {
            app.setLoginItemSettings({ openAtLogin: !openAtLogin });
            rebuild();
          },
        },
        { type: 'separator' },
        { label: 'Quit Sortflow', click: () => app.quit() },
      ]),
    );
  };
  rebuild();
  return tray;
}
```

In `packages/app/src/main.ts`: `import { createTray } from './tray';` and, inside `app.whenReady().then(...)` after `win = createWindow();`, add:
```ts
  const tray = createTray(() => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
    else win?.show();
  });
  updateBadge = (count) => tray.setTitle(count > 0 ? `⚑ ${count}` : '⚑');
```
(`updateBadge` is the module-level hook Task 16 declared — the menu-bar item now shows the pending review count, per the spec's "tray-icon badge".)
Also change `createWindow` so closing hides instead of destroying:
```ts
  w.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      w.hide();
    }
  });
```
with, at module scope and near app events:
```ts
let quitting = false;
app.on('before-quit', () => {
  quitting = true;
});
```

- [ ] **Step 2: Packaging config**

`packages/app/electron-builder.yml`:
```yaml
appId: com.datnguyen.sortflow
productName: Sortflow
directories:
  output: release
files:
  - dist/**
  - package.json
extraResources:
  - from: ../ui/dist
    to: ui
mac:
  target: dmg
  category: public.app-category.productivity
```

Add to `packages/app/package.json` scripts:
```json
    "dist": "pnpm --filter @sortflow/ui build && pnpm build && electron-builder --config electron-builder.yml"
```
and add `"electron-builder": "^25.1.8"` to its devDependencies (then `pnpm install`).

- [ ] **Step 3: CI workflows**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm -r test
```

`.github/workflows/release.yml`:
```yaml
name: release
on:
  push:
    tags: ['v*']
jobs:
  dmg:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @sortflow/app dist
      - uses: actions/upload-artifact@v4
        with:
          name: Sortflow-dmg
          path: packages/app/release/*.dmg
```

- [ ] **Step 4: Docs**

Rewrite `README.md`:
```markdown
# Sortflow

**Visual, node-based smart file organizer.** Watch your Downloads and Desktop,
wire up filters and a local-AI classifier on a canvas, review proposed moves in
one click, undo anything. Free, offline, MIT-licensed.

<!-- demo gif goes here: record with the pipeline sorting a screenshot -->

## Why

- **The graph IS the rules.** No config files — drag Watch → Filter → AI
  Classify → Move nodes and connect them.
- **Not overbearing.** New files become *proposals* in a review tray; nothing
  moves until you approve. Rules you approve 10× in a row can go automatic.
- **Local AI, no API keys.** Ambiguous files are classified by
  [Ollama](https://ollama.com) on your machine. No Ollama? Everything still
  works — unclassified files just route to `unsure`.
- **Safe by construction.** Journal-first moves, no deletes, no overwrites,
  full undo. Event-driven watching: ~0% CPU at idle.

## Install

Download the latest `.dmg` from Releases, or build from source:

```bash
git clone https://github.com/datnguyen/sortflow && cd sortflow
pnpm install
pnpm --filter @sortflow/ui dev      # terminal 1
pnpm --filter @sortflow/app dev     # terminal 2
```

Optional AI classification: `brew install ollama && ollama pull llama3.2:3b`

## Architecture

pnpm monorepo: `packages/engine` (pure TS: watching, routing, journal, undo —
fully unit-tested) · `packages/ui` (React + React Flow editor) ·
`packages/app` (Electron shell + typed IPC). See
`docs/superpowers/specs/` for the full design, including the v2 roadmap
(embedding-based category suggestions from the unsure pile).

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm test` must pass.

## License

MIT © Dat Nguyen
```

`CONTRIBUTING.md`:
```markdown
# Contributing to Sortflow

- `pnpm install` then `pnpm test` (all packages) and `pnpm check` (Biome).
- Engine changes require tests — the engine is TDD'd; look at
  `packages/engine/tests/` for the house style.
- The UI ↔ app contract is `SortflowApi` in `packages/ui/src/bridge.ts`;
  if you change it, update `packages/app/src/preload.ts` and `ipc.ts` in the
  same PR.
- Safety invariants that must never regress: moves only (no deletes/overwrites),
  journal-before-move, review-before-move unless a node is `auto`, classify
  queue stays serialized with a cooldown.
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @sortflow/app dist`
Expected: `packages/app/release/Sortflow-0.1.0-arm64.dmg` exists; installing it yields a menu-bar ⚑ app.

Run: `pnpm test && pnpm check`
Expected: all green.

```bash
git add -A
git commit -m "feat: tray app, dmg packaging, CI and public docs"
```

The repo is now publishable. Publishing to GitHub (`gh repo create` + push + tag `v0.1.0`) is a decision for the owner — do NOT push without being asked.

---

## Plan Self-Review Notes

- **Spec coverage:** watch/filter/classify/move nodes (T2–T4, T7, T9, T11), review-first trust model + promotion (T10, T12, T15, T17), journal-first + undo + reconcile (T5, T6, T12), thermals/serialized queue (T8), Ollama-optional (T7, T12, T17), React Flow editor + animation (T13–T15), Electron tray + login (T16, T18), MIT/CI/docs (T1, T18). v2 clustering intentionally absent (spec roadmap).
- **Type consistency:** `SortflowApi` (T13) ⇄ preload (T16) channel-for-channel; `Engine` public API (T12) matches ipc.ts usage; proposal id == journal id enables tray-side undo.
- **Known deferred items (per spec non-goals):** stuck-file surfacing beyond `failed` status text, Windows/Linux builds, e2e Electron tests.



