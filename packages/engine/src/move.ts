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

export interface RenameContext {
  stem: string;
  fileDate: Date;
  moveDate: Date;
}

const ILLEGAL_CHARS = /[/\\:*?"<>|]/g;
const LEADING_DOTS = /^\.+/;

export function expandRename(pattern: string, ctx: RenameContext): string {
  const fileYYYY = String(ctx.fileDate.getFullYear());
  const fileMM = String(ctx.fileDate.getMonth() + 1).padStart(2, "0");
  const fileDD = String(ctx.fileDate.getDate()).padStart(2, "0");
  const yyyy = String(ctx.moveDate.getFullYear());
  const mm = String(ctx.moveDate.getMonth() + 1).padStart(2, "0");
  const dd = String(ctx.moveDate.getDate()).padStart(2, "0");

  let result = pattern
    .replaceAll("{name}", ctx.stem)
    .replaceAll("{fileYYYY}", fileYYYY)
    .replaceAll("{fileMM}", fileMM)
    .replaceAll("{fileDD}", fileDD)
    .replaceAll("{YYYY}", yyyy)
    .replaceAll("{MM}", mm)
    .replaceAll("{DD}", dd);

  // Sanitize: strip illegal chars, leading dots, trim
  result = result.replace(ILLEGAL_CHARS, "").replace(LEADING_DOTS, "").trim();

  return result.length > 0 ? result : ctx.stem;
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
