import { open } from "node:fs/promises";
import type { ClassifyConfig, IncomingFile } from "./types";

export const UNSURE = "unsure";

const TEXT_EXTS = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".log",
  ".ts",
  ".js",
  ".py",
  ".html",
  ".css",
]);
const SNIPPET_BYTES = 1024;

export interface Classifier {
  classify(file: IncomingFile, cfg: ClassifyConfig): Promise<string>;
}

async function readSnippet(path: string): Promise<string> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(SNIPPET_BYTES);
    const { bytesRead } = await fh.read(buf, 0, SNIPPET_BYTES, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await fh.close();
  }
}

export class OllamaClassifier implements Classifier {
  constructor(
    private baseUrl = "http://127.0.0.1:11434",
    private fetchFn: typeof fetch = fetch,
  ) {}

  async ping(): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async classify(file: IncomingFile, cfg: ClassifyConfig): Promise<string> {
    try {
      const snippet = TEXT_EXTS.has(file.ext)
        ? await readSnippet(file.path)
        : "";
      const prompt = [
        "Classify this file into exactly one category.",
        `Categories: ${cfg.categories.join(", ")}`,
        `Filename: ${file.name}`,
        snippet ? `Content (first 1KB):\n${snippet}` : "",
        'Reply with JSON: {"category": "<one of the categories, or unsure>"}',
      ]
        .filter(Boolean)
        .join("\n");
      const res = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          format: "json",
          options: { temperature: 0 },
        }),
      });
      if (!res.ok) return UNSURE;
      const data = (await res.json()) as { message?: { content?: string } };
      const parsed = JSON.parse(data.message?.content ?? "{}") as {
        category?: string;
      };
      return parsed.category && cfg.categories.includes(parsed.category)
        ? parsed.category
        : UNSURE;
    } catch {
      return UNSURE;
    }
  }
}
