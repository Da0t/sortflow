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
