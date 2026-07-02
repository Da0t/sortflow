export type NodeKind = "watch" | "filter" | "classify" | "move";

export interface WatchConfig {
  path: string;
  recursive: boolean;
  scanExisting?: boolean;
  /** Also emit top-level folders as sortable units (review-only: folder
   * moves are never auto-executed). */
  includeFolders?: boolean;
}

export interface FilterConfig {
  extensions?: string[]; // lowercase, with dot: ['.pdf']
  namePattern?: string; // glob by default
  regex?: boolean; // treat namePattern as a RegExp source instead
  minBytes?: number;
  maxBytes?: number;
  minAgeDays?: number;
  maxAgeDays?: number;
}

export interface ClassifyConfig {
  categories: string[]; // output handles; 'unsure' is implicit
  model: string; // e.g. 'llama3.2:3b'
  /** Free-text guidance included in the classification prompt, e.g.
   * "receipts are purchase screenshots; school files mention course codes". */
  instructions?: string;
}

export interface MoveConfig {
  destination: string; // may contain {category} {YYYY} {MM} {ext}, leading ~
  auto: boolean; // true = execute without review
  renamePattern?: string; // optional stem pattern; tokens: {name} {fileYYYY} {fileMM} {fileDD} {YYYY} {MM} {DD}
}

export type NodeConfig =
  | WatchConfig
  | FilterConfig
  | ClassifyConfig
  | MoveConfig
  | Record<string, never>;

export interface PipelineNode {
  id: string;
  kind: NodeKind;
  config: NodeConfig;
  position: { x: number; y: number };
}

export interface PipelineEdge {
  id: string;
  source: string;
  sourceHandle: string; // watch:'out' | filter:'match'|'else' | classify:<category>|'unsure'
  target: string;
}

export interface Pipeline {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export interface IncomingFile {
  path: string; // absolute
  name: string; // basename
  ext: string; // lowercase, with dot ('' if none)
  bytes: number;
  mtimeMs: number;
  birthtimeMs?: number; // file creation time; absent on filesystems that report 0
  isDirectory?: boolean; // a folder being sorted as one unit
}

export type ProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";

export interface Proposal {
  id: string;
  filePath: string;
  fileName: string;
  destDir: string; // fully expanded destination directory
  targetName?: string; // final filename incl. extension; absent = keep original
  category?: string; // classify result, kept so destDir can be re-expanded
  moveNodeId: string;
  routeNodeIds: string[]; // node ids traversed (for UI animation)
  createdAt: number;
  status: ProposalStatus;
  error?: string;
}

export type JournalStatus = "intent" | "done" | "failed" | "undone";

export interface JournalEntry {
  id: string; // shared across the status lines of one move
  ts: number;
  from: string; // absolute source file path
  to: string; // absolute destination file path (final, post-collision)
  moveNodeId: string;
  status: JournalStatus;
}
