import type {
  ClassifyConfig,
  FilterConfig,
  MoveConfig,
  NodeConfig,
  PipelinePreview,
  WatchConfig,
} from "@sortflow/engine";
import {
  CalendarDays,
  Eye,
  FolderOpen,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../bridge";
import {
  DEFAULTS,
  buildChips,
  mergeMany,
  mergeRecents,
} from "../lib/recentDestinations";
import { useFlowStore } from "../store";

export const PROMOTION_THRESHOLD = 10;

const RECENTS_KEY = "sf-recent-destinations";

/** One-click extension bundles so users don't need to know file types. */
const FILTER_PRESETS: Array<{ label: string; extensions: string[] }> = [
  {
    label: "Images",
    extensions: [".png", ".jpg", ".jpeg", ".gif", ".heic", ".webp", ".svg"],
  },
  {
    label: "Documents",
    extensions: [
      ".pdf",
      ".doc",
      ".docx",
      ".txt",
      ".md",
      ".rtf",
      ".csv",
      ".xlsx",
      ".xls",
      ".pptx",
      ".ppt",
      ".key",
      ".pages",
    ],
  },
  { label: "Video", extensions: [".mp4", ".mov", ".avi", ".mkv", ".webm"] },
  { label: "Audio", extensions: [".mp3", ".wav", ".m4a", ".flac", ".aac"] },
  { label: "Archives", extensions: [".zip", ".rar", ".7z", ".tar", ".gz"] },
  { label: "Installers", extensions: [".dmg", ".pkg", ".exe", ".msi"] },
];

function loadRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveRecents(recents: string[]): void {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

function TextField({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const id = `sf-field-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <label htmlFor={id} className="sf-field">
      {label}
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function CheckField({
  label,
  value,
  onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const id = `sf-field-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <label htmlFor={id} className="sf-field sf-field-check">
      <input
        id={id}
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function BrowseButton({ onPick }: { onPick: (path: string) => void }) {
  return (
    <button
      type="button"
      className="sf-browse-btn"
      aria-label="Browse for folder"
      onClick={async () => {
        const path = await api.pickFolder();
        if (path) onPick(path);
      }}
    >
      <FolderOpen size={14} strokeWidth={2} aria-hidden="true" />
      Browse…
    </button>
  );
}

function DestinationChips({ onSelect }: { onSelect: (path: string) => void }) {
  const recents = loadRecents();
  const chips = buildChips(recents, DEFAULTS);
  if (chips.length === 0) return null;
  return (
    <div className="sf-chips">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          className="sf-chip"
          title={chip}
          onClick={() => onSelect(chip)}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

export function ConfigPanel() {
  const selectedId = useFlowStore((s) => s.selectedId);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const updateConfig = useFlowStore((s) => s.updateConfig);
  const removeNode = useFlowStore((s) => s.removeNode);
  const toPipeline = useFlowStore((s) => s.toPipeline);
  const [problems, setProblems] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<PipelinePreview | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    setStreak(null);
    if (node?.data.kind === "move" && selectedId) {
      void api.approvalStreak(selectedId).then(setStreak);
    }
  }, [selectedId, node?.data.kind]);

  const runPreview = async () => {
    setSaveError(null);
    setSaved(false);
    try {
      const result = await api.previewPipeline(toPipeline());
      setProblems(result.problems);
      setPreview(result.preview ?? null);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to preview pipeline",
      );
    }
  };

  const save = async () => {
    setSaveError(null);
    try {
      const result = await api.setPipeline(toPipeline());
      setProblems(result.problems);
      setWarnings(result.warnings ?? []);
      const ok = result.problems.length === 0;
      setSaved(ok);
      if (ok) {
        // The engine restart re-points pending proposals — refresh the tray.
        useFlowStore.getState().bumpRefresh();
        // Collect all move-node destinations and merge into MRU.
        const destinations = toPipeline()
          .nodes.filter((n) => n.kind === "move")
          .map((n) => (n.config as MoveConfig).destination)
          .filter(Boolean);
        if (destinations.length > 0) {
          saveRecents(mergeMany(loadRecents(), destinations));
        }
      }
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save pipeline",
      );
      setSaved(false);
    }
  };

  const set = (config: NodeConfig) =>
    selectedId && updateConfig(selectedId, config);

  return (
    <div className="sf-config">
      <h3>Node settings</h3>
      {!node && <p>Select a node to edit it.</p>}
      {node?.data.kind === "watch" &&
        (() => {
          const c = node.data.config as WatchConfig;
          return (
            <>
              <div className="sf-field-row">
                <TextField
                  label="Folder path"
                  value={c.path}
                  onChange={(v) => set({ ...c, path: v })}
                />
                <BrowseButton onPick={(path) => set({ ...c, path })} />
              </div>
              <CheckField
                label="Include subfolders"
                value={c.recursive}
                onChange={(v) => set({ ...c, recursive: v })}
              />
              {c.recursive && (
                <p
                  className="sf-hint-muted"
                  style={{ fontSize: 12, color: "var(--sf-text-muted)" }}
                >
                  Files inside subfolders are sorted individually — folders
                  themselves are never moved.
                </p>
              )}
              <CheckField
                label="Sort existing files when applied"
                value={c.scanExisting ?? false}
                onChange={(v) => set({ ...c, scanExisting: v })}
              />
              <CheckField
                label="Also sort folders"
                value={c.includeFolders ?? false}
                onChange={(v) => set({ ...c, includeFolders: v })}
              />
              {c.includeFolders && (
                <p
                  className="sf-hint-muted"
                  style={{ fontSize: 12, color: "var(--sf-text-muted)" }}
                >
                  Folders route through your graph like files — an AI Classify
                  node judges them by name and contents. Folder moves always
                  wait for your approval, even on automatic rules.
                </p>
              )}
            </>
          );
        })()}
      {node?.data.kind === "filter" &&
        (() => {
          const c = node.data.config as FilterConfig;
          return (
            <>
              <TextField
                label="Extensions (comma-separated)"
                value={(c.extensions ?? []).join(", ")}
                onChange={(v) =>
                  set({
                    ...c,
                    extensions: v
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
              <div className="sf-chips">
                {FILTER_PRESETS.map(({ label, extensions }) => (
                  <button
                    key={label}
                    type="button"
                    className="sf-chip"
                    title={extensions.join(" ")}
                    onClick={() =>
                      set({
                        ...c,
                        extensions: Array.from(
                          new Set([...(c.extensions ?? []), ...extensions]),
                        ),
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <TextField
                label="Name pattern"
                value={c.namePattern ?? ""}
                onChange={(v) => set({ ...c, namePattern: v || undefined })}
              />
              <CheckField
                label="Pattern is regex"
                value={c.regex ?? false}
                onChange={(v) => set({ ...c, regex: v })}
              />
              <label htmlFor="sf-field-older-than-days-" className="sf-field">
                Older than (days)
                <input
                  id="sf-field-older-than-days-"
                  type="number"
                  min={0}
                  value={c.minAgeDays ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = Number(v);
                    set({
                      ...c,
                      minAgeDays: v === "" || n < 0 ? undefined : n,
                    });
                  }}
                />
              </label>
              <label htmlFor="sf-field-newer-than-days-" className="sf-field">
                Newer than (days)
                <input
                  id="sf-field-newer-than-days-"
                  type="number"
                  min={0}
                  value={c.maxAgeDays ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = Number(v);
                    set({
                      ...c,
                      maxAgeDays: v === "" || n < 0 ? undefined : n,
                    });
                  }}
                />
              </label>
            </>
          );
        })()}
      {node?.data.kind === "classify" &&
        (() => {
          const c = node.data.config as ClassifyConfig;
          return (
            <>
              <TextField
                label="Categories (comma-separated)"
                value={c.categories.join(", ")}
                onChange={(v) =>
                  set({
                    ...c,
                    categories: v
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
              <TextField
                label="Ollama model"
                value={c.model}
                onChange={(v) => set({ ...c, model: v })}
              />
              <label htmlFor="sf-field-ai-guidance" className="sf-field">
                What goes where (optional)
                <textarea
                  id="sf-field-ai-guidance"
                  className="sf-generate-input"
                  rows={3}
                  placeholder='e.g. "receipts are purchase screenshots; school files mention course codes like CSE 101"'
                  value={c.instructions ?? ""}
                  onChange={(e) =>
                    set({ ...c, instructions: e.target.value || undefined })
                  }
                />
              </label>
              <p
                className="sf-hint-muted"
                style={{ fontSize: 12, color: "var(--sf-text-muted)" }}
              >
                Sent to the AI with every file so it knows how you sort. It sees
                filenames (plus text-file contents), not image pixels.
              </p>
            </>
          );
        })()}
      {node?.data.kind === "move" &&
        (() => {
          const c = node.data.config as MoveConfig;
          return (
            <>
              <div className="sf-field-row">
                <TextField
                  label="Destination"
                  value={c.destination}
                  onChange={(v) => set({ ...c, destination: v })}
                />
                <BrowseButton
                  onPick={(path) => set({ ...c, destination: path })}
                />
              </div>
              <DestinationChips
                onSelect={(path) => set({ ...c, destination: path })}
              />
              {c.destination !== "" &&
                !c.destination.includes("{fileYYYY}") && (
                  <button
                    type="button"
                    className="sf-chip sf-chip-action"
                    onClick={() =>
                      set({
                        ...c,
                        destination: `${c.destination.replace(/\/+$/, "")}/{fileYYYY}/{fileMM}`,
                      })
                    }
                  >
                    <CalendarDays
                      size={12}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    Group into Year/Month by file date
                  </button>
                )}
              <p
                className="sf-hint-muted"
                style={{ fontSize: 12, color: "var(--sf-text-muted)" }}
              >
                {
                  "Tokens: {category} {YYYY} {MM} {fileYYYY} {fileMM} {fileDD} — file… tokens use the file's own date"
                }
              </p>
              <TextField
                label="Rename pattern (optional)"
                value={c.renamePattern ?? ""}
                onChange={(v) => set({ ...c, renamePattern: v || undefined })}
              />
              <p
                className="sf-hint-muted"
                style={{ fontSize: 12, color: "var(--sf-text-muted)" }}
              >
                {
                  'e.g. "{fileYYYY}-{fileMM} {name}" renames files as they move; the extension is kept automatically'
                }
              </p>
              <CheckField
                label="Automatic (skip review)"
                value={c.auto}
                onChange={(v) => set({ ...c, auto: v })}
              />
              {streak !== null && (
                <p className="sf-streak">
                  Approved {streak} in a row
                  {streak >= PROMOTION_THRESHOLD && !c.auto && (
                    <button
                      type="button"
                      onClick={() => set({ ...c, auto: true })}
                    >
                      Make automatic
                    </button>
                  )}
                </p>
              )}
            </>
          );
        })()}
      <button
        type="button"
        className="sf-preview-btn"
        title="Scan watched folders and show what would move — nothing moves yet"
        onClick={() => void runPreview()}
      >
        <Eye size={14} strokeWidth={2} aria-hidden="true" />
        Preview
      </button>
      {preview && (
        <div className="sf-preview-result" aria-live="polite">
          <p className="sf-preview-title">
            {preview.wouldMove} of {preview.total} files would move
            {preview.truncated ? " (first 2000 scanned)" : ""}
          </p>
          {preview.buckets.map((b) => (
            <p key={b.moveNodeId} className="sf-preview-line">
              {b.count} → {b.destination}
            </p>
          ))}
          {preview.needsClassify > 0 && (
            <p className="sf-preview-line">
              {preview.needsClassify} would be AI-classified (folder depends on
              category)
            </p>
          )}
          {preview.unmatched > 0 && (
            <p className="sf-preview-line">
              {preview.unmatched} match no rule and stay put
            </p>
          )}
        </div>
      )}
      <button type="button" className="sf-save" onClick={() => void save()}>
        Save &amp; Apply
      </button>
      {saved && problems.length === 0 && (
        <p className="sf-saved">Pipeline applied ✓</p>
      )}
      {warnings.length > 0 && (
        <div className="sf-warnings">
          {warnings.map((w) => (
            <p key={w}>
              <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
              {w}
            </p>
          ))}
        </div>
      )}
      {problems.length > 0 && (
        <div className="sf-problems">
          {problems.map((p) => (
            <p key={p}>
              <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
              {p}
            </p>
          ))}
        </div>
      )}
      {saveError && (
        <div className="sf-problems" role="alert">
          <p>
            <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
            {saveError}
          </p>
        </div>
      )}
      {node && (
        <button
          type="button"
          className="sf-delete-node"
          onClick={() => removeNode(node.id)}
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
          Delete node
        </button>
      )}
    </div>
  );
}
