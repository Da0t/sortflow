import type { FolderScan, NodeKind } from "@sortflow/engine";
import { Filter, FolderOutput, Inbox, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";
import { api } from "../bridge";
import { loadDestBase, saveDestBase } from "../lib/destBase";
import { useFlowStore } from "../store";
import { FolderTree } from "./FolderTree";
import { GenerateSection } from "./GenerateSection";

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

/** Preset bases for where Auto Setup sends sorted files. "" = per-category
 * system folders (Pictures, Documents, …). */
const DEST_CHOICES: Array<{ value: string; label: string }> = [
  { value: "", label: "System folders" },
  { value: "~/Desktop", label: "Desktop" },
  { value: "~/Documents", label: "Documents" },
];

interface AutoSetupSectionProps {
  onResult(scan: FolderScan, ruleCount: number): void;
  onError(message: string): void;
}

function AutoSetupSection({ onResult, onError }: AutoSetupSectionProps) {
  const [folder, setFolder] = useState(FOLDERS[0]);
  const [destBase, setDestBase] = useState(loadDestBase);
  const [busy, setBusy] = useState(false);

  async function chooseDest(value: string) {
    if (value === "__custom__") {
      const picked = await api.pickFolder();
      if (!picked) return; // cancelled — keep the previous choice
      setDestBase(picked);
      saveDestBase(picked);
      return;
    }
    setDestBase(value);
    saveDestBase(value);
  }

  async function handleAutoSetup() {
    setBusy(true);
    try {
      const result = await api.autoSetup(folder, destBase || undefined);
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
      <select
        value={destBase}
        onChange={(e) => void chooseDest(e.target.value)}
        className="sf-autosetup-select"
        aria-label="Sort files into"
        title="Where Auto Setup sends sorted files"
      >
        {DEST_CHOICES.map((c) => (
          <option key={c.value || "system"} value={c.value}>
            Sort into: {c.label}
          </option>
        ))}
        {destBase !== "" && !DEST_CHOICES.some((c) => c.value === destBase) && (
          <option value={destBase}>Sort into: {destBase}</option>
        )}
        <option value="__custom__">Choose folder…</option>
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
      <GenerateSection />
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
