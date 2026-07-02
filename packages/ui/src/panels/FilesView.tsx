import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { ArrowLeft, ChevronRight, File, Folder, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type FsEntry, api } from "../bridge";
import { readFolderDragPath, setFolderDragData } from "../lib/folderDrop";
import { useFlowStore } from "../store";

const HOME = "~";
const MAX_ROWS = 8;

type DirNodeData = {
  path: string;
  name: string;
  isRoot: boolean;
  entries: FsEntry[] | undefined;
  expanded: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onDropInto: (dest: string, e: React.DragEvent) => void;
};
type DirFlowNode = Node<DirNodeData>;

/** One folder as a canvas node: its contents listed inside, subfolders
 * openable as connected child nodes, and the whole card a drop target. */
function DirNode({ data }: NodeProps<DirFlowNode>) {
  const [active, setActive] = useState(false);
  const entries = data.entries;
  const shown = entries?.slice(0, MAX_ROWS) ?? [];
  const extra = (entries?.length ?? 0) - shown.length;

  return (
    <div
      className={`sf-node sf-dirnode${active ? " sf-node-drop-active" : ""}`}
      data-path={data.path}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as globalThis.Node | null))
          return;
        setActive(false);
      }}
      onDrop={(e) => {
        setActive(false);
        data.onDropInto(data.path, e);
      }}
    >
      {!data.isRoot && <Handle type="target" position={Position.Left} />}
      <div className="sf-node-title">
        <div className="sf-node-icon" aria-hidden="true">
          <Folder size={16} strokeWidth={2} />
        </div>
        {data.name}
      </div>
      <div className="sf-dirnode-body">
        {entries === undefined && (
          <span className="sf-folder-empty">Loading…</span>
        )}
        {entries?.length === 0 && (
          <span className="sf-folder-empty">Empty</span>
        )}
        {shown.map((entry) => (
          <div
            key={entry.path}
            className="sf-dirnode-row nodrag"
            title={entry.path}
            draggable
            onDragStart={(e) => {
              setFolderDragData(e.dataTransfer, entry.path);
              e.dataTransfer.effectAllowed = "move";
              e.stopPropagation();
            }}
          >
            {entry.isDirectory ? (
              <Folder
                size={12}
                strokeWidth={2}
                aria-hidden="true"
                className="sf-folder-icon"
              />
            ) : (
              <File
                size={12}
                strokeWidth={2}
                aria-hidden="true"
                className="sf-folder-icon"
              />
            )}
            <span className="sf-folder-name">{entry.name}</span>
            {entry.isDirectory && (
              <button
                type="button"
                className="sf-dirnode-open"
                aria-label={`${
                  data.expanded.has(entry.path) ? "Close" : "Open"
                } ${entry.name}`}
                title={
                  data.expanded.has(entry.path)
                    ? "Close this folder's node"
                    : "Open as a connected node"
                }
                onClick={() => data.onToggle(entry.path)}
              >
                <ChevronRight
                  size={12}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={`sf-folder-chevron${
                    data.expanded.has(entry.path) ? " sf-open" : ""
                  }`}
                />
              </button>
            )}
          </div>
        ))}
        {extra > 0 && <span className="sf-folder-empty">+{extra} more</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const dirNodeTypes = { dir: DirNode };

/**
 * The Files page: your directory rendered the same way pipelines are — as a
 * node tree. Open subfolders into connected nodes, then drag any file or
 * folder row onto another folder's card to move it. Every move is journaled
 * (History + Undo), and nothing is ever overwritten.
 */
export function FilesView() {
  const setView = useFlowStore((s) => s.setView);
  const [entriesByPath, setEntriesByPath] = useState<Record<string, FsEntry[]>>(
    {},
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    const kids = await api.listEntries(path);
    setEntriesByPath((c) => ({ ...c, [path]: kids }));
  }, []);

  useEffect(() => {
    void load(HOME);
  }, [load]);

  const toggle = useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          // Collapse the folder and everything beneath it.
          for (const p of prev) {
            if (p === path || p.startsWith(`${path}/`)) next.delete(p);
          }
        } else {
          next.add(path);
          void load(path);
        }
        return next;
      });
    },
    [load],
  );

  const refreshAll = useCallback(() => {
    void load(HOME);
    for (const p of expanded) {
      void load(p);
    }
  }, [expanded, load]);

  const onDropInto = useCallback(
    async (dest: string, e: React.DragEvent) => {
      const src = readFolderDragPath(e.dataTransfer);
      if (!src) return;
      e.preventDefault();
      e.stopPropagation();
      const result = await api.moveEntry(src, dest);
      setError(result.error);
      // History listens to the shared refresh tick.
      useFlowStore.getState().bumpRefresh();
      refreshAll();
    },
    [refreshAll],
  );

  const { nodes, edges } = useMemo(() => {
    const nodes: DirFlowNode[] = [];
    const edges: Edge[] = [];
    const X_GAP = 360;
    const Y_GAP = 30;
    const estimate = (path: string) => {
      const n = entriesByPath[path]?.length ?? 1;
      return 64 + Math.min(n, MAX_ROWS) * 25 + (n > MAX_ROWS ? 22 : 0);
    };
    const visibleChildren = (path: string) =>
      (entriesByPath[path] ?? []).filter(
        (e) => e.isDirectory && expanded.has(e.path),
      );
    const place = (
      path: string,
      name: string,
      isRoot: boolean,
      depth: number,
      y0: number,
    ): number => {
      const kids = visibleChildren(path);
      let childY = y0;
      let childrenHeight = 0;
      for (const kid of kids) {
        const h = place(kid.path, kid.name, false, depth + 1, childY);
        childY += h + Y_GAP;
        childrenHeight += h + Y_GAP;
      }
      if (kids.length > 0) childrenHeight -= Y_GAP;
      const myHeight = estimate(path);
      const subtree = Math.max(myHeight, childrenHeight);
      nodes.push({
        id: path,
        type: "dir",
        position: {
          x: depth * X_GAP,
          y: y0 + Math.max(0, (subtree - myHeight) / 2),
        },
        draggable: false,
        data: {
          path,
          name,
          isRoot,
          entries: entriesByPath[path],
          expanded,
          onToggle: toggle,
          onDropInto,
        },
      });
      for (const kid of kids) {
        edges.push({ id: `e-${kid.path}`, source: path, target: kid.path });
      }
      return subtree;
    };
    place(HOME, "Home", true, 0, 0);
    return { nodes, edges };
  }, [entriesByPath, expanded, toggle, onDropInto]);

  return (
    <div className="sf-files">
      <div className="sf-files-header">
        <button
          type="button"
          className="sf-files-back"
          onClick={() => setView("canvas")}
        >
          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
          Pipelines
        </button>
        <span className="sf-files-title">
          Your folders as a node tree — open a subfolder into its own node, then
          drag any file or folder onto another node to move it. Every move is
          undoable in History.
        </span>
        <button
          type="button"
          className="sf-files-back"
          onClick={refreshAll}
          aria-label="Refresh folders"
        >
          <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
          Refresh
        </button>
      </div>
      {error && (
        <p className="sf-generate-error" role="alert">
          {error}
        </p>
      )}
      <div className="sf-files-canvas">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={dirNodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
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
        </ReactFlowProvider>
      </div>
    </div>
  );
}
