import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import os from "node:os";
import type { FilterConfig, MoveConfig, Pipeline, WatchConfig } from "./types";

export interface BucketStat {
  key: string;
  label: string;
  count: number;
}

export interface FolderScan {
  total: number;
  buckets: BucketStat[];
}

/**
 * Canonical bucket definitions — order matters (first match wins).
 *
 * The taxonomy follows file-organization research and proven-tool consensus:
 * a small flat set of type-based categories (tools like macOS Stacks and
 * Hazel converge on 5-8; fine-grained splits become "failed folders"),
 * destinations that respect macOS default-folder semantics (~/Documents for
 * documents, subfolders of ~/Pictures — never its root — for images,
 * ~/Movies for video, ~/Music for audio), disposable byproducts (installers,
 * archives) quarantined under ~/Downloads for easy purging, and date
 * grouping only for high-volume chronological categories, zero-padded so
 * lexicographic order equals chronological order. Depth never exceeds
 * SystemFolder/Category/DateFolder.
 */
const BUCKETS: ReadonlyArray<{
  key: string;
  label: string;
  extensions: string[];
  /** When set, file name must match this regex (case-insensitive) too. */
  namePattern?: string;
  destination: string;
  /** Date-token subfolder, also applied to "Sort into" base variants. */
  dateSuffix?: string;
}> = [
  {
    key: "screenshots",
    label: "Screenshots",
    extensions: [".png", ".jpg", ".jpeg", ".heic"],
    namePattern: "^(screen ?shot|cleanshot)",
    destination: "~/Pictures/Screenshots",
    dateSuffix: "/{fileYYYY}-{fileMM}",
  },
  {
    key: "installers",
    label: "Installers",
    extensions: [".dmg", ".pkg", ".mpkg"],
    destination: "~/Downloads/Installers",
  },
  {
    key: "archives",
    label: "Archives",
    extensions: [".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".rar", ".7z"],
    destination: "~/Downloads/Archives",
  },
  {
    key: "images",
    label: "Images",
    extensions: [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".heic",
      ".webp",
      ".bmp",
      ".tiff",
      ".tif",
      ".svg",
      ".avif",
    ],
    destination: "~/Pictures/Sorted",
    dateSuffix: "/{fileYYYY}",
  },
  {
    key: "documents",
    label: "Documents",
    extensions: [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".key",
      ".pages",
      ".numbers",
      ".txt",
      ".rtf",
      ".md",
      ".csv",
      ".odt",
      ".epub",
    ],
    destination: "~/Documents/Sorted",
  },
  {
    key: "video",
    label: "Video",
    extensions: [
      ".mp4",
      ".mov",
      ".mkv",
      ".avi",
      ".webm",
      ".m4v",
      ".wmv",
      ".flv",
    ],
    destination: "~/Movies/Sorted",
    dateSuffix: "/{fileYYYY}",
  },
  {
    key: "audio",
    label: "Audio",
    extensions: [".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".aiff"],
    destination: "~/Music/Sorted",
  },
];

/**
 * Approximate rendered height of one filter+move rule row so stacked rules
 * never overlap. The filter node is the tall one: ~34px title, ~18px body
 * padding, its summary text wrapped at ~37 chars (12px font inside the
 * UI's 260px node max-width), and ~50px of match/else handle rows.
 */
export function estimateRowHeight(def: {
  extensions: string[];
  namePattern?: string;
}): number {
  const summary = [def.extensions.join(" "), def.namePattern]
    .filter(Boolean)
    .join(" · ");
  const lines = Math.max(1, Math.ceil(summary.length / 37));
  return Math.max(160, 142 + lines * 16);
}

/** Return the canonical bucket key a file belongs to (first match wins). */
function classifyFile(name: string, ext: string): string | null {
  const lowerName = name.toLowerCase();
  const lowerExt = ext.toLowerCase();
  for (const bucket of BUCKETS) {
    if (!bucket.extensions.includes(lowerExt)) continue;
    if (
      bucket.namePattern &&
      !new RegExp(bucket.namePattern, "i").test(lowerName)
    ) {
      continue;
    }
    return bucket.key;
  }
  return null;
}

/**
 * Scan the top level of dirPath, bucket files heuristically, and return stats.
 * No recursion; dotfiles and subdirectories are skipped.
 * Stops after maxFiles (default 2000) regular files examined.
 */
export async function scanFolder(
  dirPath: string,
  opts: { maxFiles?: number } = {},
): Promise<FolderScan> {
  const maxFiles = opts.maxFiles ?? 2000;
  const counts = new Map<string, number>();
  let total = 0;

  let entries: Dirent[];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return { total: 0, buckets: [] };
  }

  for (const entry of entries) {
    if (total >= maxFiles) break;
    if (entry.name.startsWith(".")) continue; // skip dotfiles
    if (!entry.isFile()) continue; // skip dirs, symlinks, etc.

    total++;
    const name = entry.name;
    const dotIdx = name.lastIndexOf(".");
    const ext = dotIdx > 0 ? name.slice(dotIdx).toLowerCase() : "";
    const key = classifyFile(name, ext);
    if (key !== null) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  // Return buckets in canonical order, only those with count > 0.
  const buckets: BucketStat[] = [];
  for (const def of BUCKETS) {
    const count = counts.get(def.key);
    if (count !== undefined && count > 0) {
      buckets.push({ key: def.key, label: def.label, count });
    }
  }

  return { total, buckets };
}

/**
 * Build a suggested Pipeline from scan results.
 *
 * Includes buckets with count >= minCount (default 5).
 * All Move nodes use `auto: false` (review-first — nothing moves until the
 * user clicks Save & Apply).
 *
 * Wire-up: watch out → first filter; each filter match → its move;
 * each filter else → next filter (last else dangles).
 *
 * `destBase` overrides each bucket's default destination with
 * `<destBase>/<bucket label>` (e.g. destBase "~/Desktop" sends screenshots
 * to ~/Desktop/Screenshots) for users who organize in one place.
 */
export function suggestPipeline(
  watchPath: string,
  scan: FolderScan,
  opts: { minCount?: number; home?: string; destBase?: string } = {},
): Pipeline {
  const minCount = opts.minCount ?? 5;
  const home = opts.home ?? os.homedir();

  const included = scan.buckets.filter((b) => b.count >= minCount);

  const watchNode = {
    id: "auto-w",
    kind: "watch" as const,
    config: {
      path: watchPath,
      recursive: false,
      scanExisting: true,
    } satisfies WatchConfig,
    position: { x: 40, y: 200 },
  };

  if (included.length === 0) {
    return { nodes: [watchNode], edges: [] };
  }

  const nodes: Pipeline["nodes"] = [watchNode];
  const edges: Pipeline["edges"] = [];
  let edgeN = 0;
  let y = 60;

  for (let i = 0; i < included.length; i++) {
    const bucket = included[i];
    const def = BUCKETS.find((b) => b.key === bucket.key);
    if (!def) continue;

    const fId = `auto-f-${bucket.key}`;
    const mId = `auto-m-${bucket.key}`;

    // Build FilterConfig for this bucket.
    const filterConfig: FilterConfig = { extensions: def.extensions };
    if (def.namePattern) {
      filterConfig.namePattern = def.namePattern;
      filterConfig.regex = true;
    }

    nodes.push({
      id: fId,
      kind: "filter" as const,
      config: filterConfig,
      position: { x: 340, y },
    });

    const rawDestination = opts.destBase
      ? `${opts.destBase.replace(/\/+$/, "")}/${def.label}`
      : def.destination;
    const destination = `${rawDestination}${def.dateSuffix ?? ""}`.replace(
      /^~/,
      home,
    );
    nodes.push({
      id: mId,
      kind: "move" as const,
      config: { destination, auto: false } satisfies MoveConfig,
      position: { x: 660, y },
    });

    // watch out -> first filter
    if (i === 0) {
      edges.push({
        id: `auto-e-${edgeN++}`,
        source: "auto-w",
        sourceHandle: "out",
        target: fId,
      });
    } else {
      // prev filter else -> this filter
      const prevFId = `auto-f-${included[i - 1].key}`;
      edges.push({
        id: `auto-e-${edgeN++}`,
        source: prevFId,
        sourceHandle: "else",
        target: fId,
      });
    }

    // filter match -> move
    edges.push({
      id: `auto-e-${edgeN++}`,
      source: fId,
      sourceHandle: "match",
      target: mId,
    });

    y += estimateRowHeight(def);
  }

  return { nodes, edges };
}
