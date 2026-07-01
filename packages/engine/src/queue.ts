import { type Classifier, UNSURE } from "./classify";
import type { ClassifyConfig, IncomingFile } from "./types";

/** Serializes classification jobs with a cooldown so bulk drops never pin the CPU (spec: thermals). */
export class ClassifyQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(
    private classifier: Classifier,
    private cooldownMs = 2000,
    private sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  get length(): number {
    return this.pending;
  }

  enqueue(file: IncomingFile, cfg: ClassifyConfig): Promise<string> {
    this.pending++;
    const result = this.chain.then(async () => {
      try {
        return await this.classifier.classify(file, cfg);
      } catch {
        return UNSURE;
      } finally {
        this.pending--;
      }
    });
    this.chain = result.then(() => this.sleep(this.cooldownMs));
    return result;
  }
}
