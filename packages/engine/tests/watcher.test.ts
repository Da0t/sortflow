import { appendFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { IncomingFile } from "../src/types";
import { FolderWatcher } from "../src/watcher";

const FAST = { stabilityThreshold: 200, pollInterval: 50 };
let watcher: FolderWatcher | undefined;

afterEach(async () => {
  await watcher?.close();
  watcher = undefined;
});

function collect(): {
  events: Array<{ nodeId: string; file: IncomingFile }>;
  watcher: FolderWatcher;
} {
  const events: Array<{ nodeId: string; file: IncomingFile }> = [];
  watcher = new FolderWatcher(
    (nodeId, file) => events.push({ nodeId, file }),
    FAST,
  );
  return { events, watcher };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("FolderWatcher: folders", () => {
  it("emits top-level folders when includeFolders is on — not the root, not nested", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sortflow-watch-"));
    const { events, watcher } = collect();
    watcher.watch("w1", { path: dir, recursive: false, includeFolders: true });
    await sleep(300);

    await mkdir(join(dir, "Project Alpha", "nested"), { recursive: true });
    await sleep(800);

    const dirs = events.filter((e) => e.file.isDirectory);
    expect(dirs).toHaveLength(1);
    expect(dirs[0].file.name).toBe("Project Alpha");
    expect(dirs[0].file.ext).toBe("");
    expect(dirs[0].file.path).toBe(join(dir, "Project Alpha"));
  }, 10_000);

  it("ignores folders entirely when includeFolders is off", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sortflow-watch-"));
    const { events, watcher } = collect();
    watcher.watch("w1", { path: dir, recursive: false });
    await sleep(300);

    await mkdir(join(dir, "SomeFolder"));
    await sleep(800);

    expect(events.filter((e) => e.file.isDirectory)).toHaveLength(0);
  }, 10_000);
});

describe("FolderWatcher", () => {
  it("emits one event per new file, after the file stabilizes, with metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sortflow-watch-"));
    const { events, watcher } = collect();
    watcher.watch("w1", { path: dir, recursive: false });
    await sleep(300); // let chokidar initialize

    await writeFile(join(dir, "incoming.txt"), "part1-");
    await sleep(100); // still inside the stability window
    await appendFile(join(dir, "incoming.txt"), "part2");
    await sleep(800); // stability threshold passes

    expect(events).toHaveLength(1);
    expect(events[0].nodeId).toBe("w1");
    expect(events[0].file.name).toBe("incoming.txt");
    expect(events[0].file.ext).toBe(".txt");
    expect(events[0].file.bytes).toBe("part1-part2".length);
  }, 10_000);

  it("ignores files in subdirectories when recursive is false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sortflow-watch-"));
    await mkdir(join(dir, "sub"));
    const { events, watcher } = collect();
    watcher.watch("w1", { path: dir, recursive: false });
    await sleep(300);

    await writeFile(join(dir, "sub", "deep.txt"), "x");
    await sleep(800);

    expect(events).toHaveLength(0);
  }, 10_000);

  it("ignores files that existed before watching started", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sortflow-watch-"));
    await writeFile(join(dir, "old.txt"), "x");
    const { events, watcher } = collect();
    watcher.watch("w1", { path: dir, recursive: false });
    await sleep(600);

    expect(events).toHaveLength(0);
  }, 10_000);

  it("emits pre-existing files when scanExisting is true", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sortflow-watch-"));
    await writeFile(join(dir, "old.txt"), "x");
    const { events, watcher } = collect();
    watcher.watch("w1", { path: dir, recursive: false, scanExisting: true });
    await sleep(800); // stability threshold passes

    expect(events).toHaveLength(1);
    expect(events[0].file.name).toBe("old.txt");
  }, 10_000);
});
