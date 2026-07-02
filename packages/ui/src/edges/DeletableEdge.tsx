import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import { useFlowStore } from "../store";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerStart,
  markerEnd,
  selected,
  animated,
}: EdgeProps) {
  const removeEdge = useFlowStore((s) => s.removeEdge);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.3,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />
      <circle
        className="sf-edge-dot"
        r={animated ? 4 : 3}
        fill="var(--sf-primary)"
      >
        <animateMotion
          dur={animated ? "1.1s" : "3.2s"}
          repeatCount="indefinite"
          path={edgePath}
        />
      </circle>
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          <button
            type="button"
            aria-label="Remove connection"
            className={`sf-edge-delete${selected ? " sf-edge-delete-visible" : ""}`}
            onClick={() => removeEdge(id)}
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
