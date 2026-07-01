import { UNSURE } from "./classify";
import { matchesFilter } from "./filter";
import { edgeFrom, nodeById } from "./graph";
import type {
  ClassifyConfig,
  FilterConfig,
  IncomingFile,
  Pipeline,
} from "./types";

export interface RouteResult {
  moveNodeId: string | null;
  nodePath: string[];
  category?: string;
}

export type ClassifyFn = (
  file: IncomingFile,
  cfg: ClassifyConfig,
) => Promise<string>;

export async function routeFile(
  pipeline: Pipeline,
  watchNodeId: string,
  file: IncomingFile,
  classify: ClassifyFn,
  nowMs = Date.now(),
): Promise<RouteResult> {
  const nodePath: string[] = [watchNodeId];
  let category: string | undefined;
  let edge = edgeFrom(pipeline, watchNodeId, "out");
  while (edge) {
    const node = nodeById(pipeline, edge.target);
    if (!node) break;
    nodePath.push(node.id);
    switch (node.kind) {
      case "filter": {
        const handle = matchesFilter(file, node.config as FilterConfig, nowMs)
          ? "match"
          : "else";
        edge = edgeFrom(pipeline, node.id, handle);
        break;
      }
      case "classify": {
        const result = await classify(file, node.config as ClassifyConfig);
        category = result === UNSURE ? undefined : result;
        edge = edgeFrom(pipeline, node.id, result);
        break;
      }
      case "move":
        return { moveNodeId: node.id, nodePath, category };
      default:
        edge = undefined;
    }
  }
  return { moveNodeId: null, nodePath, category };
}
