import type { Proposal } from "@sortflow/engine";
import { useCallback, useEffect, useState } from "react";
import { api } from "../bridge";
import { useFlowStore } from "../store";

export function ReviewTray() {
  const [proposals, setProposals] = useState<Proposal[]>([]);

  const refresh = useCallback(async () => {
    setProposals(await api.listProposals());
  }, []);

  useEffect(() => {
    void refresh();
    const offProposal = api.onProposal(() => void refresh());
    const offExecuted = api.onExecuted((p) => {
      useFlowStore.getState().animatePath(p.routeNodeIds);
      void refresh();
    });
    return () => {
      offProposal();
      offExecuted();
    };
  }, [refresh]);

  const pending = proposals.filter((p) => p.status === "pending");

  return (
    <div className="sf-tray">
      <h3>
        Review{" "}
        {pending.length > 0 && (
          <span className="sf-count">{pending.length}</span>
        )}
      </h3>
      {pending.length === 0 && (
        <p className="sf-empty">Nothing waiting for review.</p>
      )}
      {pending.length > 1 && (
        <button
          type="button"
          onClick={() => {
            for (const p of pending)
              void api.approve(p.id).then(() => refresh());
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
              onClick={() => void api.approve(p.id).then(() => refresh())}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => void api.reject(p.id).then(() => refresh())}
            >
              Reject
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
