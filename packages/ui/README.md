# @sortflow/ui

**The React renderer: a React Flow canvas where users draw file-sorting pipelines, plus the panels for generating, configuring, reviewing, and undoing them.**

## Overview

This package is the entire renderer process — a Vite + React 19 app built around `@xyflow/react` (React Flow), `zustand`, and `lucide-react` icons. It talks to the rest of Sortflow exclusively through the `SortflowApi` interface in [`src/bridge.ts`](src/bridge.ts); the Electron shell (`@sortflow/app`) injects the real implementation as `window.sortflow`, and a built-in mock takes over in a plain browser. `@sortflow/engine` is a type-only dependency (every import is `import type`), which is why it sits in `devDependencies`. See the root [architecture diagrams](../../README.md#architecture) for how the three packages fit together.

## Module map

| File | Responsibility |
| --- | --- |
| `src/bridge.ts` | `SortflowApi` contract (pipeline CRUD, preview, proposals, journal, folder pickers, event subscriptions) and `createMockApi()`, a browser-only fake so `pnpm dev` works without Electron. Exports the resolved `api`. |
| `src/store.ts` | Zustand store (`useFlowStore`): React Flow `nodes`/`edges`, selection, `focusMode`, node/edge mutations (`addNode`, `removeNode`, `replaceEdge`, …), `setNodeStatus`, `animatePath`, and `loadPipeline`/`toPipeline` conversion to the engine's `Pipeline` shape. |
| `src/lib/folderDrop.ts` | `FOLDER_MIME` (`application/x-sortflow-folder`) plus pure drag/drop helpers: `setFolderDragData`, `readFolderDragPath`, `handleFolderDrop` (drop on canvas → new Move node), `retargetMoveNode` (drop on a Move node → repoint it). |
| `src/lib/destBase.ts` | Persists the shared "Sort into" base folder (`sf-autosetup-dest` in `localStorage`), guarded so missing storage degrades to non-persistence. |
| `src/lib/recentDestinations.ts` | Pure MRU helpers for destination chips: `mergeRecents`, `mergeMany`, `buildChips`, `DEFAULTS`. |
| `src/nodes/WatchNode.tsx` | Watch node: folder path, `scanExisting` hint, error badge, single `out` handle. |
| `src/nodes/FilterNode.tsx` | Filter node: summarizes extensions/name pattern/age bounds; `match` and `else` source handles. |
| `src/nodes/ClassifyNode.tsx` | AI Classify node: one source handle per category plus `unsure`; warning/error badges. |
| `src/nodes/MoveNode.tsx` | Move node: destination, `auto` badge, and folder-drop target that retargets the destination. |
| `src/nodes/index.ts` | `nodeTypes` map (`watch`/`filter`/`classify`/`move`) passed to React Flow. |
| `src/edges/DeletableEdge.tsx` | Custom default edge: bezier path, animated flow dot, and an `×` delete button rendered via `EdgeLabelRenderer`. |
| `src/panels/Palette.tsx` | Left sidebar: Auto Setup (folder + "Sort into" selects), `GenerateSection`, add-node buttons, and the `FolderTree`. |
| `src/panels/GenerateSection.tsx` | "Describe It": natural-language pipeline drafting via `api.generatePipeline` (local Ollama); drafts load onto the canvas for review. |
| `src/panels/FolderTree.tsx` | Lazy-loading tree of the user's folders (`api.listFolders`); rows are drag sources for the canvas and Move nodes. |
| `src/panels/AutoSetupBanner.tsx` | Post-scan banner: files scanned, rules drafted, bucket summary, or the error. |
| `src/panels/PipelineTabs.tsx` | Pipeline-library tab bar: switch (stashing the outgoing canvas as a draft), create, rename, delete, per-pipeline enable toggle, and the focus-mode button. |
| `src/panels/ConfigPanel.tsx` | Right sidebar: per-kind config forms (filter presets, destination chips, rename pattern, date-grouping chip, auto-promotion offer at `PROMOTION_THRESHOLD`), Preview, and Save & Apply. |
| `src/panels/ReviewTray.tsx` | Pending proposals: approve/reject (single and bulk), rename-before-move, failed-move display; animates the executed route on the canvas. |
| `src/panels/HistoryPanel.tsx` | Move journal (`api.listJournal`) with per-entry Undo. |
| `src/App.tsx` | Shell layout: `ReactFlowProvider`, the canvas (drop handling, edge reconnect/delete gesture), and conditional panels under `focusMode`. |
| `src/main.tsx` | Boot: fetch the pipeline via `api.getPipeline`, subscribe to `onNodeStatus`, render `<App />`. |
| `src/styles.css` | All styling: design tokens (`--sf-*`), node/panel/tray styles. |
| `src/test/setup.ts` | jsdom stubs needed by React Flow (see Testing). |

## Key design decisions

- **One IPC seam.** Every backend interaction goes through the `SortflowApi` interface; `bridge.ts` exports `window.sortflow` when present, otherwise `createMockApi()`. That keeps components ignorant of Electron and makes `pnpm --filter @sortflow/ui dev` a fully working browser demo (in-memory proposals and pipeline library, canned Auto Setup and generation results).
- **React Flow shapes are the store's source of truth.** `useFlowStore` holds `Node`/`Edge` objects directly and converts at the edges: `loadPipeline` on the way in, `toPipeline()` on the way out. Nothing persists implicitly — the engine only sees the graph on explicit actions (Save & Apply, tab switch stashing a draft).
- **Drag-and-drop is split into pure helpers.** In-app tree drags carry the path under `FOLDER_MIME` (already known to be a directory), while Finder drops resolve through `api.getPathForFile` + `api.isDirectory`. The decisions themselves (`handleFolderDrop`, `retargetMoveNode`) are pure functions, testable without a DOM. `MoveNode` re-reads its config from the store after the async `isDirectory` round-trip so a concurrent edit is not reverted by a stale spread.
- **A custom edge replaces React Flow's default** so every edge gets a delete button and a flowing-dot animation (`animatePath` speeds it up for 3 s when a move executes). Dragging an edge end off any handle deletes it: a `reconnectSucceeded` ref set in `onReconnect` distinguishes rewire from drop-in-space.
- **Trust is earned per Move node.** `ConfigPanel` shows the approval streak (`api.approvalStreak`) and only offers "Make automatic" after `PROMOTION_THRESHOLD` (10) consecutive approvals — automation is opt-in, never silent.
- **`localStorage` access is always guarded** (`destBase.ts`, `loadRecents` in `ConfigPanel.tsx`): in tests or restricted contexts the feature degrades to session-only instead of throwing.
- **Focus mode is one store flag.** `App.tsx` conditionally drops the palette, config panel, and dock when `focusMode` is set, rather than juggling CSS visibility state.

## Testing

```sh
pnpm --filter @sortflow/ui test   # vitest run
```

`vitest.config.ts` uses the `jsdom` environment with `globals: true` and loads `src/test/setup.ts`, which stubs what jsdom lacks but React Flow needs: `ResizeObserver`, `DOMMatrixReadOnly` (parsing `scale(...)`), fixed `offsetWidth`/`offsetHeight` on `HTMLElement`, and `SVGElement.getBBox`.

The suite in `tests/` covers:

- `store.test.ts`, `app.test.tsx` — store mutations (`removeEdge`, `replaceEdge`, `addNode` overrides, `removeNode` + selection), pipeline round-tripping, focus mode hiding the panels.
- `config-panel.test.tsx`, `promotion.test.tsx` — per-kind config editing, filter presets, destination chips, date-grouping chip, Preview counts, Save & Apply problems/warnings/errors, and the streak-based promotion offer.
- `autosetup.test.tsx`, `generate.test.tsx` — Auto Setup loading the drafted pipeline and banner states (including the "Sort into" base being passed through), AI drafting success/error/disabled states.
- `pipelineTabs.test.tsx`, `review-tray.test.tsx`, `folderTree.test.tsx` — tab switching/create/rename/delete/enable, approve/reject/bulk/rename-at-review, lazy folder expansion and drag payloads.
- `folderDrop.test.ts`, `recentDestinations.test.ts` — the pure helpers, no DOM required.
