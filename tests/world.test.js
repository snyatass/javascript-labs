import assert from "node:assert/strict";
import test from "node:test";
import { Asteroid } from "../src/sim/asteroid.js";
import { Bullet } from "../src/sim/bullet.js";
import { circleCollision, detectCollisionPairs } from "../src/sim/collision.js";
import { Entity } from "../src/sim/entity.js";
import { Pickup } from "../src/sim/pickup.js";
import { Ship } from "../src/sim/ship.js";
import { Vector2 } from "../src/sim/vector.js";
import { World } from "../src/sim/world.js";

test("World stores entities in a Map-backed iterable and filters with ofKind", () => {
  const world = new World({ width: 500, height: 400 });
  const ship = world.spawn(new Ship({ pos: new Vector2(50, 50) }));
  const asteroid = world.spawn(new Asteroid({ pos: new Vector2(300, 300) }));

  assert.equal(world.get(ship.id), ship);
  assert.deepEqual([...world], [ship, asteroid]);
  assert.deepEqual([...world.ofKind("ship")], [ship]);
  assert.deepEqual([...world.ofKind("asteroid")], [asteroid]);
});

test("World defers despawn until the end of a step and skips new entities until next step", () => {
  const world = new World({ width: 500, height: 400 });
  const child = new Entity({ kind: "child" });
  let childUpdates = 0;
  child.update = () => childUpdates++;

  const parent = new Entity({ kind: "parent" });
  parent.update = (_dt, _inputs, currentWorld) => {
    currentWorld.despawn(parent.id);
    currentWorld.spawn(child);
  };
  world.spawn(parent);

  world.step(1 / 60);
  assert.equal(world.get(parent.id), undefined);
  assert.equal(world.get(child.id), child);
  assert.equal(childUpdates, 0);

  world.step(1 / 60);
  assert.equal(childUpdates, 1);
});

test("circle collision system reports overlapping circles", () => {
  const world = new World({ width: 500, height: 400 });
  const first = world.spawn(new Ship({ pos: new Vector2(100, 100), radius: 16 }));
  const second = world.spawn(new Asteroid({ pos: new Vector2(125, 100), radius: 10 }));

  assert.equal(circleCollision(first, second), true);
  assert.deepEqual(detectCollisionPairs(world), [[first, second]]);
});

test("circle collision detection respects wrap-around arena edges", () => {
  const world = new World({ width: 100, height: 100 });
  const ship = world.spawn(new Ship({ pos: new Vector2(2, 50) }));
  const asteroid = world.spawn(new Asteroid({ pos: new Vector2(98, 50), radius: 5 }));

  assert.deepEqual(detectCollisionPairs(world), [[ship, asteroid]]);
});

test("hostile bullets damage ships while friendly bullets do not", () => {
  const world = new World({ width: 500, height: 400 });
  const ship = world.spawn(new Ship({ pos: new Vector2(100, 100), invulnerableTime: 0 }));
  const friendly = world.spawn(
    new Bullet({
      pos: new Vector2(100, 100),
      ownerId: ship.id,
      ownerTeam: "player",
    }),
  );
  world.step(0);

  assert.equal(ship.hp, 3);
  assert.equal(world.get(friendly.id), friendly);

  world.spawn(
    new Bullet({
      pos: new Vector2(100, 100),
      ownerId: -1,
      ownerTeam: "enemy",
    }),
  );
  world.step(0);
  assert.equal(ship.hp, 2);
});

test("collecting a pickup grants its effect and removes it from the world", () => {
  const world = new World({ width: 500, height: 400 });
  const ship = world.spawn(new Ship({ pos: new Vector2(100, 100) }));
  const pickup = world.spawn(new Pickup({ pos: new Vector2(100, 100), effect: "rapid" }));

  world.step(0);

  assert.equal(ship.rapidFireTime, 8);
  assert.equal(world.get(pickup.id), undefined);
  assert.deepEqual(world.consumeEvents(), [
    { type: "pickup-collected", effect: "rapid", shipId: ship.id },
  ]);
});
