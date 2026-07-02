import { estimateRowHeight } from "./autosetup";
import { validatePipeline } from "./graph";
import type { Pipeline } from "./types";

/**
 * What the local model fills in: a flat, ordered rule list — deliberately
 * NOT a node graph. specToPipeline() builds the graph deterministically,
 * which a 3B model cannot be trusted to do.
 */
export interface GeneratedRule {
  label: string;
  extensions?: string[];
  /** Glob (engine default), e.g. "*invoice*". Never treated as regex. */
  namePattern?: string;
  destination: string;
}

export interface GeneratedSpec {
  watch: string;
  recursive?: boolean;
  rules: GeneratedRule[];
  /** Only for requests needing judgment beyond extensions/names. `guidance`
   * is a distilled one-liner for the classifier — NOT the whole request. */
  classify?: { categories: string[]; destination: string; guidance?: string };
}

/** Grounding for the model so drafts match how the user already organizes. */
export interface GenerateContext {
  /** Preferred destination base, e.g. "~/Desktop". */
  destBase?: string;
  /** Existing folder listings, e.g. "~/Desktop: GIFs, School, Receipts". */
  existingFolders?: string[];
}

/** Normalize ".GIF"/"gif" → ".gif"; drop empties. */
function normalizeExtensions(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const exts = raw
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .map((e) => (e.startsWith(".") ? e : `.${e}`));
  return exts.length > 0 ? exts : undefined;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Coerce untrusted model output into a GeneratedSpec or throw with a
 * message the retry prompt can feed back. */
export function coerceSpec(raw: unknown): GeneratedSpec {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("output is not a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const watch = str(o.watch) ?? "~/Downloads";
  const rulesRaw = Array.isArray(o.rules) ? o.rules : [];
  const rules: GeneratedRule[] = [];
  for (const r of rulesRaw) {
    if (typeof r !== "object" || r === null) continue;
    const rule = r as Record<string, unknown>;
    const destination = str(rule.destination);
    if (!destination) continue; // a rule without a destination does nothing
    const extensions = normalizeExtensions(rule.extensions);
    const namePattern = str(rule.namePattern);
    if (!extensions && !namePattern) continue; // would match everything
    rules.push({
      label: str(rule.label) ?? `Rule ${rules.length + 1}`,
      extensions,
      namePattern,
      destination,
    });
  }
  // Small models sometimes nest the classify block inside a rule instead of
  // at the top level — hoist the first one found so the intent isn't lost.
  const classifyRaw =
    typeof o.classify === "object" && o.classify !== null
      ? o.classify
      : rulesRaw
          .map((r) =>
            typeof r === "object" && r !== null
              ? (r as Record<string, unknown>).classify
              : undefined,
          )
          .find((c) => typeof c === "object" && c !== null);
  let classify: GeneratedSpec["classify"];
  if (typeof classifyRaw === "object" && classifyRaw !== null) {
    const c = classifyRaw as Record<string, unknown>;
    const categories = Array.isArray(c.categories)
      ? c.categories
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
    const destination = str(c.destination);
    if (categories.length > 0 && destination) {
      classify = { categories, destination, guidance: str(c.guidance) };
    }
  }
  if (rules.length === 0 && !classify) {
    throw new Error(
      "no usable rules: each rule needs a destination plus extensions or a namePattern",
    );
  }
  return { watch, recursive: o.recursive === true, rules, classify };
}

/**
 * Build the actual graph from a spec: watch → filter chain (match → move,
 * else → next), with an optional classify node at the end of the chain whose
 * category handles all feed one move node (its destination usually contains
 * {category}).
 */
export function specToPipeline(spec: GeneratedSpec): Pipeline {
  const nodes: Pipeline["nodes"] = [
    {
      id: "gen-w",
      kind: "watch",
      config: {
        path: spec.watch,
        recursive: spec.recursive ?? false,
        scanExisting: true,
      },
      position: { x: 40, y: 200 },
    },
  ];
  const edges: Pipeline["edges"] = [];
  let edgeN = 0;
  let y = 60;
  let prevSource = "gen-w";
  let prevHandle = "out";

  spec.rules.forEach((rule, i) => {
    const fId = `gen-f-${i}`;
    const mId = `gen-m-${i}`;
    nodes.push({
      id: fId,
      kind: "filter",
      config: {
        extensions: rule.extensions ?? [],
        ...(rule.namePattern ? { namePattern: rule.namePattern } : {}),
      },
      position: { x: 340, y },
    });
    nodes.push({
      id: mId,
      kind: "move",
      config: { destination: rule.destination, auto: false },
      position: { x: 660, y },
    });
    edges.push({
      id: `gen-e-${edgeN++}`,
      source: prevSource,
      sourceHandle: prevHandle,
      target: fId,
    });
    edges.push({
      id: `gen-e-${edgeN++}`,
      source: fId,
      sourceHandle: "match",
      target: mId,
    });
    prevSource = fId;
    prevHandle = "else";
    y += estimateRowHeight({
      extensions: rule.extensions ?? [],
      namePattern: rule.namePattern,
    });
  });

  if (spec.classify) {
    nodes.push({
      id: "gen-c",
      kind: "classify",
      config: {
        categories: spec.classify.categories,
        model: "llama3.2:3b",
        ...(spec.classify.guidance
          ? { instructions: spec.classify.guidance }
          : {}),
      },
      position: { x: 340, y },
    });
    nodes.push({
      id: "gen-mc",
      kind: "move",
      config: { destination: spec.classify.destination, auto: false },
      position: { x: 660, y },
    });
    edges.push({
      id: `gen-e-${edgeN++}`,
      source: prevSource,
      sourceHandle: prevHandle,
      target: "gen-c",
    });
    for (const category of spec.classify.categories) {
      edges.push({
        id: `gen-e-${edgeN++}`,
        source: "gen-c",
        sourceHandle: category,
        target: "gen-mc",
      });
    }
  }

  return { nodes, edges };
}

const PROMPT_HEADER = `You convert a file-organization request into JSON. Reply with ONLY a JSON object, no prose, matching exactly:
{"watch": "<folder to watch, e.g. ~/Downloads>",
 "recursive": false,
 "rules": [{"label": "<short name>", "extensions": [".gif"], "namePattern": null, "destination": "~/Desktop/GIFs"}],
 "classify": null}

Constraints:
- One rule per distinct instruction in the request. Never merge unrelated file types into one rule.
- Rules are checked in order; a file goes to the first rule it matches — by extensions and/or namePattern (a case-insensitive glob like "*invoice*").
- Destinations are folders; use ~/ for home-relative paths. Name new folders in Title Case, and REUSE the user's existing folders when they fit the request.
- Set "classify" (instead of null) ONLY when the request needs AI judgment beyond extensions and name patterns, as {"categories": ["Memes", "School"], "destination": "~/Desktop/{category}", "guidance": "<one sentence telling the classifier how to tell the categories apart>"}. Do not use classify for anything a rule can express.

Example request: "screenshots from Downloads go to Desktop/Screenshots, zips to Archives"
Example reply: {"watch": "~/Downloads", "recursive": false, "rules": [{"label": "Screenshots", "extensions": [".png", ".jpg", ".jpeg"], "namePattern": "*screenshot*", "destination": "~/Desktop/Screenshots"}, {"label": "Archives", "extensions": [".zip"], "namePattern": null, "destination": "~/Desktop/Archives"}], "classify": null}`;

/**
 * Ask a local Ollama model to draft a pipeline from a natural-language
 * description. Invalid output is retried with the error fed back; the
 * returned pipeline always passes validatePipeline.
 */
export class OllamaGenerator {
  constructor(
    private baseUrl = "http://127.0.0.1:11434",
    private fetchFn: typeof fetch = fetch,
    private timeoutMs = 60_000,
    private maxAttempts = 3,
  ) {}

  private async request(prompt: string, model: string): Promise<string> {
    const res = await this.fetchFn(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, format: "json", stream: false }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(
        `Ollama returned ${res.status} — is it running? (ollama serve)`,
      );
    }
    const data = (await res.json()) as { response?: string };
    return data.response ?? "";
  }

  async generate(
    description: string,
    model: string,
    context: GenerateContext = {},
  ): Promise<Pipeline> {
    const grounding = [
      context.destBase
        ? `The user prefers destinations under ${context.destBase} unless the request says otherwise.`
        : "",
      context.existingFolders?.length
        ? `The user's existing folders — reuse these exact names when they fit:\n${context.existingFolders.join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    const base = `${PROMPT_HEADER}${grounding ? `\n\n${grounding}` : ""}\n\nRequest: ${description}`;
    let prompt = base;
    let lastError = "";
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const text = await this.request(prompt, model);
      try {
        const spec = coerceSpec(JSON.parse(text));
        const pipeline = specToPipeline(spec);
        const problems = validatePipeline(pipeline);
        if (problems.length > 0) throw new Error(problems.join("; "));
        return pipeline;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        prompt = `${base}\n\nYour previous reply was rejected: ${lastError}. Reply with corrected JSON only.`;
      }
    }
    throw new Error(
      `The model could not produce a valid pipeline (${lastError}). Try rephrasing, e.g. "GIFs from Downloads go to Desktop/GIFs".`,
    );
  }
}
