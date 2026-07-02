import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/bridge";
import { GenerateSection } from "../src/panels/GenerateSection";
import { useFlowStore } from "../src/store";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GenerateSection", () => {
  it("drafts a pipeline from the description and loads it", async () => {
    useFlowStore.getState().loadPipeline({ nodes: [], edges: [] });
    const spy = vi.spyOn(api, "generatePipeline");
    render(<GenerateSection />);
    fireEvent.change(screen.getByLabelText(/describe your pipeline/i), {
      target: { value: "gifs from downloads go to desktop" },
    });
    fireEvent.click(screen.getByRole("button", { name: /draft with ai/i }));
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("gifs from downloads go to desktop");
    });
    await waitFor(() => {
      // The mock api returns a watch→filter→move draft.
      expect(useFlowStore.getState().nodes.length).toBe(3);
    });
  });

  it("shows the error when generation fails", async () => {
    vi.spyOn(api, "generatePipeline").mockResolvedValue({
      pipeline: null,
      error: "Ollama returned 503 — is it running? (ollama serve)",
    });
    render(<GenerateSection />);
    fireEvent.change(screen.getByLabelText(/describe your pipeline/i), {
      target: { value: "sort my stuff" },
    });
    fireEvent.click(screen.getByRole("button", { name: /draft with ai/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/ollama returned 503/i)).toBeTruthy();
  });

  it("disables the button while the description is empty", () => {
    render(<GenerateSection />);
    const btn = screen.getByRole("button", {
      name: /draft with ai/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
