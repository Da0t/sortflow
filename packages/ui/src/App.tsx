import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import { ConfigPanel } from "./panels/ConfigPanel";
import { Palette } from "./panels/Palette";
import { useFlowStore } from "./store";
import "./styles.css";

export default function App() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const setSelected = useFlowStore((s) => s.setSelected);

  return (
    <div className="sf-app">
      <Palette />
      <div className="sf-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={(sel) => setSelected(sel.nodes[0]?.id ?? null)}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <ConfigPanel />
    </div>
  );
}
