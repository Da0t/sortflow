## What & why

<!-- One or two sentences: what changes, and the problem it solves. -->

## Checklist

- [ ] `pnpm check` (Biome lint + format) passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm -r test` passes; engine changes come with engine tests
- [ ] `SortflowApi` (bridge/preload/ipc) kept in sync if the contract changed
- [ ] Safety invariants preserved: journal-before-move, review-first unless
      `auto`, no permanent deletes, no overwrites
- [ ] READMEs updated if behavior or module structure changed
