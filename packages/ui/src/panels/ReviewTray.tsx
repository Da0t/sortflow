import type { Proposal } from "@sortflow/engine";
import { ListChecks } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../bridge";
import { useFlowStore } from "../store";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ReviewTray() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setProposals(await api.listProposals());
  }, []);

  // Run an action, then refresh, surfacing any failure instead of swallowing it.
  const guard = useCallback(
    (action: Promise<void>) => {
      setError(null);
      action.then(() => refresh()).catch((e: unknown) => setError(message(e)));
    },
    [refresh],
  );

  useEffect(() => {
    refresh().catch((e: unknown) => setError(message(e)));
    const offProposal = api.onProposal(() => void refresh());
    const offExecuted = api.onExecuted((p) => {
      useFlowStore.getState().animatePath(p.routeNodeIds);
      void refresh();
    });
    const offStuck = api.onStuck(() => void refresh());
    return () => {
      offProposal();
      offExecuted();
      offStuck();
    };
  }, [refresh]);

  const pending = proposals.filter((p) => p.status === "pending");
  const failed = proposals.filter((p) => p.status === "failed");

  return (
    <div className="sf-tray">
      <h3>
        <ListChecks size={14} strokeWidth={2} aria-hidden="true" />
        Review{" "}
        {pending.length > 0 && (
          <span className="sf-count">{pending.length}</span>
        )}
      </h3>
      {error && <p className="sf-error">{error}</p>}
      {pending.length === 0 && failed.length === 0 && (
        <p className="sf-empty">Nothing waiting for review.</p>
      )}
      {pending.length > 1 && (
        <button
          type="button"
          className="sf-btn-approve-all"
          onClick={() => {
            setError(null);
            void (async () => {
              try {
                await Promise.all(pending.map((p) => api.approve(p.id)));
                await refresh();
              } catch (e) {
                setError(message(e));
              }
            })();
          }}
        >
          Approve all ({pending.length})
        </button>
      )}
      <ul>
        {pending.map((p) => (
          <li key={p.id}>
            <span className="sf-proposal">
              {p.fileName} → {p.destDir}
            </span>
            <button
              type="button"
              className="sf-btn-approve"
              onClick={() => guard(api.approve(p.id))}
            >
              Approve
            </button>
            <button
              type="button"
              className="sf-btn-neutral"
              onClick={() => guard(api.reject(p.id))}
            >
              Reject
            </button>
          </li>
        ))}
        {failed.map((p) => (
          <li key={p.id} className="sf-failed">
            <span className="sf-status sf-status-failed">failed</span>
            <span className="sf-proposal">
              {p.fileName} → {p.destDir}
            </span>
            {p.error && <span className="sf-error">{p.error}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
