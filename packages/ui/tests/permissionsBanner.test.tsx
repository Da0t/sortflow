import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/bridge";
import { PermissionsBanner } from "../src/panels/PermissionsBanner";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PermissionsBanner", () => {
  it("renders nothing when every folder is accessible", async () => {
    vi.spyOn(api, "checkAccess").mockResolvedValue([
      { label: "Desktop", path: "/u/Desktop", ok: true },
      { label: "Documents", path: "/u/Documents", ok: true },
    ]);
    const { container } = render(<PermissionsBanner />);
    await waitFor(() => expect(api.checkAccess).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("names the blocked folders and offers a recheck", async () => {
    const spy = vi
      .spyOn(api, "checkAccess")
      .mockResolvedValueOnce([
        { label: "Desktop", path: "/u/Desktop", ok: false },
        { label: "Documents", path: "/u/Documents", ok: true },
      ])
      .mockResolvedValueOnce([
        { label: "Desktop", path: "/u/Desktop", ok: true },
        { label: "Documents", path: "/u/Documents", ok: true },
      ]);
    const { container } = render(<PermissionsBanner />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.getByText(/blocking sortflow from your desktop/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /recheck/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
