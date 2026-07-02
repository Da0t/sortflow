import {
  ArrowLeft,
  ChevronRight,
  File,
  Folder,
  House,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { type FsEntry, api } from "../bridge";
import { readFolderDragPath, setFolderDragData } from "../lib/folderDrop";
import { useFlowStore } from "../store";

const HOME = "~";

/**
 * The Files page: one classic connected tree of your whole home directory —
 * Finder-outline style, with guide lines linking every branch. Expand any
 * folder in place, then drag any file or folder onto any folder row (or the
 * Home header) to move it. Every move is journaled: it shows in History and
 * can be undone. Nothing is ever overwritten.
 */
export function FilesView() {
  const setView = useFlowStore((s) => s.setView);
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

  const drop = async (destDir: string, e: React.DragEvent) => {
    const src = readFolderDragPath(e.dataTransfer);
    setDropTarget(null);
    if (!src) return;
    e.preventDefault();
    e.stopPropagation();
    const result = await api.moveEntry(src, destDir);
    setError(result.error);
    // History listens to the shared refresh tick.
    useFlowStore.getState().bumpRefresh();
    refreshAll();
  };

  const dragOver = (destDir: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(destDir);
  };

  const renderEntries = (entries: FsEntry[]): ReactElement[] =>
    entries.map((entry) => {
      const isOpen = entry.isDirectory && expanded.has(entry.path);
      const kids = entriesByPath[entry.path];
      return (
        <div key={entry.path} className="sf-tree-item">
          <button
            type="button"
            className={`sf-file-row${
              dropTarget === entry.path ? " sf-file-row-drop" : ""
            }`}
            title={entry.path}
            draggable
            onClick={() => toggle(entry.path)}
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
          {isOpen && (
            <div className="sf-tree-children">
              {kids === undefined ? (
                <span className="sf-folder-empty">Loading…</span>
              ) : kids.length === 0 ? (
                <span className="sf-folder-empty">Empty folder</span>
              ) : (
                renderEntries(kids)
              )}
            </div>
          )}
        </div>
      );
    });

  const rootEntries = entriesByPath[HOME];

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
          Your whole directory as one tree — expand any branch, then drag any
          file or folder onto a folder to move it. Undo any move in History.
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
      <div className="sf-tree-scroll">
        <button
          type="button"
          className={`sf-file-row sf-tree-root${
            dropTarget === HOME ? " sf-file-row-drop" : ""
          }`}
          title="Your home folder"
          onDragOver={(e) => dragOver(HOME, e)}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => void drop(HOME, e)}
        >
          <House size={13} strokeWidth={2} aria-hidden="true" />
          Home
        </button>
        <div className="sf-tree-children">
          {rootEntries === undefined ? (
            <span className="sf-folder-empty">Loading…</span>
          ) : rootEntries.length === 0 ? (
            <span className="sf-folder-empty">Empty folder</span>
          ) : (
            renderEntries(rootEntries)
          )}
        </div>
      </div>
    </div>
  );
}
