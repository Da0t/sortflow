import type { NodeConfig, NodeKind } from "@sortflow/engine";

/**
 * Pure drop-decision helper. Calls addNode with a Move node when the dropped
 * path is a directory. Ignores non-directories and empty paths.
 */
export function handleFolderDrop(
  path: string,
  isDir: boolean,
  addNode: (
    kind: NodeKind,
    overrides?: {
      config?: NodeConfig;
      position?: { x: number; y: number };
    },
  ) => void,
  position: { x: number; y: number },
): void {
  if (!path || !isDir) return;
  addNode("move", {
    config: { destination: path, auto: false },
    position,
  });
}
