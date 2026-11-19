import assert from "node:assert/strict";
import test from "node:test";
import { createLoop } from "../src/loop.js";

function withAnimationFrame(run) {
  const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, "performance");
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let nextId = 0;
  const callbacks = new Map();

  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { now: () => 0 },
  });
  globalThis.requestAnimationFrame = (callback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);

  const fireNextFrame = (timestamp) => {
    const [id, callback] = callbacks.entries().next().value ?? [];
    assert.ok(callback, "an animation frame should be scheduled");
    callbacks.delete(id);
    callback(timestamp);
  };

  try {
    run({ callbacks, fireNextFrame });
  } finally {
    if (originalPerformance) {
      Object.defineProperty(globalThis, "performance", originalPerformance);
    } else {
      delete globalThis.performance;
    }

    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    } else {
      delete globalThis.requestAnimationFrame;
    }
    if (originalCancelAnimationFrame) {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    } else {
      delete globalThis.cancelAnimationFrame;
    }
  }
}

test("createLoop advances in fixed steps and renders with interpolation alpha", () => {
  withAnimationFrame(({ fireNextFrame }) => {
    const steps = [];
    const alphas = [];
    const loop = createLoop({
      step: 0.1,
      simulate: (dt) => steps.push(dt),
      render: (alpha) => alphas.push(alpha),
    });

    loop.start();
    fireNextFrame(250);

    assert.deepEqual(steps, [0.1, 0.1]);
    assert.ok(Math.abs(alphas[0] - 0.5) < 1e-10);
    loop.stop();
  });
});

test("createLoop clamps a long frame to a quarter second", () => {
  withAnimationFrame(({ fireNextFrame }) => {
    let steps = 0;
    let alpha;
    const loop = createLoop({
      step: 1 / 60,
      simulate: () => steps++,
      render: (value) => {
        alpha = value;
      },
    });

    loop.start();
    fireNextFrame(1000);

    assert.equal(steps, 15);
    assert.ok(alpha >= 0 && alpha < 1);
    loop.stop();
  });
});

test("createLoop does not schedule frames after stop and start is idempotent", () => {
  withAnimationFrame(({ callbacks }) => {
    let rendered = 0;
    const loop = createLoop({
      simulate: () => {},
      render: () => rendered++,
    });

    loop.start();
    loop.start();
    assert.equal(callbacks.size, 1);
    loop.stop();
    assert.equal(callbacks.size, 0);
    assert.equal(rendered, 0);
  });
});
