import type {
  FolderScan,
  JournalEntry,
  Pipeline,
  PipelineLibrarySummary,
  PipelinePreview,
  Proposal,
} from "@sortflow/engine";

/** One folder in the user's folder tree (see listFolders). */
export interface FolderEntry {
  name: string;
  path: string;
  hasChildren: boolean;
}

/** One file-or-folder entry in the Files page browser (see listEntries). */
export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface SortflowApi {
  getPipeline(): Promise<Pipeline>;
  setPipeline(
    p: Pipeline,
  ): Promise<{ problems: string[]; warnings?: string[] }>;
  /** Dry-run the graph against watched folders — nothing moves. */
  previewPipeline(
    p: Pipeline,
  ): Promise<{ problems: string[]; preview?: PipelinePreview }>;
  /** Draft a pipeline from a natural-language description via local Ollama.
   * destBase grounds destinations in the user's Sort-into preference. */
  generatePipeline(
    description: string,
    destBase?: string,
    model?: string,
  ): Promise<{ pipeline: Pipeline | null; error: string | null }>;
  listProposals(): Promise<Proposal[]>;
  approve(id: string): Promise<void>;
  reject(id: string): Promise<void>;
  /** Flip every rejected proposal back to pending; returns the count. */
  restoreRejected(): Promise<number>;
  renameProposal(id: string, newName: string): Promise<Proposal>;
  listJournal(): Promise<JournalEntry[]>;
  undo(id: string): Promise<void>;
  /** Undo every completed move; returns how many were reversed. */
  undoAll(): Promise<number>;
  approvalStreak(moveNodeId: string): Promise<number>;
  onProposal(cb: (p: Proposal) => void): () => void;
  onExecuted(cb: (p: Proposal) => void): () => void;
  onStuck(cb: (p: Proposal, message: string) => void): () => void;
  onNodeStatus(
    cb: (nodeId: string, status: string, message?: string) => void,
  ): () => void;
  /** Scan one or several folders and draft a pipeline covering them all. */
  autoSetup(
    paths: string | string[],
    destBase?: string,
  ): Promise<{ scan: FolderScan; pipeline: Pipeline }>;
  pickFolder(defaultPath?: string): Promise<string | null>;
  getPathForFile(file: File): string;
  isDirectory(path: string): Promise<boolean>;
  listFolders(path?: string): Promise<FolderEntry[]>;
  /** Folders-first listing (files included) for the Files page. */
  listEntries(path: string): Promise<FsEntry[]>;
  /** macOS folder-permission health check for Desktop/Documents/Downloads. */
  checkAccess(): Promise<Array<{ label: string; path: string; ok: boolean }>>;
  /** Journaled manual move of a file or folder into destDir. */
  moveEntry(from: string, destDir: string): Promise<{ error: string | null }>;
  listPipelines(): Promise<PipelineLibrarySummary>;
  /** Switch the editor to pipeline `id`; `draft` stashes the current canvas. */
  switchPipeline(
    id: string,
    draft?: Pipeline,
  ): Promise<{ state: PipelineLibrarySummary; pipeline: Pipeline }>;
  createPipeline(
    draft?: Pipeline,
  ): Promise<{ state: PipelineLibrarySummary; pipeline: Pipeline }>;
  renamePipeline(id: string, name: string): Promise<PipelineLibrarySummary>;
  deletePipeline(
    id: string,
  ): Promise<{ state: PipelineLibrarySummary; pipeline: Pipeline }>;
  setPipelineEnabled(
    id: string,
    enabled: boolean,
  ): Promise<{
    state: PipelineLibrarySummary;
    problems: string[];
    warnings?: string[];
  }>;
}

const EMPTY: Pipeline = { nodes: [], edges: [] };

/** Fake folder tree for the browser-only mock, keyed by parent path. */
const MOCK_FOLDER_TREE: Record<string, FolderEntry[]> = {
  "~": [
    { name: "Desktop", path: "/Users/demo/Desktop", hasChildren: false },
    { name: "Documents", path: "/Users/demo/Documents", hasChildren: true },
    { name: "Downloads", path: "/Users/demo/Downloads", hasChildren: false },
    { name: "Pictures", path: "/Users/demo/Pictures", hasChildren: true },
  ],
  "/Users/demo/Documents": [
    {
      name: "Invoices",
      path: "/Users/demo/Documents/Invoices",
      hasChildren: false,
    },
    {
      name: "School",
      path: "/Users/demo/Documents/School",
      hasChildren: false,
    },
  ],
  "/Users/demo/Pictures": [
    {
      name: "Screenshots",
      path: "/Users/demo/Pictures/Screenshots",
      hasChildren: false,
    },
  ],
};

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
  // In-memory pipeline library for the browser demo.
  const library: {
    activeId: string;
    pipelines: Array<{
      id: string;
      name: string;
      enabled: boolean;
      pipeline: Pipeline;
    }>;
  } = {
    activeId: "p1",
    pipelines: [
      { id: "p1", name: "My Pipeline", enabled: true, pipeline: EMPTY },
    ],
  };
  const active = () => {
    const record = library.pipelines.find((p) => p.id === library.activeId);
    return record ?? library.pipelines[0];
  };
  const summary = (): PipelineLibrarySummary => ({
    activeId: library.activeId,
    pipelines: library.pipelines.map(({ id, name, enabled }) => ({
      id,
      name,
      enabled,
    })),
  });
  return {
    async getPipeline() {
      const raw = localStorage.getItem("sortflow-pipeline");
      return raw ? (JSON.parse(raw) as Pipeline) : EMPTY;
    },
    async setPipeline(p) {
      localStorage.setItem("sortflow-pipeline", JSON.stringify(p));
      return { problems: [], warnings: [] };
    },
    async generatePipeline(_description: string) {
      return {
        pipeline: {
          nodes: [
            {
              id: "gen-w",
              kind: "watch",
              config: { path: "~/Downloads", recursive: false },
              position: { x: 40, y: 200 },
            },
            {
              id: "gen-f-0",
              kind: "filter",
              config: { extensions: [".gif"] },
              position: { x: 340, y: 60 },
            },
            {
              id: "gen-m-0",
              kind: "move",
              config: { destination: "~/Desktop/GIFs", auto: false },
              position: { x: 660, y: 60 },
            },
          ],
          edges: [
            {
              id: "gen-e-0",
              source: "gen-w",
              sourceHandle: "out",
              target: "gen-f-0",
            },
            {
              id: "gen-e-1",
              source: "gen-f-0",
              sourceHandle: "match",
              target: "gen-m-0",
            },
          ],
        } as Pipeline,
        error: null,
      };
    },
    async previewPipeline(p) {
      const moves = p.nodes.filter((n) => n.kind === "move");
      return {
        problems: [],
        preview: {
          total: 12,
          wouldMove: moves.length > 0 ? 9 : 0,
          needsClassify: p.nodes.some((n) => n.kind === "classify") ? 2 : 0,
          unmatched: 3,
          truncated: false,
          buckets: moves.slice(0, 3).map((m, i) => ({
            moveNodeId: m.id,
            destination: (m.config as { destination: string }).destination,
            count: 9 - i * 3,
          })),
        },
      };
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
    async restoreRejected() {
      const count = proposals.filter((p) => p.status === "rejected").length;
      proposals = proposals.map((p) =>
        p.status === "rejected" ? { ...p, status: "pending" as const } : p,
      );
      return count;
    },
    async renameProposal(id, newName) {
      proposals = proposals.map((p) =>
        p.id === id && p.status === "pending"
          ? { ...p, targetName: newName }
          : p,
      );
      const renamed = proposals.find((p) => p.id === id);
      if (!renamed) throw new Error(`unknown proposal ${id}`);
      return renamed;
    },
    async listJournal() {
      return [];
    },
    async undo() {},
    async undoAll() {
      return 0;
    },
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
    async listFolders(path?: string) {
      return MOCK_FOLDER_TREE[path ?? "~"] ?? [];
    },
    async listEntries(path: string) {
      const folders = (MOCK_FOLDER_TREE[path] ?? MOCK_FOLDER_TREE["~"]).map(
        (f) => ({ name: f.name, path: f.path, isDirectory: true }),
      );
      return [
        ...folders,
        {
          name: "demo-notes.txt",
          path: `${path}/demo-notes.txt`,
          isDirectory: false,
        },
      ];
    },
    async moveEntry(_from: string, _destDir: string) {
      return { error: null };
    },
    async checkAccess() {
      return [
        { label: "Desktop", path: "/Users/demo/Desktop", ok: true },
        { label: "Documents", path: "/Users/demo/Documents", ok: true },
        { label: "Downloads", path: "/Users/demo/Downloads", ok: true },
      ];
    },
    async listPipelines() {
      return summary();
    },
    async switchPipeline(id, draft) {
      if (draft) active().pipeline = draft;
      library.activeId = id;
      return { state: summary(), pipeline: active().pipeline };
    },
    async createPipeline(draft) {
      if (draft) active().pipeline = draft;
      const record = {
        id: `p${library.pipelines.length + 1}`,
        name: `Pipeline ${library.pipelines.length + 1}`,
        enabled: true,
        pipeline: EMPTY,
      };
      library.pipelines.push(record);
      library.activeId = record.id;
      return { state: summary(), pipeline: record.pipeline };
    },
    async renamePipeline(id, name) {
      const record = library.pipelines.find((p) => p.id === id);
      if (record) record.name = name;
      return summary();
    },
    async deletePipeline(id) {
      library.pipelines = library.pipelines.filter((p) => p.id !== id);
      if (library.pipelines.length === 0) {
        library.pipelines = [
          { id: "p1", name: "My Pipeline", enabled: true, pipeline: EMPTY },
        ];
      }
      if (!library.pipelines.some((p) => p.id === library.activeId)) {
        library.activeId = library.pipelines[0].id;
      }
      return { state: summary(), pipeline: active().pipeline };
    },
    async setPipelineEnabled(id, enabled) {
      const record = library.pipelines.find((p) => p.id === id);
      if (record) record.enabled = enabled;
      return { state: summary(), problems: [], warnings: [] };
    },
    async autoSetup(_paths: string | string[], destBase?: string) {
      const dest = (fallback: string, label: string) =>
        destBase ? `${destBase.replace(/\/+$/, "")}/${label}` : fallback;
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
            config: {
              destination: dest("~/Pictures/Screenshots", "Screenshots"),
              auto: false,
            },
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
            config: {
              destination: dest("~/Documents/Sorted", "Documents"),
              auto: false,
            },
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
