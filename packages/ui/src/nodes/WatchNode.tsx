import type { WatchConfig } from "@sortflow/engine";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { FlowNode } from "../store";

export function WatchNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as WatchConfig;
  return (
    <div className="sf-node sf-node-watch">
      <div className="sf-node-title">
        📥 Watch{" "}
        {data.status === "error" && <span title={data.statusMessage}>⚠️</span>}
      </div>
      <div className="sf-node-body">{cfg.path}</div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}
