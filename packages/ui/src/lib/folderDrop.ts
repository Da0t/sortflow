import type { MoveConfig, NodeConfig, NodeKind } from "@sortflow/engine";

/** MIME type carrying a folder path dragged from the in-app folder tree. */
export const FOLDER_MIME = "application/x-sortflow-folder";

/**
 * Write `path` onto a drag's DataTransfer under the sortflow folder MIME,
 * plus text/plain so the same drag can drop into plain text inputs.
 */
export function setFolderDragData(
  dt: { setData(type: string, data: string): void },
  path: string,
): void {
  dt.setData(FOLDER_MIME, path);
  dt.setData("text/plain", path);
}

/** Read the folder path carried by an in-app folder drag, if any. */
export function readFolderDragPath(dt: {
  getData(type: string): string;
}): string | null {
  const path = dt.getData(FOLDER_MIME);
  return path || null;
}

/**
 * Pure retarget helper: points an existing Move node at `path`, keeping the
 * rest of its config. Ignores non-directories and empty paths.
 */
export function retargetMoveNode(
  path: string,
  isDir: boolean,
  nodeId: string,
  config: MoveConfig,
  updateConfig: (id: string, config: NodeConfig) => void,
): void {
  if (!path || !isDir) return;
  updateConfig(nodeId, { ...config, destination: path });
}

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
