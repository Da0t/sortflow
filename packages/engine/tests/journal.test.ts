import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Journal } from "../src/journal";
import type { JournalEntry } from "../src/types";

async function tempJournal(): Promise<{ journal: Journal; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "sortflow-journal-"));
  return { journal: new Journal(join(dir, "sub", "journal.jsonl")), dir };
}

function entry(over: Partial<JournalEntry>): JournalEntry {
  return {
    id: "a",
    ts: 1,
    from: "/in/x.txt",
    to: "/out/x.txt",
    moveNodeId: "m1",
    status: "intent",
    ...over,
  };
}

describe("Journal", () => {
  it("appends and reads back entries, creating parent dirs", async () => {
    const { journal } = await tempJournal();
    await journal.append(entry({}));
    await journal.append(entry({ status: "done", ts: 2 }));
    const all = await journal.readAll();
    expect(all).toHaveLength(2);
    expect(all[1].status).toBe("done");
  });

  it("returns [] for a missing file", async () => {
    const { journal } = await tempJournal();
    expect(await journal.readAll()).toEqual([]);
  });

  it("latestById keeps the last line per id", async () => {
    const { journal } = await tempJournal();
    await journal.append(entry({}));
    await journal.append(entry({ status: "done", ts: 2 }));
    await journal.append(entry({ id: "b", status: "intent" }));
    const latest = await journal.latestById();
    expect(latest.get("a")?.status).toBe("done");
    expect(latest.get("b")?.status).toBe("intent");
  });

  it("reconcile marks dangling intents done when the file arrived, failed when not", async () => {
    const { journal, dir } = await tempJournal();
    const arrived = join(dir, "arrived.txt");
    await writeFile(arrived, "x");
    await journal.append(entry({ id: "ok", to: arrived }));
    await journal.append(
      entry({ id: "lost", to: join(dir, "never-written.txt") }),
    );
    await journal.append(entry({ id: "fine", status: "done" }));

    const corrections = await journal.reconcile(99);
    expect(corrections.map((c) => [c.id, c.status]).sort()).toEqual([
      ["lost", "failed"],
      ["ok", "done"],
    ]);
    const latest = await journal.latestById();
    expect(latest.get("ok")?.status).toBe("done");
    expect(latest.get("lost")?.status).toBe("failed");
    expect(latest.get("fine")?.status).toBe("done");
  });
});
