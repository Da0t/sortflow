import type { ClassifyConfig } from "@sortflow/engine";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Sparkles, TriangleAlert } from "lucide-react";
import type { FlowNode } from "../store";

export function ClassifyNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as ClassifyConfig;
  const handles = [...cfg.categories, "unsure"];
  return (
    <div className="sf-node sf-node-classify">
      <Handle type="target" position={Position.Left} />
      <div className="sf-node-title">
        <div className="sf-node-icon" aria-hidden="true">
          <Sparkles size={16} strokeWidth={2} />
        </div>
        AI Classify
        {data.status === "warning" && (
          <span
            className="sf-node-warn-icon"
            title={data.statusMessage}
            role="img"
            aria-label="Warning"
          >
            <TriangleAlert size={14} strokeWidth={2} />
          </span>
        )}
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
