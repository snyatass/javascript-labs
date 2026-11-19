import assert from "node:assert/strict";
import test from "node:test";
import { interpolateShip } from "../src/render/draw.js";
import { wrapPosition } from "../src/sim/arena.js";
import { createShip, integrate, SHIP_CONFIG } from "../src/sim/ship.js";

test("createShip initializes a stationary ship facing upward", () => {
  assert.deepEqual(createShip(12, 34), {
    x: 12,
    y: 34,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    thrust: false,
  });
});

test("integrate applies turning and thrust without mutating its input", () => {
  const ship = createShip(100, 100);
  const next = integrate(
    ship,
    { isDown: (code) => code === "ArrowRight" || code === "ArrowUp" },
    1 / 60,
  );

  assert.equal(ship.angle, -Math.PI / 2);
  assert.equal(next.angle, -Math.PI / 2 + SHIP_CONFIG.turnSpeed / 60);
  assert.ok(next.vx > 0);
  assert.ok(next.vy < 0);
  assert.equal(next.thrust, true);
});

test("integrate applies drag and caps the ship's speed", () => {
  const ship = { ...createShip(0, 0), vx: 1000, vy: 0 };
  const next = integrate(ship, { isDown: () => false }, 1 / 60);

  assert.ok(Math.hypot(next.vx, next.vy) <= SHIP_CONFIG.maxSpeed);
  assert.ok(next.vx < ship.vx);
});

test("wrapPosition handles negative coordinates and multiple arena crossings", () => {
  const entity = { x: 225, y: -21, vx: 1 };

  assert.deepEqual(wrapPosition(entity, 100, 100), {
    x: 25,
    y: 79,
    vx: 1,
  });
  assert.deepEqual(entity, { x: 225, y: -21, vx: 1 });
});

test("interpolateShip follows the shortest path across position and angle wraps", () => {
  const previous = { x: 99, y: 1, angle: Math.PI - 0.1, thrust: false };
  const current = { x: 1, y: 99, angle: -Math.PI + 0.1, thrust: true };
  const midpoint = interpolateShip(previous, current, 0.5, 100, 100);

  assert.equal(midpoint.x, 0);
  assert.equal(midpoint.y, 0);
  assert.ok(Math.abs(Math.abs(midpoint.angle) - Math.PI) < 1e-10);
  assert.equal(midpoint.thrust, true);
});
