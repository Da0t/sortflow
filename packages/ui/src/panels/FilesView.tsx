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
  Eye,
  EyeOff,
  File,
  Folder,
  FolderPlus,
  House,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type FsEntry, api } from "../bridge";
import { readFolderDragPath, setFolderDragData } from "../lib/folderDrop";
import { useFlowStore } from "../store";

const HOME = "~";
/** Cascade tree: each opened folder's contents stack in the next column,
 * vertically centered on their parent. */
const COL_W = 270;
const ROW_H = 46;
const NODE_H = 36;
const MAX_ROWS = 60;

const HIDDEN_KEY = "sf-files-hidden-kinds";

/** File-kind toggles: hide noisy categories from columns and counts. */
const KINDS: Array<{ key: string; label: string; exts: Set<string> }> = [
  {
    key: "images",
    label: "Images",
    exts: new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".heic",
      ".webp",
      ".bmp",
      ".tiff",
      ".tif",
      ".svg",
      ".avif",
    ]),
  },
  {
    key: "docs",
    label: "Docs",
    exts: new Set([
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".key",
      ".pages",
      ".numbers",
      ".txt",
      ".rtf",
      ".md",
      ".csv",
      ".odt",
      ".epub",
    ]),
  },
  {
    key: "video",
    label: "Video",
    exts: new Set([
      ".mp4",
      ".mov",
      ".mkv",
      ".avi",
      ".webm",
      ".m4v",
      ".wmv",
      ".flv",
    ]),
  },
  {
    key: "audio",
    label: "Audio",
    exts: new Set([".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".aiff"]),
  },
  {
    key: "archives",
    label: "Archives",
    exts: new Set([
      ".zip",
      ".tar",
      ".gz",
      ".tgz",
      ".bz2",
      ".xz",
      ".rar",
      ".7z",
      ".dmg",
      ".pkg",
      ".mpkg",
    ]),
  },
];

function kindOf(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  for (const kind of KINDS) {
    if (kind.exts.has(ext)) return kind.key;
  }
  return "other";
}

function loadHiddenKinds(): Set<string> {
  try {
    return new Set(
      JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? "[]") as string[],
    );
  } catch {
    return new Set();
  }
}

function saveHiddenKinds(kinds: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...kinds]));
  } catch {
    // Session-only.
  }
}

const HIDDEN_PATHS_KEY = "sf-files-hidden-paths";

function loadHiddenPaths(): Set<string> {
  try {
    return new Set(
      JSON.parse(
        window.localStorage.getItem(HIDDEN_PATHS_KEY) ?? "[]",
      ) as string[],
    );
  } catch {
    return new Set();
  }
}

function saveHiddenPaths(paths: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(HIDDEN_PATHS_KEY, JSON.stringify([...paths]));
  } catch {
    // Session-only.
  }
}

type BubbleData = {
  path: string;
  name: string;
  isRoot: boolean;
  open: boolean;
  count: number | null;
  onOpen: (path: string) => void;
  onDropInto: (dest: string, e: React.DragEvent) => void;
  onTrash: (path: string, name: string) => void;
  onStartCreate: (path: string) => void;
  onHideToggle: (path: string) => void;
  hidden: boolean;
  dropTarget: string | null;
};

type FileChipData = {
  entry: FsEntry;
};

type CreatorData = {
  parentName: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

type AnyNode =
  | Node<BubbleData, "bubble">
  | Node<FileChipData, "filechip">
  | Node<CreatorData, "creator">;

/** A folder box. Click opens its contents in the next column; the open one
 * stays highlighted so the trail can be backtracked. Drops land here. */
function BubbleNode({ data }: NodeProps<Node<BubbleData, "bubble">>) {
  return (
    <div
      className={`sf-bubble nodrag${data.isRoot ? " sf-bubble-root" : ""}${
        data.open ? " sf-bubble-open" : ""
      }${data.hidden ? " sf-bubble-hidden" : ""}${
        data.dropTarget === data.path ? " sf-btree-drop" : ""
      }`}
      title={data.path}
      draggable={!data.isRoot}
      onClick={() => data.onOpen(data.path)}
      onKeyDown={(e) => {
        if (e.key === "Enter") data.onOpen(data.path);
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
      {!data.isRoot && <Handle type="target" position={Position.Left} />}
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
            aria-label={
              data.hidden ? `Show ${data.name} again` : `Hide ${data.name}`
            }
            title={
              data.hidden
                ? "Show this folder again"
                : "Hide this folder from the view"
            }
            onClick={(e) => {
              e.stopPropagation();
              data.onHideToggle(data.path);
            }}
          >
            {data.hidden ? (
              <Eye size={12} strokeWidth={2} aria-hidden="true" />
            ) : (
              <EyeOff size={12} strokeWidth={2} aria-hidden="true" />
            )}
          </button>
        )}
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
      <Handle type="source" position={Position.Right} id="side" />
    </div>
  );
}

/** A file in a column: draggable onto any folder box, nothing to open. */
function FileChipNode({ data }: NodeProps<Node<FileChipData, "filechip">>) {
  const { entry } = data;
  return (
    <div
      className="sf-filechip nodrag"
      title={entry.path}
      draggable
      onDragStart={(e) => {
        setFolderDragData(e.dataTransfer, entry.path);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <Handle type="target" position={Position.Left} />
      <File size={11} strokeWidth={2} aria-hidden="true" />
      <span className="sf-folder-name">{entry.name}</span>
    </div>
  );
}

/** Inline input node for naming a new folder, first row of its column. */
function CreatorNode({ data }: NodeProps<Node<CreatorData, "creator">>) {
  return (
    <div className="sf-filechip sf-creator nodrag">
      <Handle type="target" position={Position.Left} />
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

const nodeTypes = {
  bubble: BubbleNode,
  filechip: FileChipNode,
  creator: CreatorNode,
};

/**
 * The Files page as a click-to-cascade timeline: press a folder and its
 * contents open in a column beside it; press deeper and the trail marches
 * right. Every opened folder stays highlighted, so backtracking is just
 * clicking an earlier box (or the same box to fold it shut). Drag any box
 * onto a folder box to move it — journaled and undoable in History.
 */
export function FilesView() {
  const setView = useFlowStore((s) => s.setView);
  const [entriesByPath, setEntriesByPath] = useState<Record<string, FsEntry[]>>(
    {},
  );
  /** Every folder currently opened — multiple branches welcome. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [hiddenKinds, setHiddenKinds] =
    useState<ReadonlySet<string>>(loadHiddenKinds);
  const [hiddenPaths, setHiddenPaths] =
    useState<ReadonlySet<string>>(loadHiddenPaths);
  const [showHidden, setShowHidden] = useState(false);

  const load = useCallback(async (path: string) => {
    const kids = await api.listEntries(path);
    setEntriesByPath((c) => ({ ...c, [path]: kids }));
  }, []);

  useEffect(() => {
    void load(HOME);
  }, [load]);

  const onHideToggle = useCallback((path: string) => {
    setHiddenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      saveHiddenPaths(next);
      return next;
    });
  }, []);

  const toggleKind = useCallback((key: string) => {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveHiddenKinds(next);
      return next;
    });
  }, []);

  /** Entries with muted folders and toggled-off file kinds removed. */
  const visibleEntries = useCallback(
    (path: string): FsEntry[] | undefined => {
      const entries = entriesByPath[path];
      if (!entries) return undefined;
      return entries.filter(
        (e) =>
          (e.isDirectory && (showHidden || !hiddenPaths.has(e.path))) ||
          (!e.isDirectory && !hiddenKinds.has(kindOf(e.name))),
      );
    },
    [entriesByPath, hiddenKinds, hiddenPaths, showHidden],
  );

  /** Toggle a folder open (contents in the next column) or fold its branch. */
  const onOpen = useCallback(
    (path: string) => {
      if (path === HOME) return;
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          for (const p of prev) {
            if (p === path || p.startsWith(`${path}/`)) next.delete(p);
          }
        } else {
          next.add(path);
        }
        return next;
      });
      void load(path);
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
        setExpanded(
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

  const onStartCreate = useCallback(
    (path: string) => {
      setCreatingIn(path);
      setNewName("");
      // Open the folder so the new folder's column is visible.
      if (path !== HOME) {
        setExpanded((prev) =>
          prev.has(path) ? prev : new Set(prev).add(path),
        );
        void load(path);
      }
    },
    [load],
  );

  const submitCreate = useCallback(async () => {
    if (!creatingIn) return;
    const result = await api.createFolder(creatingIn, newName);
    setError(result.error);
    if (!result.error) {
      setCreatingIn(null);
      await load(creatingIn);
    }
  }, [creatingIn, newName, load]);

  const cancelCreate = useCallback(() => {
    setCreatingIn(null);
    setNewName("");
  }, []);

  const { nodes, edges } = useMemo(() => {
    const nodes: AnyNode[] = [];
    const edges: Edge[] = [];

    const rowsOf = (parent: string): FsEntry[] =>
      (visibleEntries(parent) ?? []).slice(0, MAX_ROWS);
    const extraOf = (parent: string): number =>
      Math.max(0, (visibleEntries(parent)?.length ?? 0) - MAX_ROWS);
    const isOpen = (path: string) => path === HOME || expanded.has(path);

    /** Total height of an entry's row, including its open subtree. */
    const subH = (entry: FsEntry): number => {
      if (!entry.isDirectory || !isOpen(entry.path)) return ROW_H;
      return Math.max(ROW_H, blockH(entry.path));
    };

    /** Height of a folder's children block (creator + rows + overflow). */
    const blockH = (parent: string): number => {
      let h = 0;
      if (creatingIn === parent) h += ROW_H;
      for (const entry of rowsOf(parent)) h += subH(entry);
      if (extraOf(parent) > 0) h += ROW_H;
      return Math.max(ROW_H, h);
    };

    /** Lay out a folder's children column, centered rows, subtrees right. */
    const placeChildren = (parent: string, x: number, yTop: number) => {
      let y = yTop;
      if (creatingIn === parent) {
        nodes.push({
          id: "creator",
          type: "creator",
          position: { x, y: y + (ROW_H - NODE_H) / 2 },
          draggable: false,
          zIndex: 10,
          data: {
            parentName:
              parent === HOME ? "Home" : (parent.split("/").pop() ?? parent),
            value: newName,
            onChange: setNewName,
            onSubmit: submitCreate,
            onCancel: cancelCreate,
          },
        });
        edges.push({
          id: "creator-edge",
          source: parent,
          sourceHandle: "side",
          target: "creator",
          style: { strokeDasharray: "4 3" },
        });
        y += ROW_H;
      }
      for (const entry of rowsOf(parent)) {
        const h = subH(entry);
        const nodeY = y + (h - NODE_H) / 2;
        if (entry.isDirectory) {
          nodes.push({
            id: entry.path,
            type: "bubble",
            position: { x, y: nodeY },
            draggable: false,
            data: {
              path: entry.path,
              name: entry.name,
              isRoot: false,
              open: expanded.has(entry.path),
              count: visibleEntries(entry.path)?.length ?? null,
              onOpen,
              onDropInto,
              onTrash,
              onStartCreate,
              onHideToggle,
              hidden: hiddenPaths.has(entry.path),
              dropTarget,
            },
          });
          if (expanded.has(entry.path)) {
            placeChildren(entry.path, x + COL_W, y);
          }
        } else {
          nodes.push({
            id: entry.path,
            type: "filechip",
            position: { x, y: nodeY },
            draggable: false,
            data: { entry },
          });
        }
        edges.push({
          id: `e-${entry.path}`,
          source: parent,
          sourceHandle: "side",
          target: entry.path,
        });
        y += h;
      }
      if (extraOf(parent) > 0) {
        nodes.push({
          id: `more-${parent}`,
          type: "filechip",
          position: { x, y: y + (ROW_H - NODE_H) / 2 },
          draggable: false,
          data: {
            entry: {
              name: `+${extraOf(parent)} more`,
              path: parent,
              isDirectory: false,
            },
          },
        });
      }
    };

    // Home sits centered on its whole tree; branches cascade rightward.
    const total = blockH(HOME);
    nodes.push({
      id: HOME,
      type: "bubble",
      position: { x: 0, y: (total - NODE_H) / 2 },
      draggable: false,
      data: {
        path: HOME,
        name: "Home",
        isRoot: true,
        open: true,
        count: visibleEntries(HOME)?.length ?? null,
        onOpen,
        onDropInto,
        onTrash,
        onStartCreate,
        onHideToggle,
        hidden: false,
        dropTarget,
      },
    });
    placeChildren(HOME, COL_W, 0);

    return { nodes, edges };
  }, [
    expanded,
    dropTarget,
    creatingIn,
    newName,
    hiddenPaths,
    visibleEntries,
    onOpen,
    onDropInto,
    onTrash,
    onStartCreate,
    onHideToggle,
    submitCreate,
    cancelCreate,
  ]);

  // Prefetch entries for visible folders so counts fill in.
  useEffect(() => {
    for (const parent of [HOME, ...expanded]) {
      for (const entry of entriesByPath[parent] ?? []) {
        if (entry.isDirectory && entriesByPath[entry.path] === undefined) {
          void load(entry.path);
        }
      }
    }
  }, [expanded, entriesByPath, load]);

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
          Click folders to open them beside their parent — open as many branches
          as you like; highlighted boxes are your trail back. Drag any box onto
          a folder to move it; undo in History.
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
      <div className="sf-files-filters">
        <span>Show:</span>
        {KINDS.map((kind) => (
          <button
            key={kind.key}
            type="button"
            className="sf-filter-pill"
            aria-pressed={!hiddenKinds.has(kind.key)}
            onClick={() => toggleKind(kind.key)}
          >
            {kind.label}
          </button>
        ))}
        <button
          type="button"
          className="sf-filter-pill"
          aria-pressed={!hiddenKinds.has("other")}
          onClick={() => toggleKind("other")}
        >
          Other
        </button>
        {hiddenPaths.size > 0 && (
          <button
            type="button"
            className="sf-filter-pill sf-filter-hidden"
            aria-pressed={showHidden}
            title="Reveal hidden folders (dimmed) so you can bring them back"
            onClick={() => setShowHidden((s) => !s)}
          >
            Hidden: {hiddenPaths.size}
          </button>
        )}
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
            defaultEdgeOptions={{
              type: "smoothstep",
              style: { stroke: "#94a3b8", strokeWidth: 1.6 },
            }}
            panOnScroll
            zoomOnScroll={false}
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
