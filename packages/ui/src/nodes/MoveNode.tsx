import type { MoveConfig } from "@sortflow/engine";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { FolderOutput } from "lucide-react";
import type { FlowNode } from "../store";

export function MoveNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as MoveConfig;
  return (
    <div className="sf-node sf-node-move">
      <Handle type="target" position={Position.Left} />
      <div className="sf-node-title">
        <div className="sf-node-icon" aria-hidden="true">
          <FolderOutput size={16} strokeWidth={2} />
        </div>
        Move {cfg.auto ? <span className="sf-badge">auto</span> : null}
      </div>
      <div className="sf-node-body">{cfg.destination}</div>
    </div>
  );
}
