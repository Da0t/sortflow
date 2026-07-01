# Sortflow — Design Spec

**Date:** 2026-07-01
**Status:** Approved by Dat Nguyen (brainstorming session)

## What it is

Sortflow is an open-source desktop app that automatically organizes incoming
files. The user builds their organizing logic visually as a node pipeline
(React Flow): watch folders feed filters and an AI classifier, which route
files into destination folders. New files produce *proposals* in a review
tray; the user approves them (one-click or bulk) until a rule earns enough
trust to run automatically. Every move is journaled and undoable.

## Goals

- Organize incoming files in watched folders (e.g. `~/Downloads`, `~/Desktop`)
  with near-zero ongoing effort.
- Organizing logic is a visual, editable node graph — the graph IS the rules.
- Free to run: deterministic rules + optional local AI (Ollama). No API keys,
  no cloud, nothing leaves the machine.
- Not overbearing: review-queue-first trust model; nothing moves without
  approval until the user promotes a rule to automatic; everything undoable.
- Publishable open-source project others can install and contribute to.

## Non-goals (v1)

- Rename templating beyond destination-path tokens
- Duplicate detection
- Sweeping/organizing pre-existing files (v1 handles *incoming* files only)
- Cloud AI providers (design leaves a plug-in seam, not built in v1)
- Windows/Linux packaged builds (engine is cross-platform; CI builds macOS only)
- Full Electron end-to-end test suite

## Architecture

Electron app, pnpm-workspaces monorepo, all TypeScript:

| Package   | Role | Depends on |
|-----------|------|------------|
| `engine/` | Pure TS, no Electron imports. Pipeline graph model (JSON), chokidar file watching, node executors, move execution, undo journal, Ollama client. | chokidar, ollama HTTP |
| `app/`    | Electron main process: tray icon, launch-at-login, pipeline/journal persistence, typed IPC bridge between engine and UI. | engine |
| `ui/`     | React + React Flow renderer: canvas editor, node palette, node config panels, review tray, history/undo panel. Animated dots travel the wires when files flow. | app via IPC |

`engine/` having zero Electron dependencies keeps it unit-testable and lets a
CLI/daemon frontend reuse it later.

## Data model

- **Pipeline**: JSON `{ nodes: [{id, type, config, position}], edges: [{source, sourceHandle, target}] }`
  stored at `~/Library/Application Support/Sortflow/pipeline.json`.
- **Journal**: append-only JSONL at `.../Sortflow/journal.jsonl`; entries
  `{id, ts, from, to, nodePath, status: intent|done|undone}`.
- **Proposals**: in-memory queue persisted alongside the journal so pending
  reviews survive restarts.

## Node types (v1)

1. **Watch** — folder path, optional recursion. Uses chokidar with
   `awaitWriteFinish` so partially written/downloading files are never emitted.
2. **Filter** — predicate on extension list, name glob/regex, file size,
   file age. Two output handles: `match` and `else`, so fallbacks chain.
3. **AI Classify** — sends the filename to local Ollama (model configurable,
   default `llama3.2:3b`); for plain-text files (txt/md/csv/code) the first
   ~1KB of content is included. Other formats (PDF, images) classify by
   filename only in v1; content extraction is a v2 seam. User defines
   category labels on the node; one output handle per category plus `unsure`.
   Ollama missing/down ⇒ files take `unsure` and the node shows a warning
   badge. The classifier client is an interface so cloud providers can be
   added later without touching the engine.
4. **Move** — destination path with tokens `{category}`, `{YYYY}`, `{MM}`,
   `{ext}`. Terminal node. Emits a *proposal* rather than moving directly
   (see trust model). Collision policy: suffix ` (1)`, never overwrite.

## Trust model & review flow

- A Move node's output is a proposal: "file X → destination Y".
- Proposals land in the global **review tray** (UI panel + tray-icon badge):
  approve/reject per item or in bulk.
- Each Move node tracks its consecutive-approval streak; past a threshold the
  UI offers to promote it to **automatic**. Promotion is per-node, visible on
  the node, and demotable anytime.
- Approved/automatic moves execute journal-first: append intent → move →
  confirm. **Undo** (single or batch) replays journal entries in reverse.

## Error handling & safety

- Engine only ever moves files. No deletes, no overwrites.
- Half-written files excluded via `awaitWriteFinish`.
- Locked/in-use files: retry with backoff, then surface as "stuck" in the
  tray with the reason. (Cloud-sync clients like OneDrive briefly lock files;
  retries absorb this — documented caveat.)
- Watched folder missing/renamed: that node pauses with an error badge; the
  rest of the pipeline keeps running.
- Crash mid-move: journal intent entry remains; on startup, unconfirmed
  intents are reconciled (file at destination? mark done; still at source?
  mark failed) so the journal never lies.

## Testing

- **engine/**: TDD with vitest against temp directories — filter predicates,
  path-template expansion, collision suffixing, journal write/undo
  round-trips, crash-reconciliation logic.
- **AI Classify**: mocked Ollama client; one integration test that runs only
  when a local Ollama is detected.
- **ui/**: smoke tests (canvas renders, nodes connect, config panels bind)
  with vitest + testing-library.

## Open-source packaging

- MIT license; README opens with the animated demo gif (dots flowing through
  the pipeline as a screenshot gets sorted).
- CONTRIBUTING.md; pnpm workspaces; GitHub Actions: lint + test on PR,
  macOS `.dmg` on version tags.
- Repo lives at `~/Desktop/PROJECTS/sortflow`; published to GitHub when the
  owner says go. All commits authored by the repo owner, no AI attribution.

## Success criteria (v1)

1. A screenshot saved to the watched Desktop shows up in the review tray
   within seconds, proposed into the right folder, and lands there on
   approval — with the dot animation on the canvas.
2. Undo restores any move exactly.
3. With Ollama absent, the app still sorts rule-matched files and routes the
   rest to `unsure` without errors.
4. Repo is publishable: license, README + gif, CI green, `pnpm i && pnpm dev`
   works from a fresh clone.
