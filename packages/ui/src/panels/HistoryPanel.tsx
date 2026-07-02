import type { JournalEntry, Proposal } from "@sortflow/engine";
import { useCallback, useEffect, useState } from "react";
import { api } from "../bridge";

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

  return (
    <div className="sf-history">
      <h3>History</h3>
      {error && <p className="sf-error">{error}</p>}
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
              <button type="button" onClick={() => undo(e.id)}>
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
