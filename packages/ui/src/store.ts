import type {
  NodeConfig,
  NodeKind,
  Pipeline,
  PipelineNode,
} from "@sortflow/engine";
import {
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import { create } from "zustand";

export type FlowNodeData = {
  kind: NodeKind;
  config: NodeConfig;
  status?: string;
  statusMessage?: string;
};
export type FlowNode = Node<FlowNodeData>;

const DEFAULT_CONFIGS: Record<NodeKind, NodeConfig> = {
  watch: { path: "~/Downloads", recursive: false },
  filter: { extensions: [] },
  classify: { categories: ["Documents", "Images"], model: "llama3.2:3b" },
  move: { destination: "~/Documents/Sorted/{category}", auto: false },
};

interface FlowState {
  nodes: FlowNode[];
  edges: Edge[];
  selectedId: string | null;
  /** Focus mode hides the palette, config panel, and dock — graph only. */
  focusMode: boolean;
  toggleFocusMode(): void;
  /** Bumped after Save & Apply so panels showing engine state re-fetch
   * (pending destinations are re-pointed on every engine restart). */
  refreshTick: number;
  bumpRefresh(): void;
  /** Which main view is showing: the pipeline canvas or the Files mover. */
  view: "canvas" | "files";
  setView(view: "canvas" | "files"): void;
  /** True when the canvas differs from the last applied pipeline — the
   * running engine does NOT match what's on screen until Save & Apply. */
  dirty: boolean;
  setDirty(dirty: boolean): void;
  setSelected(id: string | null): void;
  onNodesChange(changes: NodeChange<FlowNode>[]): void;
  onEdgesChange(changes: EdgeChange[]): void;
  onConnect(c: Connection): void;
  addNode(
    kind: NodeKind,
    overrides?: { config?: NodeConfig; position?: { x: number; y: number } },
  ): void;
  updateConfig(id: string, config: NodeConfig): void;
  setNodeStatus(id: string, status: string, message?: string): void;
  animatePath(nodeIds: string[]): void;
  loadPipeline(p: Pipeline): void;
  toPipeline(): Pipeline;
  removeNode(id: string): void;
  removeEdge(id: string): void;
  replaceEdge(id: string, connection: Connection): void;
}

let nextId = 1;
const genId = () => `n${Date.now().toString(36)}${nextId++}`;

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedId: null,
  focusMode: false,
  toggleFocusMode: () => set({ focusMode: !get().focusMode }),
  refreshTick: 0,
  bumpRefresh: () => set({ refreshTick: get().refreshTick + 1 }),
  view: "canvas",
  setView: (view) => set({ view }),
  dirty: false,
  setDirty: (dirty) => set({ dirty }),
  setSelected: (id) => set({ selectedId: id }),
  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (c) =>
    set({
      dirty: true,
      edges: [
        ...get().edges,
        {
          id: genId(),
          source: c.source,
          sourceHandle: c.sourceHandle ?? "out",
          target: c.target,
        },
      ],
    }),
  addNode: (kind, overrides) =>
    set({
      dirty: true,
      nodes: [
        ...get().nodes,
        {
          id: genId(),
          type: kind,
          position: overrides?.position ?? {
            x: 120 + get().nodes.length * 40,
            y: 120 + get().nodes.length * 30,
          },
          data: {
            kind,
            config: overrides?.config
              ? structuredClone(overrides.config)
              : structuredClone(DEFAULT_CONFIGS[kind]),
          },
        },
      ],
    }),
  updateConfig: (id, config) =>
    set({
      dirty: true,
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config } } : n,
      ),
    }),
  setNodeStatus: (id, status, message) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, status, statusMessage: message } }
          : n,
      ),
    }),
  animatePath: (nodeIds) => {
    const onPath = (e: Edge) =>
      nodeIds.includes(e.source) && nodeIds.includes(e.target);
    set({
      edges: get().edges.map((e) => (onPath(e) ? { ...e, animated: true } : e)),
    });
    setTimeout(() => {
      set({
        edges: get().edges.map((e) =>
          onPath(e) ? { ...e, animated: false } : e,
        ),
      });
    }, 3000);
  },
  loadPipeline: (p) =>
    set({
      dirty: false,
      nodes: p.nodes.map((n) => ({
        id: n.id,
        type: n.kind,
        position: n.position,
        data: { kind: n.kind, config: n.config },
      })),
      edges: p.edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
      })),
      selectedId: null,
    }),
  removeNode: (id) =>
    set({
      dirty: true,
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: get().selectedId === id ? null : get().selectedId,
    }),
  removeEdge: (id) =>
    set({ dirty: true, edges: get().edges.filter((e) => e.id !== id) }),
  replaceEdge: (id, connection) =>
    set({
      dirty: true,
      edges: get().edges.map((e) =>
        e.id === id
          ? {
              ...e,
              source: connection.source,
              sourceHandle: connection.sourceHandle ?? e.sourceHandle,
              target: connection.target,
            }
          : e,
      ),
    }),
  toPipeline: (): Pipeline => ({
    nodes: get().nodes.map(
      (n): PipelineNode => ({
        id: n.id,
        kind: n.data.kind,
        config: n.data.config,
        position: { x: n.position.x, y: n.position.y },
      }),
    ),
    edges: get().edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? "out",
      target: e.target,
    })),
  }),
}));
