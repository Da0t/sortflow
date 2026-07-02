import type { FolderScan, NodeKind } from "@sortflow/engine";
import { Filter, FolderOutput, Inbox, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";
import { api } from "../bridge";
import { useFlowStore } from "../store";
import { FolderTree } from "./FolderTree";

const KINDS: Array<{ kind: NodeKind; label: string; icon: ReactElement }> = [
  {
    kind: "watch",
    label: "Add Watch",
    icon: <Inbox size={16} strokeWidth={2} aria-hidden="true" />,
  },
  {
    kind: "filter",
    label: "Add Filter",
    icon: <Filter size={16} strokeWidth={2} aria-hidden="true" />,
  },
  {
    kind: "classify",
    label: "Add AI Classify",
    icon: <Sparkles size={16} strokeWidth={2} aria-hidden="true" />,
  },
  {
    kind: "move",
    label: "Add Move",
    icon: <FolderOutput size={16} strokeWidth={2} aria-hidden="true" />,
  },
];

const FOLDERS = ["~/Downloads", "~/Desktop", "~/Documents"];

interface AutoSetupSectionProps {
  onResult(scan: FolderScan, ruleCount: number): void;
  onError(message: string): void;
}

function AutoSetupSection({ onResult, onError }: AutoSetupSectionProps) {
  const [folder, setFolder] = useState(FOLDERS[0]);
  const [busy, setBusy] = useState(false);

  async function handleAutoSetup() {
    setBusy(true);
    try {
      const result = await api.autoSetup(folder);
      useFlowStore.getState().loadPipeline(result.pipeline);
      // Count rules = number of filter-move pairs (filter nodes starting with auto-f-)
      const ruleCount = result.pipeline.nodes.filter((n) =>
        n.id.startsWith("auto-f-"),
      ).length;
      onResult(result.scan, ruleCount);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span className="sf-palette-label">Auto Setup</span>
      <select
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
        className="sf-autosetup-select"
        aria-label="Folder to scan"
      >
        {FOLDERS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="sf-autosetup-btn"
        onClick={handleAutoSetup}
        disabled={busy}
      >
        <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
        {busy ? "Scanning…" : "Auto Setup"}
      </button>
    </>
  );
}

interface PaletteProps {
  onAutoSetupResult?(scan: FolderScan, ruleCount: number): void;
  onAutoSetupError?(message: string): void;
}

export function Palette({ onAutoSetupResult, onAutoSetupError }: PaletteProps) {
  const addNode = useFlowStore((s) => s.addNode);
  return (
    <div className="sf-palette">
      <AutoSetupSection
        onResult={onAutoSetupResult ?? (() => {})}
        onError={onAutoSetupError ?? (() => {})}
      />
      <span className="sf-palette-label" style={{ marginTop: "8px" }}>
        Nodes
      </span>
      {KINDS.map(({ kind, label, icon }) => (
        <button key={kind} type="button" onClick={() => addNode(kind)}>
          {icon}
          {label}
        </button>
      ))}
      <span className="sf-palette-label" style={{ marginTop: "8px" }}>
        Your Folders
      </span>
      <p className="sf-folder-hint">
        Drag a folder onto the canvas or a Move node
      </p>
      <FolderTree />
    </div>
  );
}
