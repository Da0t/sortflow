/** Shared "Sort into" base-folder preference (Auto Setup + Describe It). */
const DEST_KEY = "sf-autosetup-dest";

/** Storage access is guarded: unavailable storage (e.g. in tests) just
 * means the choice doesn't persist. */
export function loadDestBase(): string {
  try {
    return window.localStorage.getItem(DEST_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveDestBase(value: string): void {
  try {
    window.localStorage.setItem(DEST_KEY, value);
  } catch {
    // Not persisted — still applies for this session.
  }
}
