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
