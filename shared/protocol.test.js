import assert from "node:assert/strict";
import test from "node:test";
import { decodeInput, decodeSnapshot, encodeInput, encodeSnapshot } from "./protocol.js";
import { createNetWorld, stepNetWorld } from "./sim.js";

test("binary input round-trips little-endian fields", () => {
  const packet = encodeInput({ seq: 42, thrust: true, right: true, fire: true, angle: 1 });
  assert.equal(packet.byteLength, 8);
  const decoded = decodeInput(packet);
  assert.equal(decoded.seq, 42);
  assert.equal(decoded.thrust, true);
  assert.equal(decoded.left, false);
  assert.equal(decoded.right, true);
  assert.equal(decoded.fire, true);
  assert.ok(Math.abs(decoded.angle - 1) < 0.001);
});

test("binary snapshot round-trips deterministic ship state", () => {
  const world = createNetWorld({ width: 800, height: 600, seed: 7 });
  world.ships.set(1, {
    id: 1,
    name: "Nova",
    x: 100,
    y: 200,
    vx: 3,
    vy: 4,
    angle: 0.5,
    hp: 3,
    cooldown: 0,
  });
  world.tick = 12;
  const snapshot = decodeSnapshot(encodeSnapshot(world, 11));
  assert.equal(snapshot.tick, 12);
  assert.equal(snapshot.ack, 11);
  assert.equal(snapshot.ships[0].id, 1);
  assert.ok(Math.abs(snapshot.ships[0].x - 100) < 0.01);
});

test("shared fixed-step world is deterministic with a seed", () => {
  const first = createNetWorld({ seed: 123 });
  const second = createNetWorld({ seed: 123 });
  first.ships.set(1, { id: 1, x: 400, y: 300, vx: 0, vy: 0, angle: 0, hp: 3, cooldown: 0 });
  second.ships.set(1, { id: 1, x: 400, y: 300, vx: 0, vy: 0, angle: 0, hp: 3, cooldown: 0 });
  const input = new Map([[1, { thrust: true, left: false, right: true, fire: false }]]);
  for (let i = 0; i < 60; i++) {
    stepNetWorld(first, input);
    stepNetWorld(second, input);
  }
  assert.deepEqual(first.ships.get(1), second.ships.get(1));
});
