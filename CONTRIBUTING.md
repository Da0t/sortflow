# Contributing to Sortflow

- `pnpm install`, then the three gates CI runs: `pnpm check` (Biome lint +
  format), `pnpm typecheck` (tsc in every package), and `pnpm -r test`
  (vitest in engine + ui).
- Engine changes require tests — the engine is TDD'd; look at
  `packages/engine/tests/` for the house style (temp dirs for filesystem
  behavior, injected `fetchFn` for anything Ollama-shaped).
- The UI ↔ app contract is `SortflowApi` in `packages/ui/src/bridge.ts`;
  if you change it, update `packages/app/src/preload.ts` and `ipc.ts` in the
  same PR, and extend the browser mock so `pnpm --filter @sortflow/ui dev`
  still works without Electron.
- Safety invariants that must never regress: journal-before-move, full undo,
  review-before-move unless a node is `auto` (folders are never auto-moved),
  no overwrites (collision suffixes), no permanent deletes — the only
  deletion anywhere is the Files page's explicit, user-confirmed move to the
  macOS Trash. The classify queue stays serialized with a cooldown.
- Each package has a README with a module map — keep it truthful when you
  add or move files.
