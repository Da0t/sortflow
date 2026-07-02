import type { JournalEntry, Proposal } from "@sortflow/engine";
import { useCallback, useEffect, useState } from "react";
import { api } from "../bridge";

export function HistoryPanel() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  const refresh = useCallback(async () => {
    const all = await api.listJournal();
    setEntries(all.sort((a, b) => b.ts - a.ts));
  }, []);

  useEffect(() => {
    void refresh();
    return api.onExecuted((_p: Proposal) => void refresh());
  }, [refresh]);

  return (
    <div className="sf-history">
      <h3>History</h3>
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
                onClick={() => void api.undo(e.id).then(() => refresh())}
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
