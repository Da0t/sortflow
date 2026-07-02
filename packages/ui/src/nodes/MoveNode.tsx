import type { MoveConfig } from "@sortflow/engine";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { FolderOutput } from "lucide-react";
import { useState } from "react";
import { api } from "../bridge";
import {
  FOLDER_MIME,
  readFolderDragPath,
  retargetMoveNode,
} from "../lib/folderDrop";
import { type FlowNode, useFlowStore } from "../store";

export function MoveNode({ id, data }: NodeProps<FlowNode>) {
  const cfg = data.config as MoveConfig;
  const updateConfig = useFlowStore((s) => s.updateConfig);
  const [dropActive, setDropActive] = useState(false);

  const acceptsFolderDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(FOLDER_MIME) ||
    e.dataTransfer.types.includes("Files");

  return (
    <div
      className={`sf-node sf-node-move${dropActive ? " sf-node-drop-active" : ""}`}
      onDragOver={(e) => {
        if (!acceptsFolderDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDropActive(false);
      }}
      onDrop={(e) => {
        setDropActive(false);
        const treePath = readFolderDragPath(e.dataTransfer);
        const file = e.dataTransfer.files[0];
        if (!treePath && !file) return;
        e.preventDefault();
        e.stopPropagation();
        if (treePath) {
          retargetMoveNode(treePath, true, id, cfg, updateConfig);
          return;
        }
        const path = api.getPathForFile(file);
        if (!path) return;
        void api.isDirectory(path).then((isDir) => {
          // Re-read the config: an edit may have landed while the IPC
          // round-trip was in flight, and a stale spread would revert it.
          const node = useFlowStore.getState().nodes.find((n) => n.id === id);
          if (!node) return;
          retargetMoveNode(
            path,
            isDir,
            id,
            node.data.config as MoveConfig,
            updateConfig,
          );
        });
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="sf-node-title">
        <div className="sf-node-icon" aria-hidden="true">
          <FolderOutput size={16} strokeWidth={2} />
        </div>
        Move {cfg.auto ? <span className="sf-badge">auto</span> : null}
      </div>
      {/* Body text stays put during drag-over: swapping it would resize the
          node under the cursor and cause dragleave flicker. */}
      <div className="sf-node-body">{cfg.destination}</div>
    </div>
  );
}
