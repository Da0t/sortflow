import { ChevronRight, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { type FolderEntry, api } from "../bridge";
import { setFolderDragData } from "../lib/folderDrop";

/**
 * Lazy-loading tree of the user's home folders. Rows are draggable: drop one
 * on the canvas to create a Move node there, or onto an existing Move node
 * to point it at that folder.
 */
export function FolderTree() {
  const [roots, setRoots] = useState<FolderEntry[] | null>(null);
  const [childrenByPath, setChildrenByPath] = useState<
    Record<string, FolderEntry[]>
  >({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void api.listFolders().then((entries) => {
      if (!cancelled) setRoots(entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (entry: FolderEntry) => {
    if (!entry.hasChildren) return;
    const next = new Set(expanded);
    if (next.has(entry.path)) {
      next.delete(entry.path);
    } else {
      next.add(entry.path);
      // Refetch on every expand: keeps the tree fresh, and folders that were
      // unreadable (e.g. before a macOS permission grant) get a retry path.
      void api.listFolders(entry.path).then((kids) => {
        setChildrenByPath((c) => ({ ...c, [entry.path]: kids }));
      });
    }
    setExpanded(next);
  };

  const renderEntries = (
    entries: FolderEntry[],
    depth: number,
  ): ReactElement[] =>
    entries.map((entry) => {
      const isOpen = expanded.has(entry.path);
      const kids = childrenByPath[entry.path];
      return (
        <div key={entry.path}>
          <button
            type="button"
            className="sf-folder-row"
            style={{ paddingLeft: 6 + depth * 14 }}
            title={entry.path}
            draggable
            aria-expanded={entry.hasChildren ? isOpen : undefined}
            onClick={() => toggle(entry)}
            onDragStart={(e) => {
              setFolderDragData(e.dataTransfer, entry.path);
              e.dataTransfer.effectAllowed = "copy";
            }}
          >
            <ChevronRight
              size={12}
              strokeWidth={2}
              aria-hidden="true"
              className={`sf-folder-chevron${isOpen ? " sf-open" : ""}`}
              style={entry.hasChildren ? undefined : { visibility: "hidden" }}
            />
            <Folder
              size={13}
              strokeWidth={2}
              aria-hidden="true"
              className="sf-folder-icon"
            />
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
              No subfolders
            </span>
          )}
          {isOpen &&
            kids !== undefined &&
            kids.length > 0 &&
            renderEntries(kids, depth + 1)}
        </div>
      );
    });

  if (roots === null) {
    return (
      <div className="sf-folder-tree">
        <span className="sf-folder-empty">Loading folders…</span>
      </div>
    );
  }
  return (
    <div className="sf-folder-tree">
      {roots.length === 0 ? (
        <span className="sf-folder-empty">No folders found</span>
      ) : (
        renderEntries(roots, 0)
      )}
    </div>
  );
}
