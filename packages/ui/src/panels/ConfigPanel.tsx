import type {
  ClassifyConfig,
  FilterConfig,
  MoveConfig,
  NodeConfig,
  WatchConfig,
} from "@sortflow/engine";
import { useState } from "react";
import { api } from "../bridge";
import { useFlowStore } from "../store";

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

export function ConfigPanel() {
  const selectedId = useFlowStore((s) => s.selectedId);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const updateConfig = useFlowStore((s) => s.updateConfig);
  const toPipeline = useFlowStore((s) => s.toPipeline);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    setSaveError(null);
    try {
      const result = await api.setPipeline(toPipeline());
      setProblems(result.problems);
      setSaved(result.problems.length === 0);
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
              <TextField
                label="Folder path"
                value={c.path}
                onChange={(v) => set({ ...c, path: v })}
              />
              <CheckField
                label="Include subfolders"
                value={c.recursive}
                onChange={(v) => set({ ...c, recursive: v })}
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
              <TextField
                label="Destination"
                value={c.destination}
                onChange={(v) => set({ ...c, destination: v })}
              />
              <CheckField
                label="Automatic (skip review)"
                value={c.auto}
                onChange={(v) => set({ ...c, auto: v })}
              />
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
            <p key={p}>⚠ {p}</p>
          ))}
        </div>
      )}
      {saveError && (
        <div className="sf-problems" role="alert">
          <p>⚠ {saveError}</p>
        </div>
      )}
    </div>
  );
}
