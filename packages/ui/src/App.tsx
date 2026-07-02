import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { FolderScan } from "@sortflow/engine";
import { useRef, useState } from "react";
import { api } from "./bridge";
import { DeletableEdge } from "./edges/DeletableEdge";
import { handleFolderDrop, readFolderDragPath } from "./lib/folderDrop";
import { nodeTypes } from "./nodes";
import { AutoSetupBanner } from "./panels/AutoSetupBanner";
import { ConfigPanel } from "./panels/ConfigPanel";
import { HistoryPanel } from "./panels/HistoryPanel";
import { Palette } from "./panels/Palette";
import { PipelineTabs } from "./panels/PipelineTabs";
import { ReviewTray } from "./panels/ReviewTray";
import { useFlowStore } from "./store";
import "./styles.css";

const edgeTypes = { default: DeletableEdge };

interface BannerState {
  scan: FolderScan;
  ruleCount: number;
  error?: string;
}

/** Inner component — lives inside ReactFlowProvider so useReactFlow works. */
function FlowCanvas({
  banner,
  onDismissBanner,
}: {
  banner: BannerState | null;
  onDismissBanner: () => void;
}) {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const setSelected = useFlowStore((s) => s.setSelected);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const replaceEdge = useFlowStore((s) => s.replaceEdge);
  const addNode = useFlowStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();

  // Tracks whether a drag-to-reconnect gesture landed on a valid handle.
  // start → false; onReconnect → true + update endpoints; onReconnectEnd → if still false, delete.
  const reconnectSucceeded = useRef(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    // Folder dragged from the in-app folder tree — already known to be a dir.
    const treePath = readFolderDragPath(e.dataTransfer);
    if (treePath) {
      handleFolderDrop(treePath, true, addNode, position);
      return;
    }
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const path = api.getPathForFile(file);
    if (!path) return;
    const isDir = await api.isDirectory(path);
    handleFolderDrop(path, isDir, addNode, position);
  };

  return (
    <div className="sf-canvas">
      <PipelineTabs />
      <div className="sf-flow">
        {banner && (
          <AutoSetupBanner
            scan={banner.scan}
            ruleCount={banner.ruleCount}
            error={banner.error}
            onDismiss={onDismissBanner}
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
          onDragOver={handleDragOver}
          onDrop={(e) => void handleDrop(e)}
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
    </div>
  );
}

export default function App() {
  const [banner, setBanner] = useState<BannerState | null>(null);
  const focusMode = useFlowStore((s) => s.focusMode);

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
        {!focusMode && (
          <Palette
            onAutoSetupResult={handleAutoSetupResult}
            onAutoSetupError={handleAutoSetupError}
          />
        )}
        <ReactFlowProvider>
          <FlowCanvas banner={banner} onDismissBanner={() => setBanner(null)} />
        </ReactFlowProvider>
        {!focusMode && <ConfigPanel />}
      </div>
      {!focusMode && (
        <div className="sf-dock">
          <ReviewTray />
          <HistoryPanel />
        </div>
      )}
    </div>
  );
}
