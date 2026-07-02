import { contextBridge, ipcRenderer } from "electron";

function subscribe(channel: string) {
  return (cb: (...args: unknown[]) => void) => {
    const listener = (_evt: unknown, ...args: unknown[]) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

// Must implement packages/ui/src/bridge.ts SortflowApi exactly.
contextBridge.exposeInMainWorld("sortflow", {
  getPipeline: () => ipcRenderer.invoke("pipeline:get"),
  setPipeline: (p: unknown) => ipcRenderer.invoke("pipeline:set", p),
  listProposals: () => ipcRenderer.invoke("proposals:list"),
  approve: (id: string) => ipcRenderer.invoke("proposals:approve", id),
  reject: (id: string) => ipcRenderer.invoke("proposals:reject", id),
  listJournal: () => ipcRenderer.invoke("journal:list"),
  undo: (id: string) => ipcRenderer.invoke("journal:undo", id),
  approvalStreak: (moveNodeId: string) =>
    ipcRenderer.invoke("streak:get", moveNodeId),
  onProposal: (cb: (p: unknown) => void) =>
    subscribe("engine:proposal")(cb as never),
  onExecuted: (cb: (p: unknown) => void) =>
    subscribe("engine:executed")(cb as never),
  onStuck: (cb: (p: unknown, message: unknown) => void) =>
    subscribe("engine:stuck")(cb as never),
  onNodeStatus: (cb: (...a: unknown[]) => void) =>
    subscribe("engine:nodeStatus")(cb as never),
});
