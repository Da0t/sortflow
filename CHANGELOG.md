# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-02

First public release of Sortflow, an open-source visual file organizer for macOS built on Electron, React Flow, and local AI via Ollama.

### Added

- Visual pipeline editor: a React Flow canvas with custom Watch, Filter, Classify, and Move nodes, a draggable node palette, removable connections with easy handle snapping, and a config panel with save/validation feedback and a visible Delete-node button.
- Sorting engine: filter nodes with glob and file-age matching, destination templates with collision-safe paths, and per-file routing through filters and the classifier.
- Safe file moves: an append-only journal with crash reconciliation and a journal-first move executor with retry and undo, so no move is ever lost or overwrites an existing file.
- Folder watching via chokidar with a write-stability guard, plus an optional sweep that sorts files already in a folder when a watch is added.
- Local AI classification through a pluggable classifier backed by Ollama, with a serialized classify queue, cooldown throttling, free-text guidance on Classify nodes, and warning badges with an auto-promotion offer.
- Review workflow: a persistent proposal store with approval streaks, a review tray and history panel with undo and bulk undo, rename-at-review, reject-all, and the ability to restore rejected proposals.
- Auto Setup: scans one or more folders and drafts a suggested pipeline using a research-based file taxonomy; pipelines can also be drafted from natural-language descriptions via local Ollama, grounded in the user's real folders.
- Pipeline library: multiple pipelines with tabs, per-pipeline enable flags, graph merging, pipeline preview, a sort-into base folder, and overlap warnings between pipelines.
- Date-aware sorting: file-date tokens in destination templates, age-based filters, and a one-click chip that groups a move destination by file date.
- File renaming: rename patterns on Move nodes and manual renames at review time.
- Folder-as-unit sorting, letting the AI judge and move whole folders instead of individual files.
- Files page: a drag-and-drop manual file mover presented as a click-to-cascade column trail with multiple open branches, plus folder browsing, create/trash directories, file-kind visibility toggles, per-folder hiding, and Finder drag-and-drop with recent-destination chips.
- Desktop app: an Electron shell with a typed IPC bridge between engine and UI, a menu-bar tray app, DMG packaging, an app icon, CI with a typecheck gate, and public documentation including a first-pipeline walkthrough, architecture diagrams, and a professional README set.
- Quality-of-life touches: an unsaved-changes nudge, a macOS permissions health check, and folder-tree drag targets.

### Changed

- Refreshed the entire UI with a reactflow.dev-inspired design system: design tokens, SVG icons, refined spacing, a scrollable palette with collapsible sections, and a graph focus mode for a larger canvas.
- Settled edge styling on smooth bezier connectors with a travelling flow dot after iterating through dashed, solid, and smoothstep variants.
- Evolved the Files page through several layouts (node tree, connected tree, branching diagram, hover-peek bubbles) into its final centered cascade design with reliable dragging and aligned outline geometry.

### Fixed

- Serialized file moves so concurrent operations can never violate the never-overwrite guarantee.
- Made routing, watching, classification, and undo failure-safe, and ensured a file can never be queued twice.
- Pending proposals now follow pipeline edits instead of staying frozen on the old graph.
- Move and watch failures are surfaced in the UI, tray state stays fresh, and engine-restart failures from Save & Apply are reported as readable problems.
- App packaging is installable and self-contained from a fresh clone, with Electron pointed at the correct build output.
- CI derives its pnpm version from the repository's packageManager field.
- Auto Setup lays out generated pipeline rows by estimated node height to avoid overlapping nodes.
- Files page polish: loading and empty states under expanded folders, the left pane rooted at Home, and a lint-clean reload effect.
