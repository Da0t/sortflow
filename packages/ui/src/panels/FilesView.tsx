import { ArrowLeft, ChevronRight, File, Folder } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { type FsEntry, api } from "../bridge";
import { readFolderDragPath, setFolderDragData } from "../lib/folderDrop";
import { useFlowStore } from "../store";

const ROOTS = [
  "~",
  "~/Desktop",
  "~/Documents",
  "~/Downloads",
  "~/Pictures",
  "~/Movies",
  "~/Music",
];

function FileBrowser({
  side,
  reloadTick,
  onMoved,
}: {
  side: "left" | "right";
  reloadTick: number;
  onMoved: () => void;
}) {
  // Left pane starts at the whole home tree; right pane at the Desktop.
  const [root, setRoot] = useState(side === "left" ? "~" : "~/Desktop");
  const [entriesByPath, setEntriesByPath] = useState<Record<string, FsEntry[]>>(
    {},
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    const kids = await api.listEntries(path);
    setEntriesByPath((c) => ({ ...c, [path]: kids }));
  }, []);

  useEffect(() => {
    void load(root);
    for (const p of expanded) {
      void load(p);
    }
  }, [root, expanded, load]);

  // A move happened (in either pane) — re-list everything that's visible.
  useEffect(() => {
    if (reloadTick > 0) {
      void load(root);
      for (const p of expanded) {
        void load(p);
      }
    }
  }, [reloadTick, root, expanded, load]);

  const toggle = (entry: FsEntry) => {
    if (!entry.isDirectory) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.add(entry.path);
      }
      return next;
    });
  };

  const drop = async (destDir: string, e: React.DragEvent) => {
    const src = readFolderDragPath(e.dataTransfer);
    setDropTarget(null);
    if (!src) return;
    e.preventDefault();
    e.stopPropagation();
    const result = await api.moveEntry(src, destDir);
    setError(result.error);
    onMoved();
  };

  const dragOver = (destDir: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(destDir);
  };

  const renderEntries = (entries: FsEntry[], depth: number): ReactElement[] =>
    entries.map((entry) => {
      const isOpen = entry.isDirectory && expanded.has(entry.path);
      const kids = entriesByPath[entry.path];
      return (
        <div key={entry.path}>
          <button
            type="button"
            className={`sf-file-row${
              dropTarget === entry.path ? " sf-file-row-drop" : ""
            }`}
            style={{ paddingLeft: 6 + depth * 14 }}
            title={entry.path}
            draggable
            onClick={() => toggle(entry)}
            onDragStart={(e) => {
              setFolderDragData(e.dataTransfer, entry.path);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={
              entry.isDirectory ? (e) => dragOver(entry.path, e) : undefined
            }
            onDragLeave={() => setDropTarget(null)}
            onDrop={
              entry.isDirectory ? (e) => void drop(entry.path, e) : undefined
            }
          >
            <ChevronRight
              size={12}
              strokeWidth={2}
              aria-hidden="true"
              className={`sf-folder-chevron${isOpen ? " sf-open" : ""}`}
              style={entry.isDirectory ? undefined : { visibility: "hidden" }}
            />
            {entry.isDirectory ? (
              <Folder
                size={13}
                strokeWidth={2}
                aria-hidden="true"
                className="sf-folder-icon"
              />
            ) : (
              <File
                size={13}
                strokeWidth={2}
                aria-hidden="true"
                className="sf-folder-icon"
              />
            )}
            <span className="sf-folder-name">{entry.name}</span>
          </button>
          {isOpen && kids === undefined && (
            <span
              className="sf-folder-empty"
              style={{ paddingLeft: 20 + (depth + 1) * 14 }}
            >
              Loading…
            </span>
          )}
          {isOpen && kids !== undefined && kids.length === 0 && (
            <span
              className="sf-folder-empty"
              style={{ paddingLeft: 20 + (depth + 1) * 14 }}
            >
              Empty folder
            </span>
          )}
          {isOpen &&
            kids !== undefined &&
            kids.length > 0 &&
            renderEntries(kids, depth + 1)}
        </div>
      );
    });

  const rootEntries = entriesByPath[root];

  return (
    <div className="sf-files-pane">
      <select
        value={root}
        onChange={(e) => setRoot(e.target.value)}
        className="sf-autosetup-select"
        aria-label={`${side} pane folder`}
        onDragOver={(e) => dragOver(root, e)}
        onDrop={(e) => void drop(root, e)}
      >
        {ROOTS.map((r) => (
          <option key={r} value={r}>
            {r === "~" ? "Home" : r.replace("~/", "")}
          </option>
        ))}
      </select>
      {error && (
        <p className="sf-generate-error" role="alert">
          {error}
        </p>
      )}
      <div
        className={`sf-files-list${
          dropTarget === root ? " sf-file-row-drop" : ""
        }`}
        onDragOver={(e) => dragOver(root, e)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => void drop(root, e)}
      >
        {rootEntries === undefined ? (
          <span className="sf-folder-empty">Loading…</span>
        ) : rootEntries.length === 0 ? (
          <span className="sf-folder-empty">Empty folder</span>
        ) : (
          renderEntries(rootEntries, 0)
        )}
      </div>
    </div>
  );
}

/**
 * The Files page: two independent folder panes. Drag any file or folder and
 * drop it on a folder (or a pane's background to use its root). Every move
 * goes through the engine's journal, so History shows it and Undo works.
 */
export function FilesView() {
  const setView = useFlowStore((s) => s.setView);
  const [tick, setTick] = useState(0);

  const handleMoved = () => {
    setTick((t) => t + 1);
    // History listens to the shared refresh tick.
    useFlowStore.getState().bumpRefresh();
  };

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
          Move files by hand — drag anything onto a folder. Every move shows in
          History and can be undone.
        </span>
      </div>
      <div className="sf-files-panes">
        <FileBrowser side="left" reloadTick={tick} onMoved={handleMoved} />
        <FileBrowser side="right" reloadTick={tick} onMoved={handleMoved} />
      </div>
    </div>
  );
}
