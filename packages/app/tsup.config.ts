import { defineConfig } from "tsup";

// tsup's CLI has no `--noExternal` flag, so the engine force-bundle lives here.
// electron stays external (provided by the runtime); @sortflow/engine is bundled
// into dist/main.js so a packaged app never tries to require the workspace source.
// chokidar is a real app dependency and stays external (a plain require is fine).
export default defineConfig({
  entry: ["src/main.ts", "src/preload.ts"],
  format: ["cjs"],
  outDir: "dist",
  external: ["electron"],
  noExternal: ["@sortflow/engine"],
});
