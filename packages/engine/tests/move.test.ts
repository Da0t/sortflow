import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandDestination, uniqueDestination } from "../src/move";

describe("expandDestination", () => {
  const ctx = {
    category: "Receipts",
    date: new Date(2026, 6, 1),
    ext: ".pdf",
    home: "/Users/dat",
  };

  it("expands all tokens", () => {
    expect(expandDestination("~/Docs/{category}/{YYYY}-{MM}/{ext}", ctx)).toBe(
      "/Users/dat/Docs/Receipts/2026-07/pdf",
    );
  });

  it("falls back to Unsorted when no category", () => {
    expect(
      expandDestination("~/Docs/{category}", { ...ctx, category: undefined }),
    ).toBe("/Users/dat/Docs/Unsorted");
  });

  it("leaves paths without tokens or tilde untouched", () => {
    expect(expandDestination("/data/inbox", ctx)).toBe("/data/inbox");
  });
});

describe("expandDestination — file-date tokens", () => {
  const ctx = {
    category: "Shots",
    date: new Date(2026, 6, 1), // 2026-07-01 (the move date)
    ext: ".png",
    home: "/Users/dat",
    fileDate: new Date(2024, 2, 15), // 2024-03-15 (the file's own date)
  };

  it("expands {fileYYYY}/{fileMM}/{fileDD} from fileDate", () => {
    expect(expandDestination("~/Pics/{fileYYYY}/{fileMM}/{fileDD}", ctx)).toBe(
      "/Users/dat/Pics/2024/03/15",
    );
  });

  it("falls back to date when fileDate is absent", () => {
    const noDate = { ...ctx, fileDate: undefined };
    expect(
      expandDestination("~/Pics/{fileYYYY}-{fileMM}-{fileDD}", noDate),
    ).toBe("/Users/dat/Pics/2026-07-01");
  });

  it("mixed template: {fileYYYY} uses fileDate, {MM} uses date", () => {
    expect(expandDestination("~/Pics/{fileYYYY}/{MM}", ctx)).toBe(
      "/Users/dat/Pics/2024/07",
    );
  });
});

describe("uniqueDestination", () => {
  it("returns dir/name when free, then suffixes (1), (2)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sortflow-"));
    expect(await uniqueDestination(dir, "report.pdf")).toBe(
      join(dir, "report.pdf"),
    );
    await writeFile(join(dir, "report.pdf"), "x");
    expect(await uniqueDestination(dir, "report.pdf")).toBe(
      join(dir, "report (1).pdf"),
    );
    await writeFile(join(dir, "report (1).pdf"), "x");
    expect(await uniqueDestination(dir, "report.pdf")).toBe(
      join(dir, "report (2).pdf"),
    );
  });
});
