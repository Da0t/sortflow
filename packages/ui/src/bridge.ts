import type { JournalEntry, Pipeline, Proposal } from "@sortflow/engine";

export interface SortflowApi {
  getPipeline(): Promise<Pipeline>;
  setPipeline(p: Pipeline): Promise<{ problems: string[] }>;
  listProposals(): Promise<Proposal[]>;
  approve(id: string): Promise<void>;
  reject(id: string): Promise<void>;
  listJournal(): Promise<JournalEntry[]>;
  undo(id: string): Promise<void>;
  approvalStreak(moveNodeId: string): Promise<number>;
  onProposal(cb: (p: Proposal) => void): () => void;
  onExecuted(cb: (p: Proposal) => void): () => void;
  onStuck(cb: (p: Proposal, message: string) => void): () => void;
  onNodeStatus(
    cb: (nodeId: string, status: string, message?: string) => void,
  ): () => void;
}

const EMPTY: Pipeline = { nodes: [], edges: [] };

/** Browser-only mock so `pnpm --filter @sortflow/ui dev` works without Electron. */
function createMockApi(): SortflowApi {
  let proposals: Proposal[] = [
    {
      id: "demo-1",
      filePath: "/Users/you/Downloads/Screenshot 2026-06-30.png",
      fileName: "Screenshot 2026-06-30.png",
      destDir: "/Users/you/Pictures/Screenshots",
      moveNodeId: "m1",
      routeNodeIds: ["w1", "f1", "m1"],
      createdAt: 1,
      status: "pending",
    },
  ];
  const executedCbs = new Set<(p: Proposal) => void>();
  return {
    async getPipeline() {
      const raw = localStorage.getItem("sortflow-pipeline");
      return raw ? (JSON.parse(raw) as Pipeline) : EMPTY;
    },
    async setPipeline(p) {
      localStorage.setItem("sortflow-pipeline", JSON.stringify(p));
      return { problems: [] };
    },
    async listProposals() {
      return proposals;
    },
    async approve(id) {
      proposals = proposals.map((p) =>
        p.id === id ? { ...p, status: "executed" as const } : p,
      );
      const executed = proposals.find((p) => p.id === id);
      if (executed) for (const cb of executedCbs) cb(executed);
    },
    async reject(id) {
      proposals = proposals.map((p) =>
        p.id === id ? { ...p, status: "rejected" as const } : p,
      );
    },
    async listJournal() {
      return [];
    },
    async undo() {},
    async approvalStreak() {
      return 0;
    },
    onProposal() {
      return () => {};
    },
    onExecuted(cb) {
      executedCbs.add(cb);
      return () => executedCbs.delete(cb);
    },
    onStuck() {
      // Mock: the browser demo never fails a move, so this never fires.
      return () => {};
    },
    onNodeStatus() {
      return () => {};
    },
  };
}

declare global {
  interface Window {
    sortflow?: SortflowApi;
  }
}

export const api: SortflowApi =
  typeof window !== "undefined" && window.sortflow
    ? window.sortflow
    : createMockApi();
