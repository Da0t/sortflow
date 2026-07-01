import type { NodeKind } from "@sortflow/engine";
import { useFlowStore } from "../store";

const KINDS: Array<{ kind: NodeKind; label: string }> = [
  { kind: "watch", label: "Add Watch" },
  { kind: "filter", label: "Add Filter" },
  { kind: "classify", label: "Add AI Classify" },
  { kind: "move", label: "Add Move" },
];

export function Palette() {
  const addNode = useFlowStore((s) => s.addNode);
  return (
    <div className="sf-palette">
      {KINDS.map(({ kind, label }) => (
        <button key={kind} type="button" onClick={() => addNode(kind)}>
          {label}
        </button>
      ))}
    </div>
  );
}
