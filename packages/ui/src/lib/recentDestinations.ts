export const DEFAULTS = [
  "~/Documents",
  "~/Pictures",
  "~/Desktop",
  "~/Downloads",
] as const;

const DEFAULT_CAP = 6;

/**
 * Prepend `newEntry` to `existing`, dedup (MRU), and cap the list.
 */
export function mergeRecents(
  existing: string[],
  newEntry: string,
  cap = DEFAULT_CAP,
): string[] {
  const deduped = [newEntry, ...existing.filter((x) => x !== newEntry)];
  return deduped.slice(0, cap);
}

/**
 * Merge multiple new entries sequentially (last entry becomes MRU).
 */
export function mergeMany(
  existing: string[],
  newEntries: string[],
  cap = DEFAULT_CAP,
): string[] {
  return newEntries.reduce(
    (acc, entry) => mergeRecents(acc, entry, cap),
    existing,
  );
}

/**
 * Build the chip list: recents first, then defaults not already in recents.
 * Deduped and capped at `cap`.
 */
export function buildChips(
  recents: string[],
  defaults: readonly string[] = DEFAULTS,
  cap = DEFAULT_CAP,
): string[] {
  const seen = new Set(recents);
  const extras = defaults.filter((d) => !seen.has(d));
  return [...recents, ...extras].slice(0, cap);
}
