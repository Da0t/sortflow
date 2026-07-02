import type { JournalEntry, Proposal } from "@sortflow/engine";
import { History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../bridge";
import { useFlowStore } from "../store";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function HistoryPanel() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await api.listJournal();
    setEntries(all.sort((a, b) => b.ts - a.ts));
  }, []);

  const undo = useCallback(
    (id: string) => {
      setError(null);
      api
        .undo(id)
        .then(() => refresh())
        .catch((e: unknown) => setError(message(e)));
    },
    [refresh],
  );

  useEffect(() => {
    refresh().catch((e: unknown) => setError(message(e)));
    return api.onExecuted((_p: Proposal) => void refresh());
  }, [refresh]);

  // Manual moves from the Files page bump the shared tick instead of
  // emitting engine events.
  const refreshTick = useFlowStore((s) => s.refreshTick);
  useEffect(() => {
    if (refreshTick > 0) {
      refresh().catch((e: unknown) => setError(message(e)));
    }
  }, [refresh, refreshTick]);

  const doneCount = entries.filter((e) => e.status === "done").length;

  return (
    <div className="sf-history">
      <h3>
        <History size={14} strokeWidth={2} aria-hidden="true" />
        History
      </h3>
      {error && <p className="sf-error">{error}</p>}
      {doneCount > 1 && (
        <button
          type="button"
          className="sf-btn-neutral sf-btn-undo-all"
          onClick={() => {
            if (
              !window.confirm(
                `Undo all ${doneCount} moves? Every file goes back to where it came from.`,
              )
            )
              return;
            setError(null);
            api
              .undoAll()
              .then(() => refresh())
              .catch((e: unknown) => setError(message(e)));
          }}
        >
          Undo all ({doneCount})
        </button>
      )}
      {entries.length === 0 && <p className="sf-empty">No moves yet.</p>}
      <ul>
        {entries.slice(0, 50).map((e) => (
          <li key={e.id}>
            <span className={`sf-status sf-status-${e.status}`}>
              {e.status}
            </span>
            <span className="sf-proposal">
              {e.from} → {e.to}
            </span>
            {e.status === "done" && (
              <button
                type="button"
                className="sf-btn-neutral"
                onClick={() => undo(e.id)}
              >
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
