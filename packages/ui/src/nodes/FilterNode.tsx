import type { FilterConfig } from "@sortflow/engine";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { FlowNode } from "../store";

export function FilterNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as FilterConfig;
  const summary =
    [
      cfg.extensions?.length ? cfg.extensions.join(" ") : null,
      cfg.namePattern ?? null,
    ]
      .filter(Boolean)
      .join(" · ") || "any file";
  return (
    <div className="sf-node sf-node-filter">
      <Handle type="target" position={Position.Left} />
      <div className="sf-node-title">🔍 Filter</div>
      <div className="sf-node-body">{summary}</div>
      <div className="sf-handle-row">
        <span>match</span>
        <Handle
          type="source"
          position={Position.Right}
          id="match"
          style={{ top: "55%" }}
        />
      </div>
      <div className="sf-handle-row">
        <span>else</span>
        <Handle
          type="source"
          position={Position.Right}
          id="else"
          style={{ top: "80%" }}
        />
      </div>
    </div>
  );
}
