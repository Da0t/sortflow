# @sortflow/engine

**[⌂ Sortflow](../../README.md)** · **engine** · [app](../app/README.md) · [ui](../ui/README.md) · [Changelog](../../CHANGELOG.md) · [Contributing](../../CONTRIBUTING.md)

**The pure-TypeScript domain core of Sortflow: pipeline graphs, file routing, local-AI classification, and journaled, undoable file moves.**

## Overview

This package contains all of Sortflow's behavior with zero Electron or React dependencies — its only runtime dependency is `chokidar`, everything else is Node built-ins. `@sortflow/app` (the Electron main process) instantiates the `Engine` and `PipelineLibrary`; `@sortflow/ui` imports only the shared types (`Pipeline`, `Proposal`, node configs). Because every side effect is behind an injectable seam (`fetchFn`, `now`, watcher options), the whole package is tested with plain Vitest and temp directories. See the [root architecture docs](../../README.md#architecture) for how it fits into the app.

All persistent state lives under the `dataDir` the host passes to the `Engine` and `PipelineLibrary`: `journal.jsonl` (move log), `proposals.json` (proposal lifecycle), and `pipelines.json` (the pipeline library).

## Module map

| File | Responsibility |
| --- | --- |
| `src/types.ts` | Shared domain types: `Pipeline`/`PipelineNode`/`PipelineEdge`, the four node configs (`WatchConfig` incl. `includeFolders`, `FilterConfig`, `ClassifyConfig` incl. `instructions`, `MoveConfig`), `IncomingFile` (with `isDirectory`), `Proposal` (with persisted `category`), `JournalEntry`. |
| `src/graph.ts` | `validatePipeline` (duplicate ids, bad regexes, unknown handles, one edge per handle, no input into watch nodes, cycle detection) plus `edgeFrom`/`nodeById` lookups. |
| `src/filter.ts` | `matchesFilter` (extension, glob-or-regex name pattern, size, age-in-days) and `globToRegExp`. |
| `src/classify.ts` | `Classifier` interface and `OllamaClassifier`: prompts `/api/chat` with filename + first 1 KB of known-text files + optional `instructions` guidance; folders are judged by name plus a listing of up to 30 non-hidden children; returns `UNSURE` on any failure. Also `ping()` for health checks. |
| `src/queue.ts` | `ClassifyQueue` — serializes classification jobs with a cooldown between them. |
| `src/route.ts` | `routeFile` — walks a file from its watch node through filters/classify to a move node, returning `{ moveNodeId, nodePath, category }`. |
| `src/move.ts` | `expandDestination` (`~`, `{YYYY}`, `{MM}`, `{fileYYYY}`…, `{ext}`, `{category}` tokens), `expandRename` (stem patterns with sanitization), `uniqueDestination` (` (1)`, ` (2)`… collision suffixing). |
| `src/journal.ts` | `Journal` — append-only JSONL log; `reconcile` resolves crashed `intent` entries by checking the disk. |
| `src/executor.ts` | `executeMove` (journal-first: `intent` → rename → `done`/`failed`, retries on `EBUSY`-class errors, `EXDEV` copy fallback with `COPYFILE_EXCL`) and `undoMove`. |
| `src/proposals.ts` | `ProposalStore` — JSON-persisted proposal lifecycle: `rename` of pending targets, `restoreRejected` bulk rescue, `prunePendingDuplicates` (keep the newest pending per file), `remove` (stale-record cleanup), `approvalStreak` per move node. |
| `src/watcher.ts` | `FolderWatcher` — chokidar wrapper: `~`-expansion of watch paths, `awaitWriteFinish` stability, `scanExisting`, depth control, top-level-only `addDir` folder events when `includeFolders` is set, error forwarding. |
| `src/engine.ts` | `Engine` (EventEmitter) — wires watcher → `routeFile` → proposals → executor; `refreshPendingProposals` on start, `moveManually`, `undoAllDone`, `restoreRejected`; emits `proposal`, `executed`, `stuck`, `nodeStatus`. |
| `src/autosetup.ts` | `scanFolder` (bucket files by heuristic: screenshots, images, documents, installers, archives, media), `mergeScans` (sum bucket counts across folders), `suggestPipeline` (`idSuffix`/`offsetY` so multi-folder drafts get unique ids and stack cleanly), `estimateRowHeight`. |
| `src/preview.ts` | `previewPipeline` — dry-run scan reporting `wouldMove`/`needsClassify`/`unmatched` per-destination counts without touching files. |
| `src/generate.ts` | `OllamaGenerator` (natural language → pipeline, grounded by `GenerateContext`), `coerceSpec` (harden untrusted model JSON), `specToPipeline` (deterministic graph construction). |
| `src/library.ts` | `PipelineLibrary` (persisted multi-pipeline store with legacy `pipeline.json` migration), `mergePipelines`, `detectWatchOverlaps`. |
| `src/index.ts` | Barrel re-exporting every module plus `VERSION`. |

## Key design decisions

- **Journal-first moves.** `executeMove` appends an `intent` line before the file is moved and `done`/`failed` after, so a crash mid-move is recoverable: `Journal.reconcile` replays unresolved intents by checking whether the destination file actually exists on disk. The journal is append-only JSONL; malformed trailing lines (crash artifacts) are skipped on read.
- **Every move is undoable — including manual ones.** Manual moves from the Files page go through the same `executeMove` path (`Engine.moveManually`, journaled under moveNodeId `"manual"`), so they undo like pipeline moves. `Engine.undoAllDone` bulk-undoes every completed move newest-first, skipping entries that can no longer be reversed (file renamed or deleted by hand) — partial recovery beats none.
- **Never overwrite.** Destinations get collision suffixes via `uniqueDestination`, and the cross-device fallback path uses `copyFile(..., COPYFILE_EXCL)` so even `EXDEV` moves fail rather than clobber. `Engine` additionally serializes all moves (approve, undo, and manual) through a promise chain (`runExclusive`) so two concurrent moves can never race the uniqueness check, and `stop()` drains any in-flight move so a pipeline hot-swap never leaves a move executing against a discarded engine.
- **Pending proposals are re-grounded on start.** Destinations are expanded (and frozen) at proposal time, so a pipeline edit between sessions would otherwise execute stale paths. `Engine.start` runs `prunePendingDuplicates` (a file may only be queued once) and then `refreshPendingProposals`: each pending proposal's `destDir` is re-expanded against the current pipeline — using the persisted `Proposal.category` to re-resolve `{category}` — and proposals whose move node or source file vanished are removed so the watcher can re-propose them under the current rules.
- **AI failure degrades to `unsure`, never to a crash or a wrong move.** `OllamaClassifier` returns the `UNSURE` sentinel on timeouts, non-OK responses, bad JSON, or hallucinated categories; `routeFile` follows the `unsure` handle like any other edge. `ClassifyQueue` serializes jobs with a cooldown (default 2 s) so a bulk drop of files does not pin the CPU on a laptop.
- **Folder sorting is opt-in and review-only.** `WatchConfig.includeFolders` makes the watcher also emit immediate child directories (never the watched root, never nested folders — moving those would fight the recursive file watch) as `IncomingFile`s with `isDirectory: true`. The classifier judges a folder by its name plus a child listing, and `Engine` never auto-executes a folder move even on an `auto: true` move node — moving a whole directory always goes through review.
- **The model drafts rules, never graphs.** `OllamaGenerator` asks the local model for a flat, ordered rule list (`GeneratedSpec`); `coerceSpec` sanitizes the untrusted JSON (normalizing extensions, dropping useless rules, hoisting `classify` blocks that small models nest inside a rule) and `specToPipeline` builds the graph deterministically. Invalid output is retried (up to 3 total attempts) with the validation error fed back into the prompt, so a returned pipeline always passes `validatePipeline`.
- **Generation is grounded in the user's world.** `generate()` takes a `GenerateContext` — a preferred destination base (`destBase`) and listings of existing folders — appended to the prompt so drafts reuse the folders the user already has instead of inventing new ones. When AI judgment is needed, the spec's `classify.guidance` is a distilled one-liner (not the whole request) that `specToPipeline` carries into `ClassifyConfig.instructions` for the classifier.
- **Review-first by default.** Everything auto-generated (`suggestPipeline`, `specToPipeline`) emits move nodes with `auto: false`; files become `Proposal`s the user approves. `ProposalStore.approvalStreak` counts consecutive approvals per move node so the UI can offer flipping a rule to automatic, and `restoreRejected` flips a mis-rejected batch back to pending without ever double-queuing a file. Multi-folder auto-setup composes per-folder suggestions via `mergeScans` + `idSuffix`/`offsetY`.
- **Injected effects over module mocks.** Time (`now`), `fetch`, and watcher options are constructor/option parameters throughout, which keeps tests deterministic and the package free of test-only shims.

## Testing

```sh
pnpm --filter @sortflow/engine test   # vitest run
```

One test file per source module in [`tests/`](tests/). Filesystem-touching suites (`engine`, `executor`, `journal`, `move`, `proposals`, `library`, `watcher`, `preview`, `autosetup`) run against real temp directories; Ollama-facing suites (`classify`, `generate`) inject a stub `fetchFn`. Coverage includes:

- the end-to-end propose → approve → move → undo flow, plus bulk undo and manual moves
- crash reconciliation and concurrent-approval serialization
- pending-proposal refresh on start, duplicate pruning, and rejected-batch restore
- `scanExisting` restart dedup and rename-pattern expansion
- folder watch events, folder classification, and the never-auto-execute rule for folders
- generation grounding, guidance passthrough, and `coerceSpec` hardening
- live chokidar watch behavior (stability threshold, recursion depth, pre-existing files)
