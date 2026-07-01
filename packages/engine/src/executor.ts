import { copyFile, mkdir, rename, unlink } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { Journal } from "./journal";
import { uniqueDestination } from "./move";
import type { JournalEntry } from "./types";

export interface MoveRequest {
  id: string;
  from: string;
  toDir: string;
  moveNodeId: string;
}

export interface ExecOptions {
  retries?: number;
  backoffMs?: number;
  renameFn?: (from: string, to: string) => Promise<void>;
  now?: () => number;
}

const RETRYABLE = new Set(["EBUSY", "EPERM", "EACCES", "ETXTBSY"]);

export class MoveFailedError extends Error {
  constructor(
    public entry: JournalEntry,
    cause: unknown,
  ) {
    super(`move failed: ${entry.from} -> ${entry.to}: ${String(cause)}`);
  }
}

async function moveWithFallback(
  from: string,
  to: string,
  renameFn?: ExecOptions["renameFn"],
): Promise<void> {
  try {
    await (renameFn ?? rename)(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      await copyFile(from, to);
      await unlink(from);
    } else {
      throw err;
    }
  }
}

export async function executeMove(
  req: MoveRequest,
  journal: Journal,
  opts: ExecOptions = {},
): Promise<JournalEntry> {
  const { retries = 3, backoffMs = 250, now = Date.now } = opts;
  await mkdir(req.toDir, { recursive: true });
  const to = await uniqueDestination(req.toDir, basename(req.from));
  const base = { id: req.id, from: req.from, to, moveNodeId: req.moveNodeId };
  await journal.append({ ...base, ts: now(), status: "intent" });
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await moveWithFallback(req.from, to, opts.renameFn);
      const done: JournalEntry = { ...base, ts: now(), status: "done" };
      await journal.append(done);
      return done;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!RETRYABLE.has(code) || attempt === retries) break;
      await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
    }
  }
  const failed: JournalEntry = { ...base, ts: now(), status: "failed" };
  await journal.append(failed);
  throw new MoveFailedError(failed, lastErr);
}

export async function undoMove(
  entryId: string,
  journal: Journal,
  opts: ExecOptions = {},
): Promise<JournalEntry> {
  const { now = Date.now } = opts;
  const latest = (await journal.latestById()).get(entryId);
  if (!latest || latest.status !== "done") {
    throw new Error(`cannot undo ${entryId}: no completed move found`);
  }
  const backTo = await uniqueDestination(
    dirname(latest.from),
    basename(latest.from),
  );
  await moveWithFallback(latest.to, backTo, opts.renameFn);
  const undone: JournalEntry = { ...latest, ts: now(), status: "undone" };
  await journal.append(undone);
  return undone;
}
