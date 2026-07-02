import type { FolderScan } from "@sortflow/engine";
import { X } from "lucide-react";

interface AutoSetupBannerProps {
  scan: FolderScan;
  ruleCount: number;
  error?: string;
  onDismiss(): void;
}

export function AutoSetupBanner({
  scan,
  ruleCount,
  error,
  onDismiss,
}: AutoSetupBannerProps) {
  const bucketSummary = scan.buckets
    .filter((b) => b.count >= 5)
    .map((b) => `${b.count} ${b.label}`)
    .join(", ");

  return (
    <output
      className={`sf-autosetup-banner${error ? " sf-autosetup-banner--error" : ""}`}
    >
      <span className="sf-autosetup-banner-text">
        {error ? (
          <>Auto Setup failed: {error}</>
        ) : ruleCount === 0 ? (
          <>
            Scanned {scan.total} files &mdash; no strong patterns found (need 5+
            similar files). Build your pipeline manually.
          </>
        ) : (
          <>
            Scanned {scan.total} files &mdash; drafted {ruleCount} rule
            {ruleCount !== 1 ? "s" : ""}
            {bucketSummary ? `: ${bucketSummary}` : ""}. Review the pipeline,
            adjust anything, then Save &amp; Apply.
          </>
        )}
      </span>
      <button
        type="button"
        className="sf-autosetup-banner-dismiss"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </output>
  );
}
