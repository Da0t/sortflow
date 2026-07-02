import { RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../bridge";

/**
 * macOS folder-permission health check. Renders nothing when everything is
 * accessible; shows a fix-it banner when Desktop/Documents/Downloads are
 * blocked (the silent killer behind "my files never arrived"). Rechecking
 * re-reads the folders, which also triggers the system consent prompt if
 * macOS never asked.
 */
export function PermissionsBanner() {
  const [blocked, setBlocked] = useState<string[]>([]);

  const check = useCallback(async () => {
    try {
      const results = await api.checkAccess();
      setBlocked(results.filter((r) => !r.ok).map((r) => r.label));
    } catch {
      // Bridge unavailable (browser demo) — nothing to report.
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (blocked.length === 0) return null;

  return (
    <div className="sf-perms-banner" role="alert">
      <ShieldAlert size={14} strokeWidth={2} aria-hidden="true" />
      <span>
        macOS is blocking Sortflow from your {blocked.join(" and ")} folder
        {blocked.length > 1 ? "s" : ""} — sorting there will silently fail.
        Allow it in System Settings → Privacy &amp; Security → Files and Folders
        → Sortflow, then recheck.
      </span>
      <button type="button" onClick={() => void check()}>
        <RefreshCw size={12} strokeWidth={2} aria-hidden="true" />
        Recheck
      </button>
    </div>
  );
}
