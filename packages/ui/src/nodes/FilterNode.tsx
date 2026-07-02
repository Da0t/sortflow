import type { FilterConfig } from "@sortflow/engine";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Filter } from "lucide-react";
import type { FlowNode } from "../store";

export function FilterNode({ data }: NodeProps<FlowNode>) {
  const cfg = data.config as FilterConfig;
  const ageParts: string[] = [];
  if (cfg.minAgeDays != null) ageParts.push(`> ${cfg.minAgeDays}d`);
  if (cfg.maxAgeDays != null) ageParts.push(`< ${cfg.maxAgeDays}d`);
  const summary =
    [
      cfg.extensions?.length ? cfg.extensions.join(" ") : null,
      cfg.namePattern ?? null,
      ageParts.length ? ageParts.join(" ") : null,
    ]
      .filter(Boolean)
      .join(" · ") || "any file";
  return (
    <div className="sf-node sf-node-filter">
      <Handle type="target" position={Position.Left} />
      <div className="sf-node-title">
        <div className="sf-node-icon" aria-hidden="true">
          <Filter size={16} strokeWidth={2} />
        </div>
        Filter
      </div>
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
