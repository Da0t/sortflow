import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import {
  ArrowLeft,
  File,
  Folder,
  FolderPlus,
  House,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FsEntry, api } from "../bridge";
import { readFolderDragPath, setFolderDragData } from "../lib/folderDrop";
import { useFlowStore } from "../store";

const HOME = "~";
const MAX_CHIPS = 8;
const BUBBLE_W = 150;
const LEVEL_H = 120;
const SIB_GAP = 24;
const CHIP_W = 110;
const CHIP_FAN_Y = 84;

type BubbleData = {
  path: string;
  name: string;
  isRoot: boolean;
  count: number | null;
  pinned: boolean;
  onHover: (path: string | null) => void;
  onToggle: (path: string) => void;
  onDropInto: (dest: string, e: React.DragEvent) => void;
  onTrash: (path: string, name: string) => void;
  onStartCreate: (path: string) => void;
  dropTarget: string | null;
};

type CreatorData = {
  parentName: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

type ChipData = {
  entry: FsEntry;
  parentPath: string;
  onHover: (path: string | null) => void;
  onPin: (parentPath: string) => void;
  onDropInto: (dest: string, e: React.DragEvent) => void;
  dropTarget: string | null;
};

type AnyNode =
  | Node<BubbleData, "bubble">
  | Node<ChipData, "chip">
  | Node<CreatorData, "creator">;

/** A folder as a bubble: name + item count. Hovering fans its contents out
 * as satellite chips; clicking toggles it open as a pinned branch. */
function BubbleNode({ data }: NodeProps<Node<BubbleData, "bubble">>) {
  return (
    <div
      className={`sf-bubble${data.isRoot ? " sf-bubble-root" : ""}${
        data.dropTarget === data.path ? " sf-btree-drop" : ""
      }`}
      title={data.path}
      draggable={!data.isRoot}
      onMouseEnter={() => data.onHover(data.path)}
      onMouseLeave={() => data.onHover(null)}
      onClick={() => data.onToggle(data.path)}
      onKeyDown={(e) => {
        if (e.key === "Enter") data.onToggle(data.path);
      }}
      onDragStart={(e) => {
        setFolderDragData(e.dataTransfer, data.path);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => data.onDropInto(data.path, e)}
    >
      {!data.isRoot && <Handle type="target" position={Position.Top} />}
      {data.isRoot ? (
        <House size={13} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Folder size={13} strokeWidth={2} aria-hidden="true" />
      )}
      <span className="sf-folder-name">{data.name}</span>
      {data.count !== null && (
        <span className="sf-bubble-count">{data.count}</span>
      )}
      <span className="sf-bubble-actions">
        <button
          type="button"
          aria-label={`New folder in ${data.name}`}
          title="New folder inside"
          onClick={(e) => {
            e.stopPropagation();
            data.onStartCreate(data.path);
          }}
        >
          <FolderPlus size={12} strokeWidth={2} aria-hidden="true" />
        </button>
        {!data.isRoot && (
          <button
            type="button"
            aria-label={`Move ${data.name} to Trash`}
            title="Move to the macOS Trash (restorable there)"
            onClick={(e) => {
              e.stopPropagation();
              data.onTrash(data.path, data.name);
            }}
          >
            <Trash2 size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/** Inline input node for naming a new folder, wired under its parent. */
function CreatorNode({ data }: NodeProps<Node<CreatorData, "creator">>) {
  return (
    <div className="sf-chipnode sf-creator">
      <Handle type="target" position={Position.Top} />
      <FolderPlus size={11} strokeWidth={2} aria-hidden="true" />
      <input
        className="nodrag"
        aria-label={`New folder name in ${data.parentName}`}
        placeholder="New folder name"
        value={data.value}
        // biome-ignore lint/a11y/noAutofocus: input appears on explicit user action
        autoFocus
        onChange={(e) => data.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") data.onSubmit();
          if (e.key === "Escape") data.onCancel();
        }}
      />
    </div>
  );
}

/** A hover-revealed item: a small satellite chip. Clicking a folder chip
 * pins the hovered branch open so the chip becomes part of the tree. */
function ChipNode({ data }: NodeProps<Node<ChipData, "chip">>) {
  const { entry } = data;
  return (
    <div
      className={`sf-chipnode${
        data.dropTarget === entry.path ? " sf-btree-drop" : ""
      }`}
      title={entry.path}
      draggable
      onMouseEnter={() => data.onHover(data.parentPath)}
      onMouseLeave={() => data.onHover(null)}
      onClick={() => {
        if (entry.isDirectory) data.onPin(data.parentPath);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && entry.isDirectory) data.onPin(data.parentPath);
      }}
      onDragStart={(e) => {
        setFolderDragData(e.dataTransfer, entry.path);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={
        entry.isDirectory
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
            }
          : undefined
      }
      onDrop={
        entry.isDirectory ? (e) => data.onDropInto(entry.path, e) : undefined
      }
    >
      <Handle type="target" position={Position.Top} />
      {entry.isDirectory ? (
        <Folder size={11} strokeWidth={2} aria-hidden="true" />
      ) : (
        <File size={11} strokeWidth={2} aria-hidden="true" />
      )}
      <span className="sf-folder-name">{entry.name}</span>
    </div>
  );
}

const nodeTypes = { bubble: BubbleNode, chip: ChipNode, creator: CreatorNode };

/**
 * The Files page: folders as bubbles on a pannable, zoomable canvas (drag
 * the background, scroll to zoom — same feel as the pipeline editor).
 * Hover a bubble to fan out what's inside it as connected chips; click a
 * chip's folder (or the bubble) to pin the branch open. Drag any bubble or
 * chip onto a folder to move it — journaled and undoable in History.
 */
export function FilesView() {
  const setView = useFlowStore((s) => s.setView);
  const [entriesByPath, setEntriesByPath] = useState<Record<string, FsEntry[]>>(
    {},
  );
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set([HOME]));
  const [hovered, setHovered] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (path: string) => {
    const kids = await api.listEntries(path);
    setEntriesByPath((c) => ({ ...c, [path]: kids }));
  }, []);

  useEffect(() => {
    void load(HOME);
  }, [load]);

  // Prefetch entries for every visible bubble so counts fill in.
  const folderChildren = useCallback(
    (path: string) => (entriesByPath[path] ?? []).filter((e) => e.isDirectory),
    [entriesByPath],
  );
  useEffect(() => {
    for (const parent of pinned) {
      for (const child of folderChildren(parent)) {
        if (entriesByPath[child.path] === undefined) void load(child.path);
      }
    }
  }, [pinned, folderChildren, entriesByPath, load]);

  /** Hover with a grace period so the pointer can travel to the chips. */
  const onHover = useCallback((path: string | null) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (path === null) {
      hoverTimer.current = setTimeout(() => setHovered(null), 300);
    } else {
      setHovered(path);
    }
  }, []);

  const onToggle = useCallback(
    (path: string) => {
      if (path === HOME) return;
      setPinned((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
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

  const onPin = useCallback(
    (parentPath: string) => {
      setPinned((prev) => {
        if (prev.has(parentPath)) return prev;
        const next = new Set(prev);
        next.add(parentPath);
        return next;
      });
      void load(parentPath);
      setHovered(null);
    },
    [load],
  );

  const refreshAll = useCallback(() => {
    void load(HOME);
    for (const p of pinned) {
      void load(p);
    }
  }, [pinned, load]);

  const onTrash = useCallback(
    async (path: string, name: string) => {
      if (
        !window.confirm(
          `Move "${name}" to the Trash? You can restore it from the Trash.`,
        )
      ) {
        return;
      }
      const result = await api.trashEntry(path);
      setError(result.error);
      if (!result.error) {
        setPinned(
          (prev) =>
            new Set(
              [...prev].filter((p) => p !== path && !p.startsWith(`${path}/`)),
            ),
        );
      }
      refreshAll();
    },
    [refreshAll],
  );

  const onStartCreate = useCallback((path: string) => {
    setCreatingIn(path);
    setNewName("");
  }, []);

  const submitCreate = useCallback(async () => {
    if (!creatingIn) return;
    const result = await api.createFolder(creatingIn, newName);
    setError(result.error);
    if (!result.error) {
      setCreatingIn(null);
      // Pin the parent so the new folder appears as a bubble right away.
      if (creatingIn !== HOME) {
        setPinned((prev) => new Set(prev).add(creatingIn));
      }
      await load(creatingIn);
    }
  }, [creatingIn, newName, load]);

  const cancelCreate = useCallback(() => {
    setCreatingIn(null);
    setNewName("");
  }, []);

  const onDropInto = useCallback(
    async (dest: string, e: React.DragEvent) => {
      const src = readFolderDragPath(e.dataTransfer);
      setDropTarget(null);
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
    const nodes: AnyNode[] = [];
    const edges: Edge[] = [];

    // Subtree width of the pinned-folder tree.
    const width = (path: string): number => {
      if (!pinned.has(path)) return BUBBLE_W;
      const kids = folderChildren(path);
      if (kids.length === 0) return BUBBLE_W;
      const total =
        kids.reduce((sum, k) => sum + width(k.path), 0) +
        SIB_GAP * (kids.length - 1);
      return Math.max(BUBBLE_W, total);
    };

    const place = (
      path: string,
      name: string,
      isRoot: boolean,
      xCenter: number,
      depth: number,
    ) => {
      nodes.push({
        id: path,
        type: "bubble",
        position: { x: xCenter - BUBBLE_W / 2, y: depth * LEVEL_H },
        draggable: false,
        data: {
          path,
          name,
          isRoot,
          count: entriesByPath[path]?.length ?? null,
          pinned: pinned.has(path),
          onHover,
          onToggle,
          onDropInto,
          onTrash,
          onStartCreate,
          dropTarget,
        },
      });
      if (!pinned.has(path)) return;
      const kids = folderChildren(path);
      let x = xCenter - width(path) / 2;
      for (const kid of kids) {
        const w = width(kid.path);
        place(kid.path, kid.name, false, x + w / 2, depth + 1);
        edges.push({ id: `e-${kid.path}`, source: path, target: kid.path });
        x += w + SIB_GAP;
      }
    };
    place(HOME, "Home", true, 0, 0);

    // Hover preview: fan the hovered folder's hidden contents out as chips.
    const hoveredNode = hovered
      ? nodes.find((n) => n.id === hovered)
      : undefined;
    if (hovered && hoveredNode) {
      const contents = entriesByPath[hovered] ?? [];
      // Folders already shown as bubbles (pinned parent) are not repeated.
      const hidden = pinned.has(hovered)
        ? contents.filter((e) => !e.isDirectory)
        : contents;
      const chips = hidden.slice(0, MAX_CHIPS);
      const n = chips.length;
      chips.forEach((entry, i) => {
        const offset = (i - (n - 1) / 2) * (CHIP_W + 12);
        nodes.push({
          id: `chip:${entry.path}`,
          type: "chip",
          position: {
            x: hoveredNode.position.x + BUBBLE_W / 2 + offset - CHIP_W / 2,
            y: hoveredNode.position.y + CHIP_FAN_Y,
          },
          draggable: false,
          data: {
            entry,
            parentPath: hovered,
            onHover,
            onPin,
            onDropInto,
            dropTarget,
          },
        });
        edges.push({
          id: `ce-${entry.path}`,
          source: hovered,
          target: `chip:${entry.path}`,
          style: { strokeDasharray: "4 3" },
        });
      });
    }

    // Inline naming input for a folder being created.
    const creatorParent = creatingIn
      ? nodes.find((n) => n.id === creatingIn)
      : undefined;
    if (creatingIn && creatorParent) {
      nodes.push({
        id: "creator",
        type: "creator",
        position: {
          x: creatorParent.position.x + BUBBLE_W / 2 - CHIP_W / 2,
          y: creatorParent.position.y - CHIP_FAN_Y,
        },
        draggable: false,
        data: {
          parentName:
            creatingIn === HOME
              ? "Home"
              : (creatorParent.data as BubbleData).name,
          value: newName,
          onChange: setNewName,
          onSubmit: submitCreate,
          onCancel: cancelCreate,
        },
      });
      edges.push({
        id: "creator-edge",
        source: creatingIn,
        target: "creator",
        style: { strokeDasharray: "4 3" },
      });
    }

    return { nodes, edges };
  }, [
    entriesByPath,
    pinned,
    hovered,
    dropTarget,
    creatingIn,
    newName,
    folderChildren,
    onHover,
    onToggle,
    onPin,
    onDropInto,
    onTrash,
    onStartCreate,
    submitCreate,
    cancelCreate,
  ]);

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
          Hover a folder to peek inside it — click to pin the branch open. Drag
          anything onto a folder to move it; undo in History. Drag the
          background to pan, scroll to zoom.
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
      <div
        className="sf-files-canvas"
        onDragOver={(e) => {
          // Track which folder the drag is over for highlight purposes.
          const el = (e.target as HTMLElement).closest("[title]");
          setDropTarget(el?.getAttribute("title") ?? null);
        }}
        onDrop={() => setDropTarget(null)}
      >
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            fitView
            minZoom={0.15}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              color="#d4d4dd"
            />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
