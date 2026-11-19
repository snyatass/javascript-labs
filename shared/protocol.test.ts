import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  entityId,
  sequence,
} from "./protocol.ts";
import { createNetWorld, stepNetWorld } from "./sim.ts";

test("binary input round-trips little-endian fields", () => {
  const packet = encodeInput({
    seq: sequence(42),
    thrust: true,
    right: true,
    left: false,
    fire: true,
    angle: 1,
  });
  assert.equal(packet.byteLength, 8);
  const decoded = decodeInput(packet);
  assert.ok(decoded);
  assert.equal(decoded.seq, 42);
  assert.equal(decoded.thrust, true);
  assert.equal(decoded.left, false);
  assert.equal(decoded.right, true);
  assert.equal(decoded.fire, true);
  assert.ok(Math.abs(decoded.angle - 1) < 0.001);
});

test("binary snapshot round-trips deterministic ship state", () => {
  const world = createNetWorld({ width: 800, height: 600, seed: 7 });
  world.ships.set(entityId(1), {
    id: entityId(1),
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
  const snapshot = decodeSnapshot(encodeSnapshot(world, sequence(11)));
  assert.ok(snapshot);
  assert.equal(snapshot.tick, 12);
  assert.equal(snapshot.ack, 11);
  const firstEntity = snapshot.entities[0];
  assert.equal(firstEntity?.kind === "ship" ? firstEntity.id : null, entityId(1));
  assert.equal(firstEntity?.kind, "ship");
  if (firstEntity?.kind === "ship") {
    assert.ok(Math.abs(firstEntity.x - 100) < 0.01);
  }
});

test("shared fixed-step world is deterministic with a seed", () => {
  const first = createNetWorld({ seed: 123 });
  const second = createNetWorld({ seed: 123 });
  first.ships.set(entityId(1), {
    id: entityId(1),
    name: "Pilot",
    x: 400,
    y: 300,
    vx: 0,
    vy: 0,
    angle: 0,
    hp: 3,
    cooldown: 0,
  });
  second.ships.set(entityId(1), {
    id: entityId(1),
    name: "Pilot",
    x: 400,
    y: 300,
    vx: 0,
    vy: 0,
    angle: 0,
    hp: 3,
    cooldown: 0,
  });
  const input = new Map([
    [
      entityId(1),
      { seq: sequence(1), thrust: true, left: false, right: true, fire: false, angle: 0 },
    ],
  ]);
  for (let i = 0; i < 60; i++) {
    stepNetWorld(first, input);
    stepNetWorld(second, input);
  }
  assert.deepEqual(first.ships.get(entityId(1)), second.ships.get(entityId(1)));
});
