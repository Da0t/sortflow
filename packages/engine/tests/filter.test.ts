import { describe, expect, it } from "vitest";
import { globToRegExp, matchesFilter } from "../src/filter";
import type { IncomingFile } from "../src/types";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function file(over: Partial<IncomingFile> = {}): IncomingFile {
  return {
    path: "/in/Report Final.PDF",
    name: "Report Final.PDF",
    ext: ".pdf",
    bytes: 5_000,
    mtimeMs: NOW - DAY,
    ...over,
  };
}

describe("globToRegExp", () => {
  it("matches * and ? case-insensitively and anchors the pattern", () => {
    expect(
      globToRegExp("Screenshot*.png").test(
        "screenshot 2026-06-30.PNG".replace(".PNG", ".png"),
      ),
    ).toBe(true);
    expect(globToRegExp("IMG_????.jpg").test("IMG_1234.jpg")).toBe(true);
    expect(globToRegExp("IMG_????.jpg").test("IMG_12345.jpg")).toBe(false);
    expect(globToRegExp("*.pdf").test("a.pdf.exe")).toBe(false);
  });
});

describe("matchesFilter", () => {
  it("empty config matches everything", () => {
    expect(matchesFilter(file(), {}, NOW)).toBe(true);
  });

  it("matches extensions case-insensitively", () => {
    expect(matchesFilter(file(), { extensions: [".PDF"] }, NOW)).toBe(true);
    expect(matchesFilter(file(), { extensions: [".png"] }, NOW)).toBe(false);
  });

  it("matches name globs", () => {
    expect(matchesFilter(file(), { namePattern: "Report*" }, NOW)).toBe(true);
    expect(matchesFilter(file(), { namePattern: "Invoice*" }, NOW)).toBe(false);
  });

  it("matches raw regex when regex=true", () => {
    expect(
      matchesFilter(
        file(),
        { namePattern: "^report\\s+final", regex: true },
        NOW,
      ),
    ).toBe(true);
  });

  it("enforces size bounds", () => {
    expect(matchesFilter(file(), { minBytes: 10_000 }, NOW)).toBe(false);
    expect(matchesFilter(file(), { maxBytes: 1_000 }, NOW)).toBe(false);
    expect(
      matchesFilter(file(), { minBytes: 1_000, maxBytes: 10_000 }, NOW),
    ).toBe(true);
  });

  it("enforces age bounds from mtime", () => {
    expect(matchesFilter(file(), { minAgeDays: 2 }, NOW)).toBe(false);
    expect(matchesFilter(file(), { maxAgeDays: 2 }, NOW)).toBe(true);
    expect(
      matchesFilter(file({ mtimeMs: NOW - 10 * DAY }), { maxAgeDays: 2 }, NOW),
    ).toBe(false);
  });
});
