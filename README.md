# Sortflow

**Visual, node-based smart file organizer.** Watch your Downloads and Desktop,
wire up filters and a local-AI classifier on a canvas, review proposed moves in
one click, undo anything. Free, offline, MIT-licensed.

<!-- demo gif goes here: record with the pipeline sorting a screenshot -->

## Why

- **The graph IS the rules.** No config files — drag Watch → Filter → AI
  Classify → Move nodes and connect them.
- **Not overbearing.** New files become *proposals* in a review tray; nothing
  moves until you approve. Rules you approve 10× in a row can go automatic.
- **Local AI, no API keys.** Ambiguous files are classified by
  [Ollama](https://ollama.com) on your machine. No Ollama? Everything still
  works — unclassified files just route to `unsure`.
- **Safe by construction.** Journal-first moves, no deletes, no overwrites,
  full undo. Event-driven watching: ~0% CPU at idle.

## Install

Download the latest `.dmg` from Releases, or build from source:

```bash
git clone https://github.com/Da0t/sortflow && cd sortflow
pnpm install
pnpm --filter @sortflow/ui dev      # terminal 1
pnpm --filter @sortflow/app dev     # terminal 2
```

Optional AI classification: `brew install ollama && ollama pull llama3.2:3b`

## Architecture

pnpm monorepo: `packages/engine` (pure TS: watching, routing, journal, undo —
fully unit-tested) · `packages/ui` (React + React Flow editor) ·
`packages/app` (Electron shell + typed IPC). See
`docs/superpowers/specs/` for the full design, including the v2 roadmap
(embedding-based category suggestions from the unsure pile).

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm test` must pass.

## License

MIT © Dat Nguyen
