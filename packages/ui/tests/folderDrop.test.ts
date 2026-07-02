import type { NodeConfig, NodeKind } from "@sortflow/engine";
import { describe, expect, it, vi } from "vitest";
import { handleFolderDrop } from "../src/lib/folderDrop";

describe("handleFolderDrop", () => {
  it("calls addNode with move kind and destination when isDir=true", () => {
    const addNode = vi.fn();
    handleFolderDrop("/Users/me/Downloads", true, addNode, { x: 100, y: 200 });
    expect(addNode).toHaveBeenCalledOnce();
    const [kind, overrides] = addNode.mock.calls[0] as [
      NodeKind,
      { config: NodeConfig; position: { x: number; y: number } },
    ];
    expect(kind).toBe("move");
    expect((overrides.config as { destination: string }).destination).toBe(
      "/Users/me/Downloads",
    );
    expect(overrides.position).toEqual({ x: 100, y: 200 });
  });

  it("does NOT call addNode when isDir=false", () => {
    const addNode = vi.fn();
    handleFolderDrop("/Users/me/file.txt", false, addNode, { x: 0, y: 0 });
    expect(addNode).not.toHaveBeenCalled();
  });

  it("does NOT call addNode when path is empty", () => {
    const addNode = vi.fn();
    handleFolderDrop("", true, addNode, { x: 0, y: 0 });
    expect(addNode).not.toHaveBeenCalled();
  });
});
