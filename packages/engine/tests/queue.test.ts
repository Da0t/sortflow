import { describe, expect, it } from "vitest";
import type { Classifier } from "../src/classify";
import { ClassifyQueue } from "../src/queue";
import type { ClassifyConfig, IncomingFile } from "../src/types";

const cfg: ClassifyConfig = { categories: ["A"], model: "m" };
const file = (name: string): IncomingFile => ({
  path: `/${name}`,
  name,
  ext: ".txt",
  bytes: 1,
  mtimeMs: 0,
});

describe("ClassifyQueue", () => {
  it("runs jobs strictly one at a time, in order, with a cooldown between them", async () => {
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    const classifier: Classifier = {
      async classify(f) {
        active++;
        maxActive = Math.max(maxActive, active);
        events.push(`start:${f.name}`);
        await new Promise((r) => setTimeout(r, 5));
        events.push(`end:${f.name}`);
        active--;
        return "A";
      },
    };
    const sleeps: number[] = [];
    const queue = new ClassifyQueue(classifier, 1000, async (ms) => {
      sleeps.push(ms);
      events.push("cooldown");
    });
    const results = await Promise.all([
      queue.enqueue(file("1"), cfg),
      queue.enqueue(file("2"), cfg),
      queue.enqueue(file("3"), cfg),
    ]);
    expect(results).toEqual(["A", "A", "A"]);
    expect(maxActive).toBe(1);
    expect(events).toEqual([
      "start:1",
      "end:1",
      "cooldown",
      "start:2",
      "end:2",
      "cooldown",
      "start:3",
      "end:3",
      "cooldown",
    ]);
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });

  it("length tracks pending jobs", async () => {
    const classifier: Classifier = {
      classify: () => new Promise((r) => setTimeout(() => r("A"), 10)),
    };
    const queue = new ClassifyQueue(classifier, 0, async () => {});
    const p1 = queue.enqueue(file("1"), cfg);
    const p2 = queue.enqueue(file("2"), cfg);
    expect(queue.length).toBe(2);
    await Promise.all([p1, p2]);
    expect(queue.length).toBe(0);
  });

  it("a throwing classifier resolves to unsure and does not poison the chain", async () => {
    let calls = 0;
    const classifier: Classifier = {
      async classify() {
        calls++;
        if (calls === 1) throw new Error("boom");
        return "A";
      },
    };
    const queue = new ClassifyQueue(classifier, 0, async () => {});
    expect(await queue.enqueue(file("1"), cfg)).toBe("unsure");
    expect(await queue.enqueue(file("2"), cfg)).toBe("A");
  });
});
