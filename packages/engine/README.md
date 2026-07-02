# @sortflow/engine

**The pure-TypeScript domain core of Sortflow: pipeline graphs, file routing, local-AI classification, and journaled, undoable file moves.**

## Overview

This package contains all of Sortflow's behavior with zero Electron or React dependencies — its only runtime dependency is `chokidar`, everything else is Node built-ins. `@sortflow/app` (the Electron main process) instantiates the `Engine` and `PipelineLibrary`; `@sortflow/ui` imports only the shared types (`Pipeline`, `Proposal`, node configs). Because every side effect is behind an injectable seam (`fetchFn`, `now`, watcher options), the whole package is tested with plain Vitest and temp directories. See the [root architecture docs](../../README.md#architecture) for how it fits into the app.

## Module map

| File | Responsibility |
| --- | --- |
| `src/types.ts` | Shared domain types: `Pipeline`/`PipelineNode`/`PipelineEdge`, the four node configs (`WatchConfig`, `FilterConfig`, `ClassifyConfig`, `MoveConfig`), `IncomingFile`, `Proposal`, `JournalEntry`. |
| `src/graph.ts` | `validatePipeline` (duplicate ids, bad regexes, unknown handles, one edge per handle, no input into watch nodes, cycle detection) plus `edgeFrom`/`nodeById` lookups. |
| `src/filter.ts` | `matchesFilter` (extension, glob-or-regex name pattern, size, age-in-days) and `globToRegExp`. |
| `src/classify.ts` | `Classifier` interface and `OllamaClassifier`: prompts `/api/chat` with filename + first 1 KB of known-text files + optional `instructions` guidance; returns `UNSURE` on any failure. Also `ping()` for health checks. |
| `src/queue.ts` | `ClassifyQueue` — serializes classification jobs with a cooldown between them. |
| `src/route.ts` | `routeFile` — walks a file from its watch node through filters/classify to a move node, returning `{ moveNodeId, nodePath, category }`. |
| `src/move.ts` | `expandDestination` (`~`, `{YYYY}`, `{MM}`, `{fileYYYY}`…, `{ext}`, `{category}` tokens), `expandRename` (stem patterns with sanitization), `uniqueDestination` (` (1)`, ` (2)`… collision suffixing). |
| `src/journal.ts` | `Journal` — append-only JSONL log; `reconcile` resolves crashed `intent` entries by checking the disk. |
| `src/executor.ts` | `executeMove` (journal-first: `intent` → rename → `done`/`failed`, retries on `EBUSY`-class errors, `EXDEV` copy fallback with `COPYFILE_EXCL`) and `undoMove`. |
| `src/proposals.ts` | `ProposalStore` — JSON-persisted proposal lifecycle, `rename` of pending targets, `restoreRejected` bulk rescue, `approvalStreak` per move node. |
| `src/watcher.ts` | `FolderWatcher` — chokidar wrapper: `awaitWriteFinish` stability, `scanExisting`, depth control, error forwarding. |
| `src/engine.ts` | `Engine` (EventEmitter) — wires watcher → `routeFile` → proposals → executor; emits `proposal`, `executed`, `stuck`, `nodeStatus`. |
| `src/autosetup.ts` | `scanFolder` (bucket files by heuristic: screenshots, images, documents, installers, archives, media), `suggestPipeline`, `estimateRowHeight`. |
| `src/preview.ts` | `previewPipeline` — dry-run scan reporting `wouldMove`/`needsClassify`/`unmatched` per-destination counts without touching files. |
| `src/generate.ts` | `OllamaGenerator` (natural language → pipeline), `coerceSpec` (harden untrusted model JSON), `specToPipeline` (deterministic graph construction). |
| `src/library.ts` | `PipelineLibrary` (persisted multi-pipeline store with legacy `pipeline.json` migration), `mergePipelines`, `detectWatchOverlaps`. |
| `src/index.ts` | Barrel re-exporting every module plus `VERSION`. |

## Key design decisions

- **Journal-first moves.** `executeMove` appends an `intent` line before the file is moved and `done`/`failed` after, so a crash mid-move is recoverable: `Journal.reconcile` replays unresolved intents by checking whether the destination file actually exists on disk. The journal is append-only JSONL; malformed trailing lines (crash artifacts) are skipped on read.
- **Never overwrite.** Destinations get collision suffixes via `uniqueDestination`, and the cross-device fallback path uses `copyFile(..., COPYFILE_EXCL)` so even `EXDEV` moves fail rather than clobber. `Engine` additionally serializes all moves (approve and undo) through a promise chain (`runExclusive`) so two concurrent moves can never race the uniqueness check.
- **AI failure degrades to `unsure`, never to a crash or a wrong move.** `OllamaClassifier` returns the `UNSURE` sentinel on timeouts, non-OK responses, bad JSON, or hallucinated categories; `routeFile` follows the `unsure` handle like any other edge. `ClassifyQueue` serializes jobs with a cooldown (default 2 s) so a bulk drop of files does not pin the CPU on a laptop.
- **The model drafts rules, never graphs.** `OllamaGenerator` asks the local model for a flat, ordered rule list (`GeneratedSpec`); `coerceSpec` sanitizes the untrusted JSON (normalizing extensions, dropping useless rules, hoisting misplaced `classify` blocks) and `specToPipeline` builds the graph deterministically. Invalid output is retried (up to 3 total attempts) with the validation error fed back into the prompt, so a returned pipeline always passes `validatePipeline`.
- **Review-first by default.** Everything auto-generated (`suggestPipeline`, `specToPipeline`) emits move nodes with `auto: false`; files become `Proposal`s the user approves. `ProposalStore.approvalStreak` counts consecutive approvals per move node so the UI can offer flipping a rule to automatic.
- **Injected effects over module mocks.** Time (`now`), `fetch`, and watcher options are constructor/option parameters throughout, which keeps tests deterministic and the package free of test-only shims.

## Testing

```sh
pnpm --filter @sortflow/engine test   # vitest run
```

One test file per source module in [`tests/`](tests/). Filesystem-touching suites (`engine`, `executor`, `journal`, `move`, `proposals`, `library`, `watcher`, `preview`, `autosetup`) run against real temp directories; Ollama-facing suites (`classify`, `generate`) inject a stub `fetchFn`. Coverage includes the end-to-end propose → approve → move → undo flow, crash reconciliation, concurrent-approval serialization, `scanExisting` restart dedup, rename-pattern expansion, and live chokidar watch behavior (stability threshold, recursion depth, pre-existing files).
