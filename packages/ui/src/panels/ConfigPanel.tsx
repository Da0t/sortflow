import type {
  ClassifyConfig,
  FilterConfig,
  MoveConfig,
  NodeConfig,
  WatchConfig,
} from "@sortflow/engine";
import { CalendarDays, FolderOpen, Trash2, TriangleAlert } from "lucide-react";
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
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    setStreak(null);
    if (node?.data.kind === "move" && selectedId) {
      void api.approvalStreak(selectedId).then(setStreak);
    }
  }, [selectedId, node?.data.kind]);

  const save = async () => {
    setSaveError(null);
    try {
      const result = await api.setPipeline(toPipeline());
      setProblems(result.problems);
      const ok = result.problems.length === 0;
      setSaved(ok);
      if (ok) {
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
      <button type="button" className="sf-save" onClick={() => void save()}>
        Save &amp; Apply
      </button>
      {saved && problems.length === 0 && (
        <p className="sf-saved">Pipeline applied ✓</p>
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
