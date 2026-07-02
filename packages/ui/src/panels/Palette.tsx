import type { NodeKind } from "@sortflow/engine";
import { Filter, FolderOutput, Inbox, Sparkles } from "lucide-react";
import type { ReactElement } from "react";
import { useFlowStore } from "../store";

const KINDS: Array<{ kind: NodeKind; label: string; icon: ReactElement }> = [
  {
    kind: "watch",
    label: "Add Watch",
    icon: <Inbox size={16} strokeWidth={2} aria-hidden="true" />,
  },
  {
    kind: "filter",
    label: "Add Filter",
    icon: <Filter size={16} strokeWidth={2} aria-hidden="true" />,
  },
  {
    kind: "classify",
    label: "Add AI Classify",
    icon: <Sparkles size={16} strokeWidth={2} aria-hidden="true" />,
  },
  {
    kind: "move",
    label: "Add Move",
    icon: <FolderOutput size={16} strokeWidth={2} aria-hidden="true" />,
  },
];

export function Palette() {
  const addNode = useFlowStore((s) => s.addNode);
  return (
    <div className="sf-palette">
      <span className="sf-palette-label">Nodes</span>
      {KINDS.map(({ kind, label, icon }) => (
        <button key={kind} type="button" onClick={() => addNode(kind)}>
          {icon}
          {label}
        </button>
      ))}
    </div>
  );
}
