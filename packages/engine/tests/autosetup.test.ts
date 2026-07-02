import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanFolder, suggestPipeline } from "../src/autosetup";
import { validatePipeline } from "../src/graph";

async function tmpDir(): Promise<string> {
  return mkdtemp(join(os.tmpdir(), "sortflow-as-"));
}

async function touch(dir: string, name: string): Promise<void> {
  await writeFile(join(dir, name), "");
}

let dirs: string[] = [];
afterEach(() => {
  dirs = [];
});

describe("scanFolder", () => {
  it("returns total=0 and no buckets for an empty folder", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    const result = await scanFolder(dir);
    expect(result.total).toBe(0);
    expect(result.buckets).toEqual([]);
  });

  it("skips dotfiles", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    await touch(dir, ".DS_Store");
    await touch(dir, ".hidden.pdf");
    const result = await scanFolder(dir);
    expect(result.total).toBe(0);
    expect(result.buckets).toEqual([]);
  });

  it("skips subdirectories", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    await mkdir(join(dir, "subdir"));
    await touch(dir, "file.pdf");
    const result = await scanFolder(dir);
    expect(result.total).toBe(1);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0].key).toBe("documents");
    expect(result.buckets[0].count).toBe(1);
  });

  it("screenshot-named images count as screenshots, not images", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    await touch(dir, "Screenshot 2026-06-30.png");
    await touch(dir, "screenshot_test.jpg");
    await touch(dir, "photo.png");
    const result = await scanFolder(dir);
    const screenshots = result.buckets.find((b) => b.key === "screenshots");
    const images = result.buckets.find((b) => b.key === "images");
    expect(screenshots?.count).toBe(2);
    // photo.png has no screenshot name so it goes to images
    expect(images?.count).toBe(1);
  });

  it("respects first-match ordering: screenshot before image", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    await touch(dir, "Screenshot.heic");
    const result = await scanFolder(dir);
    const keys = result.buckets.map((b) => b.key);
    expect(keys).toContain("screenshots");
    expect(keys).not.toContain("images");
  });

  it("returns buckets in canonical order (screenshots < images < documents)", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    await touch(dir, "report.pdf");
    await touch(dir, "photo.jpg");
    await touch(dir, "Screenshot.png");
    const result = await scanFolder(dir);
    const keys = result.buckets.map((b) => b.key);
    expect(keys.indexOf("screenshots")).toBeLessThan(keys.indexOf("images"));
    expect(keys.indexOf("images")).toBeLessThan(keys.indexOf("documents"));
  });

  it("counts installers and archives correctly", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    await touch(dir, "App.dmg");
    await touch(dir, "Setup.pkg");
    await touch(dir, "archive.zip");
    await touch(dir, "backup.tar.gz");
    const result = await scanFolder(dir);
    const installers = result.buckets.find((b) => b.key === "installers");
    const archives = result.buckets.find((b) => b.key === "archives");
    expect(installers?.count).toBe(2);
    expect(archives?.count).toBe(2);
  });

  it("counts video and audio files separately", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    await touch(dir, "video.mp4");
    await touch(dir, "song.mp3");
    const result = await scanFolder(dir);
    expect(result.buckets.find((b) => b.key === "video")?.count).toBe(1);
    expect(result.buckets.find((b) => b.key === "audio")?.count).toBe(1);
  });

  it("stops after maxFiles", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    for (let i = 0; i < 10; i++) await touch(dir, `file${i}.pdf`);
    const result = await scanFolder(dir, { maxFiles: 3 });
    expect(result.total).toBe(3);
  });

  it("only returns buckets with count > 0", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    await touch(dir, "report.pdf");
    const result = await scanFolder(dir);
    for (const b of result.buckets) {
      expect(b.count).toBeGreaterThan(0);
    }
    expect(result.buckets.map((b) => b.key)).not.toContain("images");
    expect(result.buckets.map((b) => b.key)).not.toContain("screenshots");
  });

  it("bucket label is human readable", async () => {
    const dir = await tmpDir();
    dirs.push(dir);
    await touch(dir, "photo.png");
    const result = await scanFolder(dir);
    const images = result.buckets.find((b) => b.key === "images");
    expect(images?.label).toBe("Images");
  });
});

describe("suggestPipeline", () => {
  it("returns watch-only pipeline for empty scan", () => {
    const scan = { total: 0, buckets: [] };
    const pipeline = suggestPipeline("/watch/path", scan);
    expect(pipeline.nodes).toHaveLength(1);
    expect(pipeline.nodes[0].id).toBe("auto-w");
    expect(pipeline.nodes[0].kind).toBe("watch");
    expect(pipeline.edges).toHaveLength(0);
    expect(validatePipeline(pipeline)).toEqual([]);
  });

  it("returns watch-only pipeline when no bucket meets minCount threshold", () => {
    const scan = {
      total: 3,
      buckets: [{ key: "documents", label: "Documents", count: 3 }],
    };
    const pipeline = suggestPipeline("/watch/path", scan, { minCount: 5 });
    expect(pipeline.nodes).toHaveLength(1);
    expect(pipeline.nodes[0].id).toBe("auto-w");
    expect(pipeline.edges).toHaveLength(0);
  });

  it("includes buckets with count >= minCount (default 5)", () => {
    const scan = {
      total: 20,
      buckets: [
        { key: "images", label: "Images", count: 10 },
        { key: "documents", label: "Documents", count: 4 },
      ],
    };
    const pipeline = suggestPipeline("/watch/path", scan);
    // documents count=4 < 5, images count=10 >= 5
    const nodeIds = pipeline.nodes.map((n) => n.id);
    expect(nodeIds).toContain("auto-f-images");
    expect(nodeIds).toContain("auto-m-images");
    expect(nodeIds).not.toContain("auto-f-documents");
    expect(nodeIds).not.toContain("auto-m-documents");
  });

  it("sets watch node path and position", () => {
    const scan = { total: 0, buckets: [] };
    const pipeline = suggestPipeline("/my/watch", scan);
    const watch = pipeline.nodes[0];
    expect((watch.config as { path: string }).path).toBe("/my/watch");
    expect(watch.position).toEqual({ x: 40, y: 200 });
  });

  it("watch node has scanExisting: true", () => {
    const scan = { total: 0, buckets: [] };
    const pipeline = suggestPipeline("/watch/path", scan);
    const watchNode = pipeline.nodes[0];
    expect((watchNode.config as { scanExisting: boolean }).scanExisting).toBe(
      true,
    );
  });

  it("positions filter and move nodes correctly", () => {
    const scan = {
      total: 30,
      buckets: [
        { key: "images", label: "Images", count: 10 },
        { key: "documents", label: "Documents", count: 10 },
      ],
    };
    const pipeline = suggestPipeline("/watch", scan, { minCount: 1 });
    const fImg = pipeline.nodes.find((n) => n.id === "auto-f-images");
    const mImg = pipeline.nodes.find((n) => n.id === "auto-m-images");
    const fDoc = pipeline.nodes.find((n) => n.id === "auto-f-documents");
    const mDoc = pipeline.nodes.find((n) => n.id === "auto-m-documents");
    expect(fImg?.position).toEqual({ x: 340, y: 60 });
    expect(mImg?.position).toEqual({ x: 660, y: 60 });
    // Second row starts below the first row's estimated height — never a
    // fixed 150px, which made tall filter nodes overlap.
    // The images summary wraps to two lines with the fuller extension set,
    // so its row is 174px tall (see estimateRowHeight).
    expect(fDoc?.position).toEqual({ x: 340, y: 234 });
    expect(mDoc?.position).toEqual({ x: 660, y: 234 });
  });

  it("gives long extension lists extra vertical room", () => {
    const scan = {
      total: 30,
      buckets: [
        { key: "documents", label: "Documents", count: 10 }, // 13 extensions
        { key: "video", label: "Video", count: 10 },
      ],
    };
    const pipeline = suggestPipeline("/watch", scan, { minCount: 1 });
    const fDoc = pipeline.nodes.find((n) => n.id === "auto-f-documents");
    const fMedia = pipeline.nodes.find((n) => n.id === "auto-f-video");
    const gap = (fMedia?.position.y ?? 0) - (fDoc?.position.y ?? 0);
    // The documents summary wraps to two lines, so its row is taller than
    // the 160px minimum.
    expect(gap).toBeGreaterThan(160);
  });

  it("expands ~ in destinations using opts.home", () => {
    const scan = {
      total: 10,
      buckets: [{ key: "images", label: "Images", count: 10 }],
    };
    const pipeline = suggestPipeline("/watch", scan, {
      minCount: 1,
      home: "/home/testuser",
    });
    const move = pipeline.nodes.find((n) => n.id === "auto-m-images");
    expect((move?.config as { destination: string }).destination).toBe(
      "/home/testuser/Pictures/Sorted/{fileYYYY}",
    );
  });

  it("destBase overrides bucket destinations with <base>/<label>", () => {
    const scan = {
      total: 20,
      buckets: [
        { key: "screenshots", label: "Screenshots", count: 10 },
        { key: "documents", label: "Documents", count: 10 },
      ],
    };
    const pipeline = suggestPipeline("/watch", scan, {
      minCount: 1,
      home: "/home/testuser",
      destBase: "~/Desktop",
    });
    const shots = pipeline.nodes.find((n) => n.id === "auto-m-screenshots");
    const docs = pipeline.nodes.find((n) => n.id === "auto-m-documents");
    // Date grouping applies to the Sort-into variant too.
    expect((shots?.config as { destination: string }).destination).toBe(
      "/home/testuser/Desktop/Screenshots/{fileYYYY}-{fileMM}",
    );
    expect((docs?.config as { destination: string }).destination).toBe(
      "/home/testuser/Desktop/Documents",
    );
  });

  it("move nodes are auto: false (review-first)", () => {
    const scan = {
      total: 10,
      buckets: [{ key: "documents", label: "Documents", count: 10 }],
    };
    const pipeline = suggestPipeline("/watch", scan, { minCount: 1 });
    const move = pipeline.nodes.find((n) => n.id === "auto-m-documents");
    expect((move?.config as { auto: boolean }).auto).toBe(false);
  });

  it("wires watch -> first filter, filter match -> move, filter else -> next filter", () => {
    const scan = {
      total: 30,
      buckets: [
        { key: "images", label: "Images", count: 15 },
        { key: "documents", label: "Documents", count: 15 },
      ],
    };
    const pipeline = suggestPipeline("/watch", scan, { minCount: 1 });
    const watchToFilter = pipeline.edges.find(
      (e) => e.source === "auto-w" && e.sourceHandle === "out",
    );
    expect(watchToFilter?.target).toBe("auto-f-images");
    const imgMatch = pipeline.edges.find(
      (e) => e.source === "auto-f-images" && e.sourceHandle === "match",
    );
    expect(imgMatch?.target).toBe("auto-m-images");
    const imgElse = pipeline.edges.find(
      (e) => e.source === "auto-f-images" && e.sourceHandle === "else",
    );
    expect(imgElse?.target).toBe("auto-f-documents");
    // last filter has match but no else edge
    const docMatch = pipeline.edges.find(
      (e) => e.source === "auto-f-documents" && e.sourceHandle === "match",
    );
    expect(docMatch?.target).toBe("auto-m-documents");
    const docElse = pipeline.edges.find(
      (e) => e.source === "auto-f-documents" && e.sourceHandle === "else",
    );
    expect(docElse).toBeUndefined();
  });

  it("edge ids are auto-e-<n> sequentially", () => {
    const scan = {
      total: 10,
      buckets: [{ key: "images", label: "Images", count: 10 }],
    };
    const pipeline = suggestPipeline("/watch", scan, { minCount: 1 });
    // 1 bucket: watch->filter, filter match->move = 2 edges
    const ids = pipeline.edges.map((e) => e.id);
    expect(ids).toContain("auto-e-0");
    expect(ids).toContain("auto-e-1");
    expect(pipeline.edges).toHaveLength(2);
  });

  it("validatePipeline returns [] for the suggested pipeline", () => {
    const scan = {
      total: 40,
      buckets: [
        { key: "screenshots", label: "Screenshots", count: 20 },
        { key: "images", label: "Images", count: 10 },
        { key: "documents", label: "Documents", count: 10 },
      ],
    };
    const pipeline = suggestPipeline("/watch/path", scan, {
      minCount: 1,
      home: "/Users/test",
    });
    expect(validatePipeline(pipeline)).toEqual([]);
  });

  it("screenshots filter has namePattern and regex:true", () => {
    const scan = {
      total: 10,
      buckets: [{ key: "screenshots", label: "Screenshots", count: 10 }],
    };
    const pipeline = suggestPipeline("/watch", scan, { minCount: 1 });
    const filter = pipeline.nodes.find((n) => n.id === "auto-f-screenshots");
    const cfg = filter?.config as {
      namePattern: string;
      regex: boolean;
      extensions: string[];
    };
    expect(cfg.namePattern).toBe("^(screen ?shot|cleanshot)");
    expect(cfg.regex).toBe(true);
    expect(cfg.extensions).toEqual([".png", ".jpg", ".jpeg", ".heic"]);
  });

  it("uses opts.minCount to override threshold", () => {
    const scan = {
      total: 10,
      buckets: [{ key: "documents", label: "Documents", count: 3 }],
    };
    const pipeline = suggestPipeline("/watch", scan, { minCount: 3 });
    expect(pipeline.nodes.map((n) => n.id)).toContain("auto-f-documents");
  });

  it("single bucket: 2 edges total (watch->filter, filter match->move)", () => {
    const scan = {
      total: 10,
      buckets: [{ key: "archives", label: "Archives", count: 10 }],
    };
    const pipeline = suggestPipeline("/watch", scan, { minCount: 1 });
    expect(pipeline.edges).toHaveLength(2);
    expect(validatePipeline(pipeline)).toEqual([]);
  });
});
