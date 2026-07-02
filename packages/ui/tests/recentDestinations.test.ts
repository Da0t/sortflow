import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  buildChips,
  mergeMany,
  mergeRecents,
} from "../src/lib/recentDestinations";

describe("mergeRecents", () => {
  it("prepends a new entry at position 0", () => {
    const result = mergeRecents(["~/Documents"], "~/Pictures");
    expect(result[0]).toBe("~/Pictures");
  });

  it("moves an existing entry to front (MRU)", () => {
    const result = mergeRecents(["~/Documents", "~/Pictures"], "~/Documents");
    expect(result).toEqual(["~/Documents", "~/Pictures"]);
  });

  it("caps at 6 by default", () => {
    const existing = ["a", "b", "c", "d", "e", "f"];
    const result = mergeRecents(existing, "g");
    expect(result).toHaveLength(6);
    expect(result[0]).toBe("g");
  });

  it("respects custom cap", () => {
    const result = mergeRecents(["a", "b", "c"], "d", 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("d");
  });

  it("deduplicates: entry already at front stays at front", () => {
    const result = mergeRecents(["~/Pictures", "~/Documents"], "~/Pictures");
    expect(result[0]).toBe("~/Pictures");
    expect(result.filter((x) => x === "~/Pictures")).toHaveLength(1);
  });
});

describe("mergeMany", () => {
  it("merges multiple entries in order (last wins MRU)", () => {
    const result = mergeMany([], ["~/A", "~/B", "~/C"]);
    expect(result[0]).toBe("~/C");
  });

  it("deduplicates across multiple new entries", () => {
    const result = mergeMany(["~/A"], ["~/A", "~/B"]);
    expect(result.filter((x) => x === "~/A")).toHaveLength(1);
  });
});

describe("buildChips", () => {
  it("returns recents first, then defaults, deduped, max 6", () => {
    const chips = buildChips(["~/Pictures"], DEFAULTS);
    expect(chips[0]).toBe("~/Pictures");
    expect(chips).toContain("~/Documents");
    expect(chips.length).toBeLessThanOrEqual(6);
  });

  it("does not duplicate a recent that is also a default", () => {
    const chips = buildChips(["~/Documents"], DEFAULTS);
    expect(chips.filter((x) => x === "~/Documents")).toHaveLength(1);
  });

  it("works with empty recents: returns defaults", () => {
    const chips = buildChips([], DEFAULTS);
    expect(chips).toEqual(DEFAULTS.slice(0, 6));
  });
});

describe("DEFAULTS", () => {
  it("contains the four standard folders", () => {
    expect(DEFAULTS).toContain("~/Documents");
    expect(DEFAULTS).toContain("~/Pictures");
    expect(DEFAULTS).toContain("~/Desktop");
    expect(DEFAULTS).toContain("~/Downloads");
  });
});
