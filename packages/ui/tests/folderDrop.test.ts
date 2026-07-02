import type { MoveConfig, NodeConfig, NodeKind } from "@sortflow/engine";
import { describe, expect, it, vi } from "vitest";
import {
  FOLDER_MIME,
  handleFolderDrop,
  readFolderDragPath,
  retargetMoveNode,
  setFolderDragData,
} from "../src/lib/folderDrop";

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

describe("folder drag payload", () => {
  it("round-trips a path through drag data (custom MIME + text/plain)", () => {
    const store: Record<string, string> = {};
    setFolderDragData(
      {
        setData: (type, data) => {
          store[type] = data;
        },
      },
      "/Users/me/Pictures",
    );
    expect(store[FOLDER_MIME]).toBe("/Users/me/Pictures");
    expect(store["text/plain"]).toBe("/Users/me/Pictures");
    expect(readFolderDragPath({ getData: (t) => store[t] ?? "" })).toBe(
      "/Users/me/Pictures",
    );
  });

  it("readFolderDragPath returns null when no folder payload present", () => {
    expect(readFolderDragPath({ getData: () => "" })).toBeNull();
  });
});

describe("retargetMoveNode", () => {
  const config: MoveConfig = {
    destination: "~/Documents/Sorted",
    auto: true,
    renamePattern: "{fileYYYY} {name}",
  };

  it("updates the destination and preserves the rest of the config", () => {
    const updateConfig = vi.fn();
    retargetMoveNode("/Users/me/Pictures", true, "m1", config, updateConfig);
    expect(updateConfig).toHaveBeenCalledExactlyOnceWith("m1", {
      destination: "/Users/me/Pictures",
      auto: true,
      renamePattern: "{fileYYYY} {name}",
    });
  });

  it("ignores non-directories", () => {
    const updateConfig = vi.fn();
    retargetMoveNode("/Users/me/file.txt", false, "m1", config, updateConfig);
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it("ignores empty paths", () => {
    const updateConfig = vi.fn();
    retargetMoveNode("", true, "m1", config, updateConfig);
    expect(updateConfig).not.toHaveBeenCalled();
  });
});
