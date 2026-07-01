import { access, appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { JournalEntry } from "./types";

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export class Journal {
  constructor(private filePath: string) {}

  async append(entry: JournalEntry): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async readAll(): Promise<JournalEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      return [];
    }
    const entries: JournalEntry[] = [];
    for (const line of raw.split("\n").filter(Boolean)) {
      try {
        entries.push(JSON.parse(line) as JournalEntry);
      } catch {
        // Skip malformed / truncated lines (crash artifacts)
      }
    }
    return entries;
  }

  async latestById(): Promise<Map<string, JournalEntry>> {
    const map = new Map<string, JournalEntry>();
    for (const e of await this.readAll()) map.set(e.id, e);
    return map;
  }

  /** Resolve moves that crashed between 'intent' and 'done'. Never lies: checks the disk. */
  async reconcile(now: number): Promise<JournalEntry[]> {
    const corrections: JournalEntry[] = [];
    for (const e of (await this.latestById()).values()) {
      if (e.status !== "intent") continue;
      const done = await fileExists(e.to);
      const fixed: JournalEntry = {
        ...e,
        ts: now,
        status: done ? "done" : "failed",
      };
      await this.append(fixed);
      corrections.push(fixed);
    }
    return corrections;
  }
}
