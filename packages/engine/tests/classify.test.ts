import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OllamaClassifier, UNSURE } from "../src/classify";
import type { ClassifyConfig, IncomingFile } from "../src/types";

const cfg: ClassifyConfig = {
  categories: ["School", "Receipts"],
  model: "llama3.2:3b",
};

function ollamaOk(category: string) {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({ message: { content: JSON.stringify({ category }) } }),
        { status: 200 },
      ),
  ) as unknown as typeof fetch;
}

async function tempFile(name: string, content: string): Promise<IncomingFile> {
  const dir = await mkdtemp(join(tmpdir(), "sortflow-classify-"));
  const path = join(dir, name);
  await writeFile(path, content);
  const ext = name.includes(".") ? `.${name.split(".").pop()}` : "";
  return {
    path,
    name,
    ext: ext.toLowerCase(),
    bytes: content.length,
    mtimeMs: 0,
  };
}

describe("OllamaClassifier", () => {
  it("returns the category Ollama picked", async () => {
    const fetchFn = ollamaOk("Receipts");
    const c = new OllamaClassifier("http://127.0.0.1:11434", fetchFn);
    expect(await c.classify(await tempFile("scan.pdf", ""), cfg)).toBe(
      "Receipts",
    );
  });

  it("includes a content snippet for text files in the prompt", async () => {
    const fetchFn = ollamaOk("School");
    const c = new OllamaClassifier("http://127.0.0.1:11434", fetchFn);
    await c.classify(await tempFile("notes.md", "CSE 101 homework notes"), cfg);
    const body = JSON.parse(
      (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.messages[0].content).toContain("CSE 101 homework notes");
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0);
  });

  it("omits snippets for non-text files", async () => {
    const fetchFn = ollamaOk("School");
    const c = new OllamaClassifier("http://127.0.0.1:11434", fetchFn);
    await c.classify(await tempFile("photo.jpg", "BINARYJUNK"), cfg);
    const body = JSON.parse(
      (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.messages[0].content).not.toContain("BINARYJUNK");
  });

  it("returns unsure for a category outside the list", async () => {
    const c = new OllamaClassifier("http://127.0.0.1:11434", ollamaOk("Taxes"));
    expect(await c.classify(await tempFile("x.pdf", ""), cfg)).toBe(UNSURE);
  });

  it("returns unsure when fetch rejects (Ollama not running)", async () => {
    const failing = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const c = new OllamaClassifier("http://127.0.0.1:11434", failing);
    expect(await c.classify(await tempFile("x.pdf", ""), cfg)).toBe(UNSURE);
  });

  it("returns unsure on non-200 responses and bad JSON", async () => {
    const c500 = new OllamaClassifier(
      "http://x",
      vi.fn(
        async () => new Response("", { status: 500 }),
      ) as unknown as typeof fetch,
    );
    expect(await c500.classify(await tempFile("x.pdf", ""), cfg)).toBe(UNSURE);
    const cBad = new OllamaClassifier(
      "http://x",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: { content: "not json" } }), {
            status: 200,
          }),
      ) as unknown as typeof fetch,
    );
    expect(await cBad.classify(await tempFile("x.pdf", ""), cfg)).toBe(UNSURE);
  });

  it("ping reports reachability", async () => {
    const up = new OllamaClassifier(
      "http://x",
      vi.fn(
        async () => new Response("{}", { status: 200 }),
      ) as unknown as typeof fetch,
    );
    expect(await up.ping()).toBe(true);
    const down = new OllamaClassifier(
      "http://x",
      vi.fn(async () => {
        throw new Error("refused");
      }) as unknown as typeof fetch,
    );
    expect(await down.ping()).toBe(false);
  });
});
