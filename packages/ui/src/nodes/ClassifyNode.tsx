import type { ClassifyConfig } from "@sortflow/engine";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { FlowNode } from "../store";

export function ClassifyNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as ClassifyConfig;
  const handles = [...cfg.categories, "unsure"];
  return (
    <div className="sf-node sf-node-classify">
      <Handle type="target" position={Position.Left} />
      <div className="sf-node-title">
        🤖 AI Classify{" "}
        {data.status === "warning" && <span title={data.statusMessage}>⚠️</span>}
      </div>
      <div className="sf-node-body">{cfg.model}</div>
      {handles.map((h, i) => (
        <div className="sf-handle-row" key={h}>
          <span>{h}</span>
          <Handle
            type="source"
            position={Position.Right}
            id={h}
            style={{ top: `${40 + ((i + 1) * 50) / (handles.length + 1)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
