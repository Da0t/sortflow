import { Wand2 } from "lucide-react";
import { useState } from "react";
import { api } from "../bridge";
import { loadDestBase } from "../lib/destBase";
import { useFlowStore } from "../store";

/**
 * Natural-language pipeline drafting: describe what you want sorted where,
 * a local Ollama model fills in the rules, and the drafted graph is loaded
 * onto the canvas for review. Nothing runs until Save & Apply.
 */
export function GenerateSection() {
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    const text = description.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      // Pass the Sort-into preference so drafted destinations land where
      // the user actually organizes.
      const result = await api.generatePipeline(
        text,
        loadDestBase() || undefined,
      );
      if (result.pipeline) {
        useFlowStore.getState().loadPipeline(result.pipeline);
      } else {
        setError(result.error ?? "Could not draft a pipeline");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <textarea
        className="sf-generate-input"
        aria-label="Describe your pipeline"
        placeholder={'e.g. "GIFs from Downloads go to Desktop/GIFs"'}
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button
        type="button"
        className="sf-autosetup-btn"
        onClick={() => void generate()}
        disabled={busy || description.trim() === ""}
      >
        <Wand2 size={16} strokeWidth={2} aria-hidden="true" />
        {busy ? "Drafting…" : "Draft with AI"}
      </button>
      {error && (
        <p className="sf-generate-error" role="alert">
          {error}
        </p>
      )}
      <p className="sf-folder-hint">
        Drafts load onto the canvas for review — needs Ollama running
      </p>
    </>
  );
}
