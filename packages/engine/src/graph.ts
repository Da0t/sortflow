import type {
  ClassifyConfig,
  Pipeline,
  PipelineEdge,
  PipelineNode,
} from "./types";

const OUT_HANDLES: Record<PipelineNode["kind"], (n: PipelineNode) => string[]> =
  {
    watch: () => ["out"],
    filter: () => ["match", "else"],
    classify: (n) => [...(n.config as ClassifyConfig).categories, "unsure"],
    move: () => [],
  };

export function validatePipeline(p: Pipeline): string[] {
  const problems: string[] = [];
  const byId = new Map<string, PipelineNode>();
  for (const n of p.nodes) {
    if (byId.has(n.id)) problems.push(`duplicate node id: ${n.id}`);
    byId.set(n.id, n);
  }
  const seenHandles = new Set<string>();
  for (const e of p.edges) {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src) {
      problems.push(`edge ${e.id}: unknown source ${e.source}`);
      continue;
    }
    if (!tgt) {
      problems.push(`edge ${e.id}: unknown target ${e.target}`);
      continue;
    }
    if (!OUT_HANDLES[src.kind](src).includes(e.sourceHandle)) {
      problems.push(
        `edge ${e.id}: node ${src.id} has no output '${e.sourceHandle}'`,
      );
    }
    const key = `${e.source}:${e.sourceHandle}`;
    if (seenHandles.has(key)) problems.push(`multiple edges leave ${key}`);
    seenHandles.add(key);
    if (tgt.kind === "watch")
      problems.push(`edge ${e.id}: watch node ${tgt.id} cannot receive input`);
  }
  const adj = new Map<string, string[]>();
  for (const e of p.edges)
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
  const state = new Map<string, "visiting" | "done">();
  const hasCycle = (id: string): boolean => {
    if (state.get(id) === "visiting") return true;
    if (state.get(id) === "done") return false;
    state.set(id, "visiting");
    for (const next of adj.get(id) ?? []) if (hasCycle(next)) return true;
    state.set(id, "done");
    return false;
  };
  for (const n of p.nodes) {
    if (hasCycle(n.id)) {
      problems.push("pipeline contains a cycle");
      break;
    }
  }
  return problems;
}

export function edgeFrom(
  p: Pipeline,
  nodeId: string,
  handle: string,
): PipelineEdge | undefined {
  return p.edges.find((e) => e.source === nodeId && e.sourceHandle === handle);
}

export function nodeById(p: Pipeline, id: string): PipelineNode | undefined {
  return p.nodes.find((n) => n.id === id);
}
