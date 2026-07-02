import type { FolderScan, NodeKind } from "@sortflow/engine";
import {
  ChevronRight,
  Filter,
  FolderOutput,
  Inbox,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { api } from "../bridge";
import { loadDestBase, saveDestBase } from "../lib/destBase";
import { useFlowStore } from "../store";
import { FolderTree } from "./FolderTree";
import { GenerateSection } from "./GenerateSection";

const SECTIONS_KEY = "sf-palette-collapsed";

/** Guarded like the other localStorage helpers: broken storage just means
 * collapse choices don't persist. */
function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(
      window.localStorage.getItem(SECTIONS_KEY) ?? "{}",
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function saveCollapsed(state: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(SECTIONS_KEY, JSON.stringify(state));
  } catch {
    // Session-only.
  }
}

/** Collapsible palette section. Collapsing a section hands its space to the
 * ones that remain — collapse the AI sections and Your Folders gets most of
 * the sidebar. `grow` lets a section (the folder tree) fill leftover height. */
function PaletteSection({
  id,
  label,
  grow,
  children,
}: {
  id: string;
  label: string;
  grow?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(
    () => loadCollapsed()[id] ?? false,
  );
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    saveCollapsed({ ...loadCollapsed(), [id]: next });
  };
  return (
    <section
      className={`sf-section${grow && !collapsed ? " sf-section-grow" : ""}`}
    >
      <button
        type="button"
        className="sf-section-header"
        aria-expanded={!collapsed}
        onClick={toggle}
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          aria-hidden="true"
          className={`sf-folder-chevron${collapsed ? "" : " sf-open"}`}
        />
        {label}
      </button>
      {!collapsed && children}
    </section>
  );
}

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
  const [scanDirs, setScanDirs] = useState<string[]>([
    "~/Downloads",
    "~/Desktop",
  ]);
  const [destBase, setDestBase] = useState(loadDestBase);
  const [busy, setBusy] = useState(false);

  function toggleDir(folder: string) {
    setScanDirs((prev) =>
      prev.includes(folder)
        ? prev.filter((f) => f !== folder)
        : FOLDERS.filter((f) => f === folder || prev.includes(f)),
    );
  }

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
      const result = await api.autoSetup(scanDirs, destBase || undefined);
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
      <div className="sf-scan-dirs" aria-label="Folders to scan">
        {FOLDERS.map((f) => (
          <label key={f} className="sf-scan-dir">
            <input
              type="checkbox"
              checked={scanDirs.includes(f)}
              onChange={() => toggleDir(f)}
            />
            {f.replace("~/", "")}
          </label>
        ))}
      </div>
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
        disabled={busy || scanDirs.length === 0}
      >
        <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
        {busy ? "Scanning…" : "Run Auto Setup"}
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
      <PaletteSection id="autosetup" label="Auto Setup">
        <AutoSetupSection
          onResult={onAutoSetupResult ?? (() => {})}
          onError={onAutoSetupError ?? (() => {})}
        />
      </PaletteSection>
      <PaletteSection id="describe" label="Describe It">
        <GenerateSection />
      </PaletteSection>
      <PaletteSection id="nodes" label="Nodes">
        {KINDS.map(({ kind, label, icon }) => (
          <button key={kind} type="button" onClick={() => addNode(kind)}>
            {icon}
            {label}
          </button>
        ))}
      </PaletteSection>
      <PaletteSection id="folders" label="Your Folders" grow>
        <p className="sf-folder-hint">
          Drag a folder onto the canvas or a Move node
        </p>
        <FolderTree />
      </PaletteSection>
    </div>
  );
}
