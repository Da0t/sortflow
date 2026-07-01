class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  ResizeObserverStub;

class DOMMatrixReadOnlyStub {
  m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([0-9.]+)\)/)?.[1];
    this.m22 = scale !== undefined ? +scale : 1;
  }
}
(globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly =
  DOMMatrixReadOnlyStub;

Object.defineProperties(globalThis.HTMLElement.prototype, {
  offsetHeight: { get: () => 60, configurable: true },
  offsetWidth: { get: () => 180, configurable: true },
});

(
  globalThis.SVGElement.prototype as unknown as { getBBox: () => object }
).getBBox = () => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
});
