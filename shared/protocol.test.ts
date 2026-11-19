import { expect, test } from "vitest";
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
  expect(packet.byteLength).toBe(8);
  const decoded = decodeInput(packet);
  expect(decoded).not.toBeNull();
  if (!decoded) return;
  expect(decoded.seq).toBe(sequence(42));
  expect(decoded.thrust).toBe(true);
  expect(decoded.left).toBe(false);
  expect(decoded.right).toBe(true);
  expect(decoded.fire).toBe(true);
  expect(Math.abs(decoded.angle - 1)).toBeLessThan(0.001);
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
  expect(snapshot).not.toBeNull();
  if (!snapshot) return;
  expect(snapshot.tick).toBe(12);
  expect(snapshot.ack).toBe(sequence(11));
  const firstEntity = snapshot.entities[0];
  expect(firstEntity?.kind).toBe("ship");
  if (firstEntity?.kind === "ship") {
    expect(Math.abs(firstEntity.x - 100)).toBeLessThan(0.01);
  }
});

test("shared fixed-step world is deterministic with a seed", () => {
  const first = createNetWorld({ seed: 123 });
  const second = createNetWorld({ seed: 123 });
  for (const world of [first, second]) {
    world.ships.set(entityId(1), {
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
  }
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
  expect(first.ships.get(entityId(1))).toEqual(second.ships.get(entityId(1)));
});
