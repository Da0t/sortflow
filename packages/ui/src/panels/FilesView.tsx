import {
  ArrowLeft,
  ChevronDown,
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
/** Widest a single branch fans out before collapsing into "+N more". */
const MAX_KIDS = 12;

/**
 * The Files page: your directory drawn as a top-down tree diagram — every
 * file and folder is a box, children branch out beneath their parent with
 * connector lines, binary-tree style. Click a folder box to expand its
 * branch; drag any box onto a folder box to move it. Every move is
 * journaled: it shows in History and can be undone.
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

  const renderNode = (entry: FsEntry): ReactElement => {
    const isOpen = entry.isDirectory && expanded.has(entry.path);
    const kids = entriesByPath[entry.path];
    const shown = kids?.slice(0, MAX_KIDS) ?? [];
    const extra = (kids?.length ?? 0) - shown.length;
    return (
      <div key={entry.path} className="sf-btree-sub">
        <button
          type="button"
          className={`sf-btree-box${
            entry.isDirectory ? " sf-btree-folder" : ""
          }${dropTarget === entry.path ? " sf-btree-drop" : ""}`}
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
            <ChevronDown
              size={11}
              strokeWidth={2}
              aria-hidden="true"
              className={`sf-btree-chevron${isOpen ? " sf-open" : ""}`}
            />
          )}
        </button>
        {isOpen && (
          <div className="sf-btree-children">
            {kids === undefined ? (
              <div className="sf-btree-sub">
                <span className="sf-btree-box sf-btree-note">Loading…</span>
              </div>
            ) : kids.length === 0 ? (
              <div className="sf-btree-sub">
                <span className="sf-btree-box sf-btree-note">Empty</span>
              </div>
            ) : (
              <>
                {shown.map(renderNode)}
                {extra > 0 && (
                  <div className="sf-btree-sub">
                    <span className="sf-btree-box sf-btree-note">
                      +{extra} more
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const rootEntries = entriesByPath[HOME];
  const rootShown = rootEntries?.slice(0, MAX_KIDS) ?? [];
  const rootExtra = (rootEntries?.length ?? 0) - rootShown.length;

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
          Your directory as a branching tree — click a folder box to open its
          branch, drag any box onto a folder box to move it. Undo in History.
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
      <div className="sf-btree-scroll">
        <div className="sf-btree">
          <div className="sf-btree-sub sf-btree-rootsub">
            <button
              type="button"
              className={`sf-btree-box sf-btree-folder sf-btree-root${
                dropTarget === HOME ? " sf-btree-drop" : ""
              }`}
              title="Your home folder"
              onDragOver={(e) => dragOver(HOME, e)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => void drop(HOME, e)}
            >
              <House size={13} strokeWidth={2} aria-hidden="true" />
              Home
            </button>
            <div className="sf-btree-children">
              {rootEntries === undefined ? (
                <div className="sf-btree-sub">
                  <span className="sf-btree-box sf-btree-note">Loading…</span>
                </div>
              ) : (
                <>
                  {rootShown.map(renderNode)}
                  {rootExtra > 0 && (
                    <div className="sf-btree-sub">
                      <span className="sf-btree-box sf-btree-note">
                        +{rootExtra} more
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
