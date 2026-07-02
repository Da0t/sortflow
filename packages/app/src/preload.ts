import { contextBridge, ipcRenderer, webUtils } from "electron";

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
  previewPipeline: (p: unknown) => ipcRenderer.invoke("pipeline:preview", p),
  generatePipeline: (description: string, destBase?: string, model?: string) =>
    ipcRenderer.invoke("pipeline:generate", description, destBase, model),
  listProposals: () => ipcRenderer.invoke("proposals:list"),
  approve: (id: string) => ipcRenderer.invoke("proposals:approve", id),
  reject: (id: string) => ipcRenderer.invoke("proposals:reject", id),
  restoreRejected: () => ipcRenderer.invoke("proposals:restoreRejected"),
  renameProposal: (id: string, newName: string) =>
    ipcRenderer.invoke("proposals:rename", id, newName),
  listJournal: () => ipcRenderer.invoke("journal:list"),
  undo: (id: string) => ipcRenderer.invoke("journal:undo", id),
  undoAll: () => ipcRenderer.invoke("journal:undoAll"),
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
  autoSetup: (path: string, destBase?: string) =>
    ipcRenderer.invoke("autosetup:scan", path, destBase),
  pickFolder: (defaultPath?: string) =>
    ipcRenderer.invoke("dialog:pickFolder", defaultPath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  isDirectory: (path: string) => ipcRenderer.invoke("fs:isDirectory", path),
  listFolders: (path?: string) => ipcRenderer.invoke("fs:listFolders", path),
  listPipelines: () => ipcRenderer.invoke("pipelines:list"),
  switchPipeline: (id: string, draft?: unknown) =>
    ipcRenderer.invoke("pipelines:setActive", id, draft),
  createPipeline: (draft?: unknown) =>
    ipcRenderer.invoke("pipelines:create", draft),
  renamePipeline: (id: string, name: string) =>
    ipcRenderer.invoke("pipelines:rename", id, name),
  deletePipeline: (id: string) => ipcRenderer.invoke("pipelines:delete", id),
  setPipelineEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke("pipelines:setEnabled", id, enabled),
});
