import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../src/bridge";
import { ReviewTray } from "../src/panels/ReviewTray";

describe("ReviewTray", () => {
  it("lists pending proposals and approves on click", async () => {
    render(<ReviewTray />);
    await waitFor(() =>
      expect(screen.getByText(/Screenshot 2026-06-30\.png/)).toBeTruthy(),
    );
    const approveSpy = vi.spyOn(api, "approve");
    fireEvent.click(screen.getAllByRole("button", { name: /^approve$/i })[0]);
    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith("demo-1"));
  });
});
