import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { FolderScan } from "@sortflow/engine";
import { useRef, useState } from "react";
import { DeletableEdge } from "./edges/DeletableEdge";
import { nodeTypes } from "./nodes";
import { AutoSetupBanner } from "./panels/AutoSetupBanner";
import { ConfigPanel } from "./panels/ConfigPanel";
import { HistoryPanel } from "./panels/HistoryPanel";
import { Palette } from "./panels/Palette";
import { ReviewTray } from "./panels/ReviewTray";
import { useFlowStore } from "./store";
import "./styles.css";

const edgeTypes = { default: DeletableEdge };

interface BannerState {
  scan: FolderScan;
  ruleCount: number;
  error?: string;
}

export default function App() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const setSelected = useFlowStore((s) => s.setSelected);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const replaceEdge = useFlowStore((s) => s.replaceEdge);

  const [banner, setBanner] = useState<BannerState | null>(null);

  // Tracks whether a drag-to-reconnect gesture landed on a valid handle.
  // start → false; onReconnect → true + update endpoints; onReconnectEnd → if still false, delete.
  const reconnectSucceeded = useRef(false);

  function handleAutoSetupResult(scan: FolderScan, ruleCount: number) {
    setBanner({ scan, ruleCount });
  }

  function handleAutoSetupError(message: string) {
    setBanner({
      scan: { total: 0, buckets: [] },
      ruleCount: 0,
      error: message,
    });
  }

  return (
    <div className="sf-shell">
      <div className="sf-app">
        <Palette
          onAutoSetupResult={handleAutoSetupResult}
          onAutoSetupError={handleAutoSetupError}
        />
        <div className="sf-canvas">
          {banner && (
            <AutoSetupBanner
              scan={banner.scan}
              ruleCount={banner.ruleCount}
              error={banner.error}
              onDismiss={() => setBanner(null)}
            />
          )}
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
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              color="#d4d4dd"
            />
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
