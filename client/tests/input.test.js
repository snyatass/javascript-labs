import assert from "node:assert/strict";
import test from "node:test";
import { createInput } from "../src/input.js";

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((registered) => registered !== listener),
      );
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
}

test("createInput tracks held keys and just-pressed edges", () => {
  const target = createEventTarget();
  const input = createInput(target);

  target.dispatch("keydown", { code: "ArrowUp" });
  assert.equal(input.isDown("ArrowUp"), true);
  assert.equal(input.justPressed("ArrowUp"), true);

  input.consumeJustPressed();
  target.dispatch("keydown", { code: "ArrowUp" });
  assert.equal(input.isDown("ArrowUp"), true);
  assert.equal(input.justPressed("ArrowUp"), false);

  target.dispatch("keyup", { code: "ArrowUp" });
  assert.equal(input.isDown("ArrowUp"), false);

  input.destroy();
});

test("createInput clears keys on blur and removes listeners on destroy", () => {
  const target = createEventTarget();
  const input = createInput(target);

  target.dispatch("keydown", { code: "KeyW" });
  target.dispatch("blur");
  assert.equal(input.isDown("KeyW"), false);
  assert.equal(input.justPressed("KeyW"), false);

  input.destroy();
  target.dispatch("keydown", { code: "KeyW" });
  assert.equal(input.isDown("KeyW"), false);
});
