import { access } from "node:fs/promises";
import { join, parse } from "node:path";

export interface DestContext {
  category?: string;
  date: Date;
  ext: string; // with dot
  home: string;
  fileDate?: Date; // file's own creation/modification date; falls back to date when absent
}

export function expandDestination(template: string, ctx: DestContext): string {
  let out = template;
  if (out.startsWith("~")) out = ctx.home + out.slice(1);
  const yyyy = String(ctx.date.getFullYear());
  const mm = String(ctx.date.getMonth() + 1).padStart(2, "0");
  const src = ctx.fileDate ?? ctx.date;
  const fileYYYY = String(src.getFullYear());
  const fileMM = String(src.getMonth() + 1).padStart(2, "0");
  const fileDD = String(src.getDate()).padStart(2, "0");
  return out
    .replaceAll("{YYYY}", yyyy)
    .replaceAll("{MM}", mm)
    .replaceAll("{fileYYYY}", fileYYYY)
    .replaceAll("{fileMM}", fileMM)
    .replaceAll("{fileDD}", fileDD)
    .replaceAll("{ext}", ctx.ext.replace(/^\./, ""))
    .replaceAll("{category}", ctx.category ?? "Unsorted");
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function uniqueDestination(
  destDir: string,
  fileName: string,
): Promise<string> {
  const { name, ext } = parse(fileName);
  let candidate = join(destDir, fileName);
  for (let i = 1; await exists(candidate); i++) {
    candidate = join(destDir, `${name} (${i})${ext}`);
  }
  return candidate;
}
