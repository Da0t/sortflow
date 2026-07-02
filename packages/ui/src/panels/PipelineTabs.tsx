import type { PipelineLibrarySummary } from "@sortflow/engine";
import {
  Maximize2,
  Minimize2,
  Plus,
  Power,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../bridge";
import { useFlowStore } from "../store";

/**
 * Tab bar above the canvas for the pipeline library. Click switches the
 * editor (the outgoing canvas is stashed as a draft, so nothing is lost),
 * + creates, double-click renames, × deletes. The power dot toggles whether
 * a pipeline runs — all enabled pipelines run at once.
 */
export function PipelineTabs() {
  const [state, setState] = useState<PipelineLibrarySummary | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const loadPipeline = useFlowStore((s) => s.loadPipeline);
  const toPipeline = useFlowStore((s) => s.toPipeline);
  const focusMode = useFlowStore((s) => s.focusMode);
  const toggleFocusMode = useFlowStore((s) => s.toggleFocusMode);

  useEffect(() => {
    let cancelled = false;
    void api.listPipelines().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const switchTo = async (id: string) => {
    if (id === state.activeId) return;
    const result = await api.switchPipeline(id, toPipeline());
    setState(result.state);
    loadPipeline(result.pipeline);
  };

  const create = async () => {
    const result = await api.createPipeline(toPipeline());
    setState(result.state);
    loadPipeline(result.pipeline);
  };

  const remove = async (id: string) => {
    const name = state.pipelines.find((p) => p.id === id)?.name ?? "pipeline";
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const wasActive = id === state.activeId;
    const result = await api.deletePipeline(id);
    setState(result.state);
    if (wasActive) loadPipeline(result.pipeline);
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    const result = await api.setPipelineEnabled(id, enabled);
    setState(result.state);
    setProblems(result.problems);
    setWarnings(result.warnings ?? []);
  };

  const commitRename = async (id: string) => {
    setEditingId(null);
    const name = draftName.trim();
    if (!name) return;
    setState(await api.renamePipeline(id, name));
  };

  return (
    <div className="sf-tabs-bar">
      <div className="sf-tabs" role="tablist" aria-label="Pipelines">
        {state.pipelines.map((p) => (
          <div
            key={p.id}
            className={`sf-tab${p.id === state.activeId ? " sf-tab-active" : ""}`}
          >
            <button
              type="button"
              className={`sf-tab-power${p.enabled ? " sf-on" : ""}`}
              title={
                p.enabled
                  ? "Running when applied — click to turn off"
                  : "Off — click to turn on"
              }
              aria-label={`Turn ${p.name} ${p.enabled ? "off" : "on"}`}
              onClick={() => void toggleEnabled(p.id, !p.enabled)}
            >
              <Power size={11} strokeWidth={2.5} aria-hidden="true" />
            </button>
            {editingId === p.id ? (
              <input
                className="sf-tab-rename"
                value={draftName}
                aria-label="Pipeline name"
                // biome-ignore lint/a11y/noAutofocus: rename input appears on demand
                autoFocus
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => void commitRename(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename(p.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="sf-tab-name"
                role="tab"
                aria-selected={p.id === state.activeId}
                title="Double-click to rename"
                onClick={() => void switchTo(p.id)}
                onDoubleClick={() => {
                  setEditingId(p.id);
                  setDraftName(p.name);
                }}
              >
                {p.name}
              </button>
            )}
            <button
              type="button"
              className="sf-tab-close"
              aria-label={`Delete ${p.name}`}
              onClick={() => void remove(p.id)}
            >
              <X size={11} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="sf-tabs-add"
          aria-label="New pipeline"
          title="New pipeline"
          onClick={() => void create()}
        >
          <Plus size={13} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sf-tabs-focus"
          aria-label={focusMode ? "Show panels" : "Focus on the graph"}
          title={
            focusMode
              ? "Show panels"
              : "Focus mode — hide everything but the graph"
          }
          onClick={toggleFocusMode}
        >
          {focusMode ? (
            <Minimize2 size={13} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Maximize2 size={13} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      </div>
      {problems.length > 0 && (
        <div className="sf-tabs-problems" role="alert">
          {problems.map((p) => (
            <p key={p}>
              <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
              {p}
            </p>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="sf-warnings sf-tabs-warnings">
          {warnings.map((w) => (
            <p key={w}>
              <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
