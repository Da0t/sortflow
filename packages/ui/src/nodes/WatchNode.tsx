import type { WatchConfig } from "@sortflow/engine";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Inbox, TriangleAlert } from "lucide-react";
import type { FlowNode } from "../store";

export function WatchNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as WatchConfig;
  return (
    <div className="sf-node sf-node-watch">
      <div className="sf-node-title">
        <div className="sf-node-icon" aria-hidden="true">
          <Inbox size={16} strokeWidth={2} />
        </div>
        Watch
        {data.status === "error" && (
          <span
            className="sf-node-error-icon"
            title={data.statusMessage}
            role="img"
            aria-label="Error"
          >
            <TriangleAlert size={14} strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="sf-node-body">{cfg.path}</div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}
