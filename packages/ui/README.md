# @sortflow/ui

**[⌂ Sortflow](../../README.md)** · [engine](../engine/README.md) · [app](../app/README.md) · **ui** · [Changelog](../../CHANGELOG.md) · [Contributing](../../CONTRIBUTING.md)

**The React renderer: a React Flow canvas where users draw file-sorting pipelines, a Files page for direct drag-to-move organizing, and the panels for generating, configuring, reviewing, and undoing.**

## Overview

This package is the entire renderer process — a Vite + React 19 app built around `@xyflow/react` (React Flow), `zustand`, and `lucide-react` icons. It talks to the rest of Sortflow exclusively through the `SortflowApi` interface in [`src/bridge.ts`](src/bridge.ts); the Electron shell (`@sortflow/app`) injects the real implementation as `window.sortflow`, and a built-in mock takes over in a plain browser. The app has two main views, switched by a store flag: the pipeline **canvas** (palette + graph + config panel) and the **Files** page (the home directory as a click-to-cascade column tree on its own React Flow canvas). `@sortflow/engine` is a type-only dependency (every import is `import type`), which is why it sits in `devDependencies`. See the root [architecture diagrams](../../README.md#architecture) for how the three packages fit together.

## Module map

| File | Responsibility |
| --- | --- |
| `src/bridge.ts` | `SortflowApi` contract (pipeline CRUD + preview, proposals incl. restore-rejected, journal incl. undo-all, pipeline library, folder pickers, Files-page file ops `listEntries`/`moveEntry`/`createFolder`/`trashEntry`, `checkAccess`, event subscriptions) and `createMockApi()`, a browser-only fake so `pnpm dev` works without Electron. Exports the resolved `api`. |
| `src/store.ts` | Zustand store (`useFlowStore`): React Flow `nodes`/`edges`, selection, `view` (`canvas`\|`files`), `focusMode`, `dirty` (canvas differs from the applied pipeline), `refreshTick`/`bumpRefresh`, node/edge mutations (`addNode`, `removeNode`, `replaceEdge`, …), `setNodeStatus`, `animatePath`, and `loadPipeline`/`toPipeline` conversion to the engine's `Pipeline` shape. |
| `src/lib/folderDrop.ts` | `FOLDER_MIME` (`application/x-sortflow-folder`) plus pure drag/drop helpers: `setFolderDragData`, `readFolderDragPath`, `handleFolderDrop` (drop on canvas → new Move node), `retargetMoveNode` (drop on a Move node → repoint it). |
| `src/lib/destBase.ts` | Persists the shared "Sort into" base folder (`sf-autosetup-dest` in `localStorage`), guarded so missing storage degrades to non-persistence. Read by Auto Setup and Describe It. |
| `src/lib/recentDestinations.ts` | Pure MRU helpers for destination chips: `mergeRecents`, `mergeMany`, `buildChips`, `DEFAULTS`. |
| `src/nodes/WatchNode.tsx` | Watch node: folder path, `scanExisting` hint, error badge, single `out` handle. |
| `src/nodes/FilterNode.tsx` | Filter node: summarizes extensions/name pattern/age bounds; `match` and `else` source handles. |
| `src/nodes/ClassifyNode.tsx` | AI Classify node: one source handle per category plus `unsure`; warning/error badges. |
| `src/nodes/MoveNode.tsx` | Move node: destination, `auto` badge, and folder-drop target that retargets the destination. |
| `src/nodes/index.ts` | `nodeTypes` map (`watch`/`filter`/`classify`/`move`) passed to React Flow. |
| `src/edges/DeletableEdge.tsx` | Custom default edge: bezier path, animated flow dot, and an `×` delete button rendered via `EdgeLabelRenderer`. |
| `src/panels/Palette.tsx` | Left sidebar as collapsible `PaletteSection`s (collapse state in `sf-palette-collapsed`): Auto Setup (multi-folder scan checkboxes + "Sort into" base select), `GenerateSection`, add-node buttons, and the `FolderTree`. |
| `src/panels/GenerateSection.tsx` | "Describe It": natural-language pipeline drafting via `api.generatePipeline` (local Ollama), passing the Sort-into base through; drafts load onto the canvas dirty, for review. |
| `src/panels/FolderTree.tsx` | Lazy-loading tree of the user's folders (`api.listFolders`); rows are drag sources for the canvas and Move nodes. |
| `src/panels/AutoSetupBanner.tsx` | Post-scan banner: files scanned, rules drafted, bucket summary, "this is a draft" reminder, or the error. |
| `src/panels/PermissionsBanner.tsx` | macOS folder-permission health check (`api.checkAccess`): names blocked Desktop/Documents/Downloads folders with System Settings guidance and a Recheck button; renders nothing when all is well. |
| `src/panels/PipelineTabs.tsx` | Pipeline-library tab bar: switch (stashing the outgoing canvas as a draft), create, rename, delete, per-pipeline enable toggle, the Files-view button, and the focus-mode button. |
| `src/panels/ConfigPanel.tsx` | Right sidebar: per-kind config forms (filter presets, destination chips, rename pattern, date-grouping chip, classify "what goes where" guidance textarea, watch `includeFolders`/`recursive` checkboxes with hints, auto-promotion offer at `PROMOTION_THRESHOLD`), Preview (dry-run counts), unsaved-changes nudge, and Save & Apply with warnings/problems/errors. |
| `src/panels/ReviewTray.tsx` | Pending proposals: approve/reject (single and bulk, incl. reject-all), restore-rejected rescue, rename-before-move, failed-move display; animates the executed route and re-fetches on `refreshTick`. |
| `src/panels/HistoryPanel.tsx` | Move journal (`api.listJournal`) with per-entry Undo and confirm-gated Undo all; re-fetches on `refreshTick` so Files-page moves appear. |
| `src/panels/FilesView.tsx` | The Files page: home directory as a click-to-cascade column tree on its own React Flow canvas (`panOnScroll`, non-draggable nodes). Multi-open branches vertically centered on their parents, per-folder hide/mute with a "Hidden" reveal pill, file-kind filter pills (both persisted), inline new-folder creator node, drag-to-move via native HTML5 drag, and trash via the macOS Trash with confirmation. |
| `src/App.tsx` | Shell layout: switches between `FilesView` and the canvas view (`ReactFlowProvider`, drop handling, edge reconnect/delete gesture, `PermissionsBanner`), with panels and dock conditional on `focusMode`. |
| `src/main.tsx` | Boot: fetch the pipeline via `api.getPipeline`, subscribe to `onNodeStatus`, render `<App />`. |
| `src/styles.css` | All styling: design tokens (`--sf-*`), node/panel/tray/Files-page styles, the `sf-pulse` Save & Apply animation. |
| `src/test/setup.ts` | jsdom stubs needed by React Flow (see Testing). |

## Key design decisions

- **One IPC seam.** Every backend interaction goes through the `SortflowApi` interface; `bridge.ts` exports `window.sortflow` when present, otherwise `createMockApi()`. That keeps components ignorant of Electron and makes `pnpm --filter @sortflow/ui dev` a fully working browser demo (in-memory proposals and pipeline library, canned Auto Setup, generation, preview, and file listings).
- **React Flow shapes are the store's source of truth.** `useFlowStore` holds `Node`/`Edge` objects directly and converts at the edges: `loadPipeline` on the way in, `toPipeline()` on the way out. Nothing persists implicitly — the engine only sees the graph on explicit actions (Save & Apply, tab switch stashing a draft).
- **Dirty is tracked in the store, not inferred.** Every mutating action (`addNode`, `updateConfig`, `onConnect`, …) sets `dirty`; `loadPipeline` and a successful Save & Apply clear it. `ConfigPanel` turns the flag into an unsaved-changes nudge and a pulsing Save & Apply button, so "the running engine does not match the canvas" is always visible.
- **Views are store flags, not a router.** `view: "canvas" | "files"` swaps the whole main area; `focusMode` drops the palette, config panel, and dock. Cross-panel refresh is a counter: Save & Apply and Files-page moves call `bumpRefresh()`, and `ReviewTray`/`HistoryPanel` re-fetch on `refreshTick` changes.
- **Drag-and-drop is split into pure helpers.** In-app tree drags carry the path under `FOLDER_MIME` (already known to be a directory), while Finder drops resolve through `api.getPathForFile` + `api.isDirectory`. The decisions themselves (`handleFolderDrop`, `retargetMoveNode`) are pure functions, testable without a DOM. `MoveNode` re-reads its config from the store after the async `isDirectory` round-trip so a concurrent edit is not reverted by a stale spread.
- **A custom edge replaces React Flow's default** so every edge gets a delete button and a flowing-dot animation (`animatePath` speeds it up for 3 s when a move executes). Dragging an edge end off any handle deletes it: a `reconnectSucceeded` ref set in `onReconnect` distinguishes rewire from drop-in-space.
- **The Files page derives its graph instead of storing one.** `FilesView` computes all nodes and edges in a `useMemo` from `entriesByPath` + the `expanded` set, recursively sizing each branch so children are vertically centered on their parent. React Flow is used purely as a renderer (`nodesDraggable={false}`, `panOnScroll`); all interactivity — click to open, native HTML5 drag of boxes, drops, the creator input — is plain DOM events on elements marked `nodrag`. Without that class React Flow's pointerdown handler would swallow clicks and native drags inside nodes. Moves go through `api.moveEntry` (journaled, undoable in History); deletion uses the macOS Trash, never `rm`.
- **Trust is earned per Move node.** `ConfigPanel` shows the approval streak (`api.approvalStreak`) and only offers "Make automatic" after `PROMOTION_THRESHOLD` (10) consecutive approvals — automation is opt-in, never silent. Bulk approve exists, but so do reject-all and restore-rejected, so no decision is one-way.
- **`localStorage` reads are guarded** (`destBase.ts`, `loadCollapsed` in `Palette.tsx`, `loadRecents` in `ConfigPanel.tsx`, hidden kinds/paths in `FilesView.tsx`): every read sits in a `try/catch` with a default, so tests or restricted contexts degrade to session-only instead of throwing.
- **Hidden-node testing gotcha.** React Flow renders nodes `visibility: hidden` until it measures them, and jsdom never delivers the (stubbed) ResizeObserver callbacks — so role-based queries, which respect visibility, can't see inside custom nodes. The suites reach into node internals with `findByText`/`container.querySelector('[aria-label=…]')` and reserve `getByRole` for chrome outside the flow canvas (pills, headers, tabs).

## Testing

```sh
pnpm --filter @sortflow/ui test   # vitest run
```

`vitest.config.ts` uses the `jsdom` environment with `globals: true` and loads `src/test/setup.ts`, which stubs what jsdom lacks but React Flow needs: `ResizeObserver`, `DOMMatrixReadOnly` (parsing `scale(...)`), fixed `offsetWidth`/`offsetHeight` on `HTMLElement`, and `SVGElement.getBBox`.

The suite in `tests/` covers:

- `store.test.ts`, `app.test.tsx` — store mutations (`removeEdge`, `replaceEdge`, `addNode` overrides, `removeNode` + selection), dirty tracking, pipeline round-tripping, focus mode hiding the panels.
- `config-panel.test.tsx`, `promotion.test.tsx` — per-kind config editing (incl. classify guidance, recursive/`scanExisting` watch options, rename pattern, age bounds), filter presets, destination chips, date-grouping chip, Preview counts, the unsaved-changes nudge, Save & Apply warnings and save errors, and the streak-based promotion offer.
- `autosetup.test.tsx`, `generate.test.tsx` — Auto Setup loading the drafted pipeline, banner states, the "Sort into" base being passed or omitted, palette-section collapsing; AI drafting success/error/disabled states.
- `pipelineTabs.test.tsx`, `review-tray.test.tsx`, `folderTree.test.tsx` — tab switching/create/rename/delete/enable and the focus toggle; approve/reject/reject-all/restore-rejected/rename-at-review and failed proposals; lazy folder expansion and drag payloads.
- `filesView.test.tsx` — the column cascade: open/fold, multiple simultaneous branches, drop-to-move (and refused moves), inline folder creation, confirm-gated trash, kind-filter pills, and hide/Hidden-reveal.
- `historyPanel.test.tsx`, `permissionsBanner.test.tsx` — confirm-gated Undo all (hidden below two undoable moves); the banner staying silent when folders are accessible and naming blocked ones with a recheck.
- `folderDrop.test.ts`, `recentDestinations.test.ts` — the pure helpers, no DOM required.
