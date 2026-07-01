import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index";

describe("engine package", () => {
  it("exports a version", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
