import type {
  FolderScan,
  JournalEntry,
  Pipeline,
  Proposal,
} from "@sortflow/engine";

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
  autoSetup(path: string): Promise<{ scan: FolderScan; pipeline: Pipeline }>;
  pickFolder(defaultPath?: string): Promise<string | null>;
  getPathForFile(file: File): string;
  isDirectory(path: string): Promise<boolean>;
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
    async pickFolder(_defaultPath?: string) {
      return "/Users/demo/Documents/Picked";
    },
    getPathForFile(_file: File) {
      return "";
    },
    async isDirectory(_path: string) {
      return false;
    },
    async autoSetup(_path: string) {
      const scan: FolderScan = {
        total: 160,
        buckets: [
          { key: "screenshots", label: "Screenshots", count: 120 },
          { key: "documents", label: "Documents", count: 40 },
        ],
      };
      const pipeline: Pipeline = {
        nodes: [
          {
            id: "auto-w",
            kind: "watch",
            config: { path: "~/Downloads", recursive: false },
            position: { x: 40, y: 200 },
          },
          {
            id: "auto-f-screenshots",
            kind: "filter",
            config: {
              extensions: [".png", ".jpg", ".jpeg", ".heic"],
              namePattern: "^screen ?shot",
              regex: true,
            },
            position: { x: 340, y: 60 },
          },
          {
            id: "auto-m-screenshots",
            kind: "move",
            config: { destination: "~/Pictures/Screenshots", auto: false },
            position: { x: 660, y: 60 },
          },
          {
            id: "auto-f-documents",
            kind: "filter",
            config: {
              extensions: [
                ".pdf",
                ".doc",
                ".docx",
                ".txt",
                ".md",
                ".rtf",
                ".csv",
                ".xlsx",
                ".xls",
                ".pptx",
                ".ppt",
                ".key",
                ".pages",
              ],
            },
            position: { x: 340, y: 210 },
          },
          {
            id: "auto-m-documents",
            kind: "move",
            config: { destination: "~/Documents/Sorted", auto: false },
            position: { x: 660, y: 210 },
          },
        ],
        edges: [
          {
            id: "auto-e-0",
            source: "auto-w",
            sourceHandle: "out",
            target: "auto-f-screenshots",
          },
          {
            id: "auto-e-1",
            source: "auto-f-screenshots",
            sourceHandle: "match",
            target: "auto-m-screenshots",
          },
          {
            id: "auto-e-2",
            source: "auto-f-screenshots",
            sourceHandle: "else",
            target: "auto-f-documents",
          },
          {
            id: "auto-e-3",
            source: "auto-f-documents",
            sourceHandle: "match",
            target: "auto-m-documents",
          },
        ],
      };
      return { scan, pipeline };
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
