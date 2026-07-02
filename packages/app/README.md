# @sortflow/app

**The Electron main process: a macOS menu-bar (tray) app that hosts the Sortflow engine, owns the pipeline library, and exposes a typed IPC bridge to the renderer.**

## Overview

`@sortflow/app` boots Electron, loads `PipelineLibrary` and `Engine` from `@sortflow/engine` (bundled in at build time), and serves the renderer built by `@sortflow/ui` — a Vite dev server at `http://localhost:5173` when `SORTFLOW_DEV=1`, packaged static files under `process.resourcesPath/ui` otherwise. It is the only package that touches Electron APIs; the UI reaches it exclusively through the `window.sortflow` object, whose shape is the `SortflowApi` interface in `packages/ui/src/bridge.ts`. Nothing depends on this package — it is the leaf that `electron-builder` turns into the distributable `.dmg`. See the root [architecture section](../../README.md#architecture) for how it fits into the monorepo.

## Module map

| File | Responsibility |
| --- | --- |
| `src/tray.ts` | `createTray()`: text-based menu-bar item (`⚑` title, empty `nativeImage`) with Open Sortflow, a Launch-at-login checkbox backed by `app.get/setLoginItemSettings`, and Quit. |
| `src/ipc.ts` | `registerIpc()`: every `ipcMain.handle` channel, engine-event forwarding to the renderer, and the engine hot-swap (`restartEngine`) that runs the merged graph of all enabled pipelines. |
| `src/preload.ts` | Context-isolated bridge: `contextBridge.exposeInMainWorld("sortflow", …)`, a 1:1 implementation of `SortflowApi`; event subscriptions return unsubscribe functions, and `getPathForFile` wraps `webUtils.getPathForFile` for drag-and-drop. |
| `src/main.ts` | Entry point and lifecycle: loads library + engine from `app.getPath("userData")`, creates the 1200x800 `BrowserWindow` (`contextIsolation: true`, `nodeIntegration: false`), wires the tray badge, and keeps the process alive as a tray app. |

## Lifecycle (`main.ts`)

- On `app.whenReady`: `PipelineLibrary.load(dataDir)`, `new Engine({ dataDir })`, `registerIpc(...)`, then `engine.start(mergePipelines(library.enabledPipelines()))`. A failed start is logged and swallowed so the window still opens for the user to fix the pipeline.
- Window close is intercepted and becomes `hide()` unless `before-quit` has fired; `window-all-closed` deliberately does not quit. The process only exits via the tray's Quit item (or Cmd-Q). `activate` re-creates the window if none exist.
- The tray title doubles as a badge: `⚑ N` while N proposals are pending, `⚑` otherwise. `pendingCount()` is called once at startup so reviews restored from disk show immediately on relaunch.

## IPC surface (`ipc.ts`)

| Channels | Purpose |
| --- | --- |
| `pipeline:get` / `pipeline:set` / `pipeline:preview` / `pipeline:generate` | Active-pipeline read, save-and-apply, dry-run preview, and LLM drafting. `set` validates the *merged* graph (draft + other enabled pipelines), saves, hot-swaps the engine, and returns `detectWatchOverlaps` warnings. `generate` calls `OllamaGenerator` (default model `llama3.2:3b`), grounded in up to 30 real folder names under `destBase` and `~` so drafted destinations reuse existing spellings. |
| `pipelines:list` / `setActive` / `create` / `rename` / `delete` / `setEnabled` | Library operations. `setActive`/`create` accept the editor's unsaved graph as a `draft` and persist it first. `delete` restarts the engine only if the removed pipeline was enabled and the shrunken merged graph still validates; `setEnabled` reverts the toggle when the merged graph fails validation. |
| `proposals:list` / `approve` / `reject` / `restoreRejected` / `rename`, `journal:list` / `journal:undo`, `streak:get` | Review queue (including the bulk restore of rejected proposals), undo journal, and per-move-node approval streak, delegated to the current engine. |
| `autosetup:scan` | `scanFolder` + `suggestPipeline` for a `~`-expanded directory; returns `{ scan, pipeline }`. |
| `dialog:pickFolder` | Native directory picker (`openDirectory`, `createDirectory`); resolves `null` on cancel. |
| `fs:isDirectory` / `fs:listFolders` | Path check and shallow, hidden-filtered folder listing for the UI's folder tree. |

Engine events `proposal`, `executed`, `stuck`, and `nodeStatus` are pushed to the renderer as `engine:*` channels; the first three also refresh the tray badge.

## Key design decisions

- **Hot-swap, not mutate-in-place.** `restartEngine` quiesces the old engine — `removeAllListeners()` so draining moves cannot emit onto stale handlers, then `stop()` (which drains the move mutex) — before a fresh `Engine` starts on the new graph. Applying a pipeline can never race a half-stopped watcher.
- **One engine, merged graph.** All enabled pipelines run as a single `mergePipelines(...)` graph, so `pipeline:set` validates the merge and cross-pipeline conflicts surface at save time instead of at runtime.
- **Drafts never touch the running engine.** Tab switches and new-pipeline creation persist the unsaved graph so work is never lost, but the engine only restarts on Save & Apply, enable/disable, or delete of an enabled pipeline.
- **Strict renderer isolation.** `contextIsolation: true`, `nodeIntegration: false`; the renderer's entire capability set is the `window.sortflow` bridge, which must implement `SortflowApi` exactly (the UI falls back to a mock when the bridge is absent, so it also runs in a plain browser).
- **No per-child probe in `fs:listFolders`.** Reading *into* `~/Documents` etc. would fire macOS permission prompts before the user touches the feature, so every folder reports `hasChildren: true` and expanding an empty one just shows "No subfolders".
- **`@sortflow/engine` is force-bundled.** `tsup.config.ts` sets `noExternal: ["@sortflow/engine"]` (CJS output to `dist/`) so a packaged app never tries to `require` workspace source; `electron` stays external (runtime-provided) and `chokidar` remains a plain runtime dependency.
- **Tray-first UX.** Closing the window hides it and `window-all-closed` is a no-op, because Sortflow's job is background file watching; "Launch at login" is a login-item toggle in the tray menu.

## Build and distribution

- `pnpm build` — tsup bundles `src/main.ts` and `src/preload.ts` to CJS in `dist/`.
- `pnpm dev` — builds, then runs `SORTFLOW_DEV=1 electron .`; expects the `@sortflow/ui` Vite dev server on port 5173.
- `pnpm dist` — builds `@sortflow/ui`, builds this package, then runs `electron-builder --config electron-builder.yml`: `dist/**` and `package.json` go into the app, the UI's `dist/` is copied as the `ui` extra resource (matching the `process.resourcesPath` load path in `main.ts`), and a macOS `.dmg` (appId `com.datnguyen.sortflow`, productName `Sortflow`, productivity category) lands in `release/`.

## Testing

`pnpm test` is intentionally a stub (`echo 'app: covered by engine tests + manual smoke'`). This package is Electron glue; the behavior it wires up — watching, matching, moving, proposals, journal, merge/validation — is unit-tested in `@sortflow/engine`. Verify changes here with a manual smoke run: start the UI dev server, run `pnpm dev`, and exercise the tray menu, Save & Apply, and the proposal/undo flow.
