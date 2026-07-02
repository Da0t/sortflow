import { Background, Controls, type Edge, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRef } from "react";
import { DeletableEdge } from "./edges/DeletableEdge";
import { nodeTypes } from "./nodes";
import { ConfigPanel } from "./panels/ConfigPanel";
import { HistoryPanel } from "./panels/HistoryPanel";
import { Palette } from "./panels/Palette";
import { ReviewTray } from "./panels/ReviewTray";
import { useFlowStore } from "./store";
import "./styles.css";

const edgeTypes = { default: DeletableEdge };

export default function App() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const setSelected = useFlowStore((s) => s.setSelected);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const replaceEdge = useFlowStore((s) => s.replaceEdge);

  // Tracks whether a drag-to-reconnect gesture landed on a valid handle.
  // start → false; onReconnect → true + update endpoints; onReconnectEnd → if still false, delete.
  const reconnectSucceeded = useRef(false);

  return (
    <div className="sf-shell">
      <div className="sf-app">
        <Palette />
        <div className="sf-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={(sel) => setSelected(sel.nodes[0]?.id ?? null)}
            deleteKeyCode={["Backspace", "Delete"]}
            connectionRadius={40}
            edgesReconnectable
            onReconnectStart={() => {
              reconnectSucceeded.current = false;
            }}
            onReconnect={(oldEdge: Edge, newConnection) => {
              reconnectSucceeded.current = true;
              replaceEdge(oldEdge.id, newConnection);
            }}
            onReconnectEnd={(_event: MouseEvent | TouchEvent, edge: Edge) => {
              if (!reconnectSucceeded.current) {
                removeEdge(edge.id);
              }
            }}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        <ConfigPanel />
      </div>
      <div className="sf-dock">
        <ReviewTray />
        <HistoryPanel />
      </div>
    </div>
  );
}
