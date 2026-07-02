import { describe, expect, it, vi } from "vitest";
import { OllamaGenerator, coerceSpec, specToPipeline } from "../src/generate";
import { validatePipeline } from "../src/graph";
import type { FilterConfig, MoveConfig, WatchConfig } from "../src/types";

const gifSpec = {
  watch: "~/Downloads",
  recursive: false,
  rules: [
    {
      label: "GIFs",
      extensions: [".gif"],
      namePattern: null,
      destination: "~/Desktop/GIFs",
    },
  ],
  classify: null,
};

describe("coerceSpec", () => {
  it("accepts a well-formed spec", () => {
    const spec = coerceSpec(gifSpec);
    expect(spec.watch).toBe("~/Downloads");
    expect(spec.rules).toHaveLength(1);
    expect(spec.rules[0].extensions).toEqual([".gif"]);
    expect(spec.classify).toBeUndefined();
  });

  it("normalizes extensions and defaults the watch folder", () => {
    const spec = coerceSpec({
      rules: [
        { label: "x", extensions: ["GIF", " .PnG ", ""], destination: "~/D" },
      ],
    });
    expect(spec.watch).toBe("~/Downloads");
    expect(spec.rules[0].extensions).toEqual([".gif", ".png"]);
  });

  it("drops rules without a destination or without any matcher", () => {
    const spec = coerceSpec({
      rules: [
        { label: "no dest", extensions: [".png"] },
        { label: "no matcher", destination: "~/D" },
        { label: "ok", namePattern: "*invoice*", destination: "~/Docs" },
      ],
    });
    expect(spec.rules).toHaveLength(1);
    expect(spec.rules[0].label).toBe("ok");
  });

  it("throws when nothing usable remains", () => {
    expect(() => coerceSpec({ rules: [] })).toThrow(/no usable rules/);
    expect(() => coerceSpec("not an object")).toThrow(/not a JSON object/);
  });

  it("hoists a classify block the model nested inside a rule", () => {
    // Observed llama3.2:3b failure mode: classify emitted as a rule property.
    const spec = coerceSpec({
      rules: [
        { label: "GIFs", extensions: [".gif"], destination: "~/Desktop/Memes" },
        {
          label: "Receipts",
          namePattern: "*receipt*",
          classify: {
            categories: ["Receipts"],
            destination: "~/Desktop/Receipts",
            guidance: "screenshots of purchases",
          },
        },
      ],
    });
    expect(spec.rules).toHaveLength(1); // the destination-less rule is dropped
    expect(spec.classify?.categories).toEqual(["Receipts"]);
    expect(spec.classify?.guidance).toBe("screenshots of purchases");
  });

  it("keeps a valid classify block and rejects an empty one", () => {
    const spec = coerceSpec({
      rules: [],
      classify: {
        categories: ["Memes", "School"],
        destination: "~/{category}",
      },
    });
    expect(spec.classify?.categories).toEqual(["Memes", "School"]);
    expect(() =>
      coerceSpec({
        rules: [],
        classify: { categories: [], destination: "~/x" },
      }),
    ).toThrow(/no usable rules/);
  });
});

describe("specToPipeline", () => {
  it("builds a valid watch → filter → move chain", () => {
    const pipeline = specToPipeline(coerceSpec(gifSpec));
    expect(validatePipeline(pipeline)).toEqual([]);
    const watch = pipeline.nodes.find((n) => n.kind === "watch");
    expect((watch?.config as WatchConfig).path).toBe("~/Downloads");
    expect((watch?.config as WatchConfig).scanExisting).toBe(true);
    const filter = pipeline.nodes.find((n) => n.kind === "filter");
    expect((filter?.config as FilterConfig).extensions).toEqual([".gif"]);
    const move = pipeline.nodes.find((n) => n.kind === "move");
    expect((move?.config as MoveConfig).destination).toBe("~/Desktop/GIFs");
    expect((move?.config as MoveConfig).auto).toBe(false);
  });

  it("chains multiple rules through else handles in order", () => {
    const pipeline = specToPipeline(
      coerceSpec({
        rules: [
          { label: "a", extensions: [".png"], destination: "~/A" },
          { label: "b", extensions: [".pdf"], destination: "~/B" },
        ],
      }),
    );
    expect(validatePipeline(pipeline)).toEqual([]);
    const elseEdge = pipeline.edges.find((e) => e.sourceHandle === "else");
    expect(elseEdge?.source).toBe("gen-f-0");
    expect(elseEdge?.target).toBe("gen-f-1");
    // Rows are laid out downward without overlap.
    const f0 = pipeline.nodes.find((n) => n.id === "gen-f-0");
    const f1 = pipeline.nodes.find((n) => n.id === "gen-f-1");
    expect(
      (f1?.position.y ?? 0) - (f0?.position.y ?? 0),
    ).toBeGreaterThanOrEqual(160);
  });

  it("uses the spec's distilled guidance as classify instructions", () => {
    const pipeline = specToPipeline(
      coerceSpec({
        rules: [],
        classify: {
          categories: ["Memes"],
          destination: "~/D/{category}",
          guidance: "memes are funny images",
        },
      }),
    );
    const classify = pipeline.nodes.find((n) => n.kind === "classify");
    expect((classify?.config as { instructions?: string }).instructions).toBe(
      "memes are funny images",
    );
  });

  it("omits classify instructions when the spec has no guidance", () => {
    const pipeline = specToPipeline(
      coerceSpec({
        rules: [],
        classify: { categories: ["Memes"], destination: "~/D/{category}" },
      }),
    );
    const classify = pipeline.nodes.find((n) => n.kind === "classify");
    expect(
      (classify?.config as { instructions?: string }).instructions,
    ).toBeUndefined();
  });

  it("wires every classify category into one move node", () => {
    const pipeline = specToPipeline(
      coerceSpec({
        rules: [{ label: "a", extensions: [".png"], destination: "~/A" }],
        classify: {
          categories: ["Memes", "School"],
          destination: "~/Desktop/{category}",
        },
      }),
    );
    expect(validatePipeline(pipeline)).toEqual([]);
    const catEdges = pipeline.edges.filter((e) => e.source === "gen-c");
    expect(catEdges.map((e) => e.sourceHandle).sort()).toEqual([
      "Memes",
      "School",
    ]);
    expect(new Set(catEdges.map((e) => e.target))).toEqual(new Set(["gen-mc"]));
    // The classify chain hangs off the last filter's else handle.
    const intoClassify = pipeline.edges.find((e) => e.target === "gen-c");
    expect(intoClassify?.source).toBe("gen-f-0");
    expect(intoClassify?.sourceHandle).toBe("else");
  });
});

describe("OllamaGenerator", () => {
  const ok = (body: unknown) =>
    ({
      ok: true,
      json: async () => ({ response: JSON.stringify(body) }),
    }) as Response;

  it("returns a validated pipeline from good model output", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok(gifSpec));
    const generator = new OllamaGenerator("http://x", fetchFn);
    const pipeline = await generator.generate("gifs to desktop", "m");
    expect(validatePipeline(pipeline)).toEqual([]);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("grounds the prompt in the user's base folder and existing names", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok(gifSpec));
    const generator = new OllamaGenerator("http://x", fetchFn);
    await generator.generate("gifs to desktop", "m", {
      destBase: "~/Desktop",
      existingFolders: ["~/Desktop: GIFs, School, Receipts"],
    });
    const prompt = JSON.parse(fetchFn.mock.calls[0][1].body as string)
      .prompt as string;
    expect(prompt).toContain("destinations under ~/Desktop");
    expect(prompt).toContain("~/Desktop: GIFs, School, Receipts");
  });

  it("feeds the failure back and retries on bad output", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: "not json at all" }),
      } as Response)
      .mockResolvedValueOnce(ok(gifSpec));
    const generator = new OllamaGenerator("http://x", fetchFn);
    const pipeline = await generator.generate("gifs to desktop", "m");
    expect(validatePipeline(pipeline)).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const retryPrompt = JSON.parse(fetchFn.mock.calls[1][1].body as string)
      .prompt as string;
    expect(retryPrompt).toMatch(/previous reply was rejected/i);
  });

  it("gives up after maxAttempts with a helpful error", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "{}" }),
    } as Response);
    const generator = new OllamaGenerator("http://x", fetchFn, 1000, 2);
    await expect(generator.generate("nonsense", "m")).rejects.toThrow(
      /could not produce a valid pipeline/,
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("surfaces an unreachable Ollama clearly", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 } as Response);
    const generator = new OllamaGenerator("http://x", fetchFn);
    await expect(generator.generate("x", "m")).rejects.toThrow(/ollama/i);
  });
});
