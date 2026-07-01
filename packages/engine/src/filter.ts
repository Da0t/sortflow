import type { FilterConfig, IncomingFile } from "./types";

export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export function matchesFilter(
  file: IncomingFile,
  cfg: FilterConfig,
  nowMs = Date.now(),
): boolean {
  if (cfg.extensions && cfg.extensions.length > 0) {
    const wanted = cfg.extensions.map((e) => e.toLowerCase());
    if (!wanted.includes(file.ext)) return false;
  }
  if (cfg.namePattern) {
    const re = cfg.regex
      ? new RegExp(cfg.namePattern, "i")
      : globToRegExp(cfg.namePattern);
    if (!re.test(file.name)) return false;
  }
  if (cfg.minBytes !== undefined && file.bytes < cfg.minBytes) return false;
  if (cfg.maxBytes !== undefined && file.bytes > cfg.maxBytes) return false;
  const ageDays = (nowMs - file.mtimeMs) / 86_400_000;
  if (cfg.minAgeDays !== undefined && ageDays < cfg.minAgeDays) return false;
  if (cfg.maxAgeDays !== undefined && ageDays > cfg.maxAgeDays) return false;
  return true;
}
